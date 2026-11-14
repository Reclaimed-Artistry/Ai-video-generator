import { AI_STYLES, type AiStyleId, type AspectRatio } from "./types";

/**
 * Generative AI provider layer.
 *
 * Text (scripts, rewrites)   : OpenAI-compatible key → Pollinations key → free Pollinations → null
 * Images (scene visuals)     : Pollinations key → OpenAI key → free Pollinations
 * Video  (scene clips)       : Pollinations key (text-to-video models). There is
 *                              no free text-to-video tier, so without a key the
 *                              studio makes a motion shot from an AI image.
 *
 * The free Pollinations tier allows ~1 request per 45s *per IP* and is
 * best-effort. It rejects browser-origin requests without a Cloudflare
 * Turnstile token, so every call is made server-side: image calls surface
 * rate limits as AiRateLimitError (the studio counts down and retries) and
 * text calls degrade to the built-in script engine.
 */

export type TextProvider = "openai" | "pollinations" | "pollinations-free" | "none";
export type ImageProvider = "pollinations" | "openai" | "pollinations-free";

export class AiRateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter = 45) {
    super(message);
    this.name = "AiRateLimitError";
    this.retryAfter = retryAfter;
  }
}

const FREE_TIER_ENABLED = process.env.AI_FREE_TIER !== "off";
/** Overridable for self-hosted gateways and tests. */
const POLLINATIONS_GEN_URL = (process.env.POLLINATIONS_GEN_URL || "https://gen.pollinations.ai").replace(/\/$/, "");

export function textProvider(): TextProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.POLLINATIONS_API_KEY) return "pollinations";
  if (FREE_TIER_ENABLED) return "pollinations-free";
  return "none";
}

export function imageProvider(): ImageProvider {
  if (process.env.POLLINATIONS_API_KEY) return "pollinations";
  if (process.env.OPENAI_API_KEY && process.env.AI_IMAGES_OPENAI !== "off") return "openai";
  return "pollinations-free";
}

export type VideoProvider = "pollinations" | "none";

export function videoProvider(): VideoProvider {
  if (process.env.POLLINATIONS_API_KEY && process.env.AI_VIDEO !== "off") return "pollinations";
  return "none";
}

/** Cheapest solid default (0.01 pollen / second, 5s clips). Override with AI_VIDEO_MODEL. */
export function videoModel(): string {
  return process.env.AI_VIDEO_MODEL || "alibaba/wan-2.2-fast";
}

export function videoDuration(): number {
  const requested = Number(process.env.AI_VIDEO_DURATION);
  return Number.isFinite(requested) && requested >= 2 && requested <= 15 ? Math.round(requested) : 5;
}

export function aiStatus() {
  const text = textProvider();
  const image = imageProvider();
  const video = videoProvider();
  return {
    video,
    characterLabel:
      video === "pollinations"
        ? `Image-to-video: ${imageToVideoModel()} · Lip-sync: ${lipsyncModel()}`
        : "Not configured: image-to-video and lip-sync need POLLINATIONS_API_KEY",
    videoLabel:
      video === "pollinations"
        ? `Pollinations text-to-video (${videoModel()}, ${videoDuration()}s clips)`
        : "Not configured: add POLLINATIONS_API_KEY for real AI video (AI image + camera motion is used instead)",
    text,
    image,
    imageMode: "server" as const,
    freeTier: text === "pollinations-free" || image === "pollinations-free",
    textLabel:
      text === "openai"
        ? `OpenAI-compatible (${process.env.AI_TEXT_MODEL || "gpt-4o-mini"})`
        : text === "pollinations"
          ? "Pollinations (API key)"
          : text === "pollinations-free"
            ? "Pollinations free tier (rate-limited)"
            : "Built-in script engine",
    imageLabel:
      image === "pollinations"
        ? "Pollinations Flux (API key)"
        : image === "openai"
          ? "OpenAI gpt-image-1"
          : "Pollinations Flux free tier (shared, about 1 image per 45s)",
  };
}

// ─── Text ─────────────────────────────────────────────────────────────────

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Pull the first JSON object out of a model reply (tolerates prose / code fences). */
export function extractJson<T>(content: string): T | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function postChat(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (response.status === 402 || response.status === 429) return null;
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the best available LLM for a JSON object. Returns null (never throws)
 * when no provider can answer, so callers fall back to the built-in engine.
 */
export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<{ data: T; provider: TextProvider } | null> {
  const temperature = opts.temperature ?? 0.75;
  const timeoutMs = opts.timeoutMs ?? 40_000;
  const provider = textProvider();

  if (provider === "openai") {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const content = await postChat(
      `${base}/chat/completions`,
      {
        model: process.env.AI_TEXT_MODEL || "gpt-4o-mini",
        temperature,
        response_format: { type: "json_object" },
        messages,
      },
      { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeoutMs,
    );
    const data = content ? extractJson<T>(content) : null;
    return data ? { data, provider } : null;
  }

  if (provider === "pollinations") {
    const content = await postChat(
      "https://gen.pollinations.ai/v1/chat/completions",
      {
        model: process.env.AI_TEXT_MODEL || "openai",
        temperature,
        response_format: { type: "json_object" },
        messages,
      },
      { authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` },
      timeoutMs,
    );
    const data = content ? extractJson<T>(content) : null;
    return data ? { data, provider } : null;
  }

  if (provider === "pollinations-free") {
    const content = await postChat(
      "https://text.pollinations.ai/openai",
      { model: "openai", messages, seed: Math.floor(Math.random() * 1e6) },
      {},
      timeoutMs,
    );
    const data = content ? extractJson<T>(content) : null;
    return data ? { data, provider } : null;
  }

  return null;
}

// ─── Images ───────────────────────────────────────────────────────────────

const NEGATIVE_HINT = "no text, no watermark, no logo, no captions";

/** Compose the final text-to-image prompt from a scene prompt and a style preset. */
export function buildImagePrompt(scenePrompt: string, style: AiStyleId = "cinematic"): string {
  const clean = scenePrompt.replace(/\s+/g, " ").trim().slice(0, 600);
  const preset = AI_STYLES[style] ?? AI_STYLES.cinematic;
  return `${clean}. ${preset.suffix}. ${NEGATIVE_HINT}`;
}

export function imageSize(
  aspect: AspectRatio,
  tier: "free" | "hd",
): { width: number; height: number } {
  if (tier === "free") {
    if (aspect === "9:16") return { width: 576, height: 1024 };
    if (aspect === "1:1") return { width: 1024, height: 1024 };
    return { width: 1024, height: 576 };
  }
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  if (aspect === "1:1") return { width: 1440, height: 1440 };
  return { width: 1920, height: 1080 };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

/** Public free-tier URL a browser can fetch directly (CORS is open). */
export function freeImageUrl(prompt: string, aspect: AspectRatio, seed: number): string {
  const { width, height } = imageSize(aspect, "free");
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: "flux",
    nologo: "true",
    private: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfter(response: Response, body: string, fallback: number): number {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(120, Math.ceil(header));
  const match = /retry after (\d+)\s*s/i.exec(body);
  return match ? Math.min(120, Number(match[1])) : fallback;
}

/** Free Classic API, called server-side (browser origins need a Turnstile token). */
async function generateFreeImage(
  prompt: string,
  aspect: AspectRatio,
  seed: number,
): Promise<{ data: Buffer; contentType: string; provider: ImageProvider }> {
  const response = await fetchWithTimeout(freeImageUrl(prompt, aspect, seed), {}, 90_000);
  const type = response.headers.get("content-type") ?? "";
  if (response.ok && type.startsWith("image/")) {
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: type,
      provider: "pollinations-free",
    };
  }
  const body = await response.text().catch(() => "");
  if (response.status === 402 || response.status === 429) {
    throw new AiRateLimitError(
      "Free tier allows about 1 image every 45 seconds.",
      parseRetryAfter(response, body, 45),
    );
  }
  if (response.status === 503) {
    throw new AiRateLimitError("The free image service is at capacity right now.", 20);
  }
  throw new Error(
    `The free image service returned an error (${response.status}). Add POLLINATIONS_API_KEY or OPENAI_API_KEY for reliable generation.`,
  );
}

/**
 * Generate an image on the server: keyed provider when configured, otherwise
 * the free Classic API. Throws AiRateLimitError when the caller should wait.
 */
export async function generateImageOnServer(
  prompt: string,
  aspect: AspectRatio,
  seed: number,
): Promise<{ data: Buffer; contentType: string; provider: ImageProvider }> {
  const provider = imageProvider();

  if (provider === "pollinations-free") {
    return generateFreeImage(prompt, aspect, seed);
  }

  if (provider === "pollinations") {
    const { width, height } = imageSize(aspect, "hd");
    const params = new URLSearchParams({
      model: process.env.AI_IMAGE_MODEL || "flux",
      width: String(width),
      height: String(height),
      seed: String(seed),
      nologo: "true",
      private: "true",
    });
    const response = await fetchWithTimeout(
      `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params}`,
      { headers: { authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } },
      90_000,
    );
    if (response.status === 402 || response.status === 429) {
      throw new AiRateLimitError(
        "The image service is busy or your Pollinations balance is empty.",
        Number(response.headers.get("retry-after")) || 30,
      );
    }
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) {
      throw new Error(`Image generation failed (${response.status})`);
    }
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: type,
      provider,
    };
  }

  if (provider === "openai") {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const size = aspect === "9:16" ? "1024x1536" : aspect === "1:1" ? "1024x1024" : "1536x1024";
    const response = await fetchWithTimeout(
      `${base}/images/generations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.AI_IMAGE_MODEL || "gpt-image-1",
          prompt,
          size,
          n: 1,
        }),
      },
      120_000,
    );
    if (response.status === 429) {
      throw new AiRateLimitError("OpenAI image rate limit reached.", 30);
    }
    const json = (await response.json().catch(() => null)) as {
      data?: { b64_json?: string; url?: string }[];
      error?: { message?: string };
    } | null;
    if (!response.ok || !json?.data?.[0]) {
      throw new Error(json?.error?.message || `Image generation failed (${response.status})`);
    }
    const item = json.data[0];
    if (item.b64_json) {
      return { data: Buffer.from(item.b64_json, "base64"), contentType: "image/png", provider };
    }
    if (item.url) {
      const img = await fetchWithTimeout(item.url, {}, 60_000);
      return {
        data: Buffer.from(await img.arrayBuffer()),
        contentType: img.headers.get("content-type") ?? "image/png",
        provider,
      };
    }
    throw new Error("Image generation returned no data");
  }

  return generateFreeImage(prompt, aspect, seed);
}

// ─── Video ────────────────────────────────────────────────────────────────

export class AiVideoUnavailableError extends Error {
  constructor() {
    super(
      "Real AI video needs a Pollinations API key (POLLINATIONS_API_KEY). There is no free text-to-video service.",
    );
    this.name = "AiVideoUnavailableError";
  }
}

/** Model for image-to-video (animate a still). Override with AI_I2V_MODEL. */
export function imageToVideoModel(): string {
  return process.env.AI_I2V_MODEL || "alibaba/wan-2.2-fast";
}

/** Audio-driven model for lip-synced talking characters. Override with AI_LIPSYNC_MODEL. */
export function lipsyncModel(): string {
  return process.env.AI_LIPSYNC_MODEL || "alibaba/wan-3.0";
}

async function requestPollinationsVideo(
  prompt: string,
  params: Record<string, string>,
): Promise<{ data: Buffer; contentType: string; provider: VideoProvider; model: string }> {
  if (videoProvider() === "none") throw new AiVideoUnavailableError();
  const query = new URLSearchParams({ audio: "false", ...params });
  const response = await fetchWithTimeout(
    `${POLLINATIONS_GEN_URL}/video/${encodeURIComponent(prompt)}?${query}`,
    { headers: { authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } },
    285_000,
  );
  const type = response.headers.get("content-type") ?? "";
  if (response.ok && type.startsWith("video/")) {
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: type,
      provider: "pollinations",
      model: params.model,
    };
  }
  const body = await response.text().catch(() => "");
  let message = "";
  try {
    message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    message = body.slice(0, 200);
  }
  if (response.status === 429) {
    throw new AiRateLimitError("The video service is busy.", parseRetryAfter(response, body, 30));
  }
  if (response.status === 402) {
    throw new Error("Your Pollinations balance is too low for video generation. Top up at enter.pollinations.ai.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("Pollinations rejected the API key for video generation. Check POLLINATIONS_API_KEY.");
  }
  throw new Error(`Video generation failed (${response.status})${message ? `: ${message}` : ""}`);
}

/** Text-to-video clip (Pollinations returns the finished MP4 in the response). */
export async function generateVideoOnServer(
  prompt: string,
  aspect: AspectRatio,
  seed: number,
): Promise<{ data: Buffer; contentType: string; provider: VideoProvider; model: string }> {
  return requestPollinationsVideo(prompt, {
    model: videoModel(),
    duration: String(videoDuration()),
    aspectRatio: aspect,
    seed: String(seed),
  });
}

/**
 * Animate a character image. With `audioUrl` the clip is audio-driven, so the
 * character lip-syncs to that voiceover; without it, the still is brought to
 * life with natural motion. Both URLs must be publicly reachable.
 */
export async function generateCharacterVideo(args: {
  prompt: string;
  imageUrl: string;
  audioUrl?: string | null;
  aspect: AspectRatio;
  seed: number;
  durationSec: number;
}): Promise<{ data: Buffer; contentType: string; provider: VideoProvider; model: string }> {
  const lipsync = Boolean(args.audioUrl);
  return requestPollinationsVideo(args.prompt, {
    model: lipsync ? lipsyncModel() : imageToVideoModel(),
    duration: String(Math.max(2, Math.min(15, Math.ceil(args.durationSec)))),
    aspectRatio: args.aspect,
    seed: String(args.seed),
    image: args.imageUrl,
    ...(lipsync && args.audioUrl ? { reference_audios: args.audioUrl } : {}),
  });
}

/**
 * Providers fetch reference media themselves, so stored references must be
 * absolute public URLs. `origin` is the public site URL (PUBLIC_APP_URL or the
 * incoming request's origin).
 */
export function toPublicMediaUrl(reference: string, origin: string): string {
  if (/^https:\/\//i.test(reference)) return reference;
  if (reference.startsWith("data:")) {
    throw new Error(
      "This media only lives inside the project. Connect Vercel Blob or a Postgres database so the AI service can fetch it.",
    );
  }
  if (reference.startsWith("/")) {
    const base = origin.replace(/\/$/, "");
    if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(base)) {
      throw new Error(
        "The AI service cannot reach localhost. Deploy the site, set PUBLIC_APP_URL to its public address, or connect Vercel Blob.",
      );
    }
    return `${base}${reference}`;
  }
  if (/^http:\/\//i.test(reference)) return reference;
  throw new Error("Unsupported media reference");
}
