import fs from "node:fs/promises";

import { geminiAuthHeaders } from "./gemini";
import { generateSceneVideo } from "./video";
import { parseModelJson } from "./script-intelligence";
import { AI_STYLES, type AiStyleId, type AspectRatio } from "./types";

/**
 * Generative AI provider layer.
 *
 * Text (scripts, rewrites)   : OpenAI → Gemini → Groq → null. Gemini and Groq
 *                              both have free tiers and speak the OpenAI wire
 *                              format, so script drafting needs no card. With
 *                              no key at all the built-in beat engine is used.
 * Images (scene visuals)     : OpenAI key, or none (procedural/stock plates).
 * Video  (scene clips)       : Replicate (HunyuanVideo) when
 *                              REPLICATE_API_TOKEN is set, else none. There is
 *                              no free text-to-video tier, so without a key the
 *                              studio makes a motion shot from an AI image.
 *
 * Pollinations was removed: the free tier allows ~1 request per 45s *per IP*,
 * and it rejects browser-origin requests without a Cloudflare Turnstile token.
 * Every call is made server-side; rate limits surface as AiRateLimitError so
 * the studio can count down and retry.


 */

export type TextProvider = "openai" | "gemini" | "groq" | "none";
export type ImageProvider = "openai" | "none";

export class AiRateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter = 45) {
    super(message);
    this.name = "AiRateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Resolved credentials + endpoint for whichever text provider is configured.
 * Gemini and Groq both expose an OpenAI-compatible `/chat/completions`, so
 * only the base URL, key, model and auth header differ. Model names churn on
 * both, so each default is overridable via `<PROVIDER>_TEXT_MODEL`.
 */
type LlmConfig = {
  label: string;
  baseUrl: string;
  key: string;
  model: string;
  /** Gemini `AQ.` keys are rejected as bearer tokens; they need x-goog-api-key. */
  authHeaders: Record<string, string>;
  /** Provider-specific fields the others do not accept. */
  extras: Record<string, unknown>;
};

function llmConfig(): LlmConfig | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      label: "OpenAI",
      // LLM_BASE_URL lets you point any provider at a proxy or self-hosted
      // gateway (OpenRouter, LiteLLM, a corporate egress proxy).
      baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      authHeaders: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      extras: {},
    };
  }

  // Free tier is roughly 15 RPM / 500 RPD. Note the `/openai` segment: the
  // native Gemini endpoint has a different request shape.
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gemini) {
    return {
      label: "Gemini",
      baseUrl: (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""),
      key: gemini,
      model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
      authHeaders: geminiAuthHeaders(gemini),
      // Deliberately empty by default. Flash models think before answering and
      // those tokens come out of the same output budget, but Google only
      // documents `reasoning_effort` for the 3.x models — for 2.5 it is
      // inconsistent (some clients reject it as an unsupported param) and a
      // rejected param is a 400 that kills script generation. A generous token
      // budget covers the overhead instead. Opt in with
      // GEMINI_REASONING_EFFORT=low|medium|high|none on a 3.x model.
      extras: process.env.GEMINI_REASONING_EFFORT
        ? { reasoning_effort: process.env.GEMINI_REASONING_EFFORT }
        : {},
    };
  }

  // Free tier is 30 RPM / 1,000 RPD / 200K tokens a day per model. Do not use
  // the old `llama-3.3-70b-versatile` quickstart default — Groq retired it
  // from the free and developer tiers.
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
    return {
      label: "Groq",
      baseUrl: (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
      key: process.env.GROQ_API_KEY,
      model,
      authHeaders: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      // `reasoning_effort` is only understood by the gpt-oss reasoning models;
      // sending it to a plain chat model on Groq is rejected.
      extras: model.includes("gpt-oss") ? { reasoning_effort: "low" } : {},
    };
  }

  return null;
}

export function textProvider(): TextProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  return "none";
}

export function imageProvider(): ImageProvider {
  if (process.env.OPENAI_API_KEY && process.env.AI_IMAGES_OPENAI !== "off") return "openai";
  return "none";
}

export type VideoProvider = "replicate" | "none";

export function videoProvider(): VideoProvider {
  if (process.env.REPLICATE_API_TOKEN && process.env.AI_VIDEO !== "off") return "replicate";
  return "none";
}

/** Replicate text-to-video model. Override with AI_VIDEO_MODEL. */
export function videoModel(): string {
  return process.env.AI_VIDEO_MODEL || "tencent/hunyuan-video";
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
      "Not configured: image-to-video and lip-sync need a provider that supports them (AI image + camera motion is used instead)",
    videoLabel:
      video === "replicate"
        ? `Replicate text-to-video (${videoModel()}, ${videoDuration()}s clips)`
        : "Not configured: add REPLICATE_API_TOKEN for real AI video (AI image + camera motion is used instead)",
    text,
    image,
    imageMode: "server" as const,
    freeTier: text === "gemini" || text === "groq",
    textLabel:
      text === "openai"
        ? `OpenAI (${process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini"})`
        : text === "gemini"
          ? `Gemini (${process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash"}, free tier)`
          : text === "groq"
            ? `Groq (${process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b"}, free tier)`
            : "Built-in script engine",
    imageLabel:
      image === "openai"
        ? "OpenAI gpt-image-1"
        : "Not configured: add OPENAI_API_KEY for AI images (procedural + stock footage is used instead)",
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

type ChatResult = { content: string | null; retryAfter: number | null };

async function postChat(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (response.status === 402 || response.status === 429) {
      const text = await response.text().catch(() => "");
      return { content: null, retryAfter: parseRetryAfter(response, text, 45) };
    }
    if (!response.ok) return { content: null, retryAfter: null };
    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    return { content: data?.choices?.[0]?.message?.content ?? null, retryAfter: null };
  } catch {
    return { content: null, retryAfter: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the best available LLM for a JSON object. Never throws: returns null
 * when no provider answers in time, so callers fall back to the built-in
 * engine. Small-model JSON mistakes are repaired (parseModelJson) and, if a
 * `salvage` function is given, fields are recovered from malformed replies.
 * When the provider says "retry after N s" and the deadline allows, it waits
 * and tries once more instead of giving up.
 */
export async function chatJSON<T>(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    timeoutMs?: number;
    /** Absolute time (ms) by which an answer is needed. */
    deadline?: number;
    salvage?: (content: string) => T | null;
  } = {},
): Promise<{ data: T; provider: TextProvider } | null> {
  const temperature = opts.temperature ?? 0.8;
  const provider = textProvider();
  if (provider === "none") return null;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const deadline = opts.deadline ?? Date.now() + timeoutMs;

  const request = (budget: number): Promise<ChatResult> => {
    const llm = llmConfig();
    if (!llm) throw new Error("No text provider configured");
    return postChat(
      `${llm.baseUrl}/chat/completions`,
      {
        model: llm.model,
        temperature,
        ...(process.env.LLM_JSON_MODE !== "off" ? { response_format: { type: "json_object" } } : {}),
        ...llm.extras,
        messages,
      },
      llm.authHeaders,
      budget,
    );
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const budget = Math.min(timeoutMs, deadline - Date.now());
    if (budget < 8_000) return null;
    const result = await request(budget);
    if (result.content) {
      const data = parseModelJson<T>(result.content) ?? opts.salvage?.(result.content) ?? null;
      return data ? { data, provider } : null;
    }
    // Rate-limited: wait it out once if there is still time for a full reply.
    if (result.retryAfter !== null && Date.now() + result.retryAfter * 1000 + 20_000 < deadline) {
      await new Promise((resolve) => setTimeout(resolve, (result.retryAfter! + 1) * 1000));
      continue;
    }
    return null;
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

  throw new Error(
    "No image provider configured. Set OPENAI_API_KEY to generate scene art (procedural and stock footage is used without it).",
  );
}

// ─── Video ────────────────────────────────────────────────────────────────

export class AiVideoUnavailableError extends Error {
  constructor() {
    super(
      "Real AI video needs a Replicate API token (REPLICATE_API_TOKEN). There is no free text-to-video service.",
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

/** Text-to-video clip. Replicate returns a finished MP4 we read off disk. */
export async function generateVideoOnServer(
  prompt: string,
  aspect: AspectRatio,
  seed: number,
): Promise<{ data: Buffer; contentType: string; provider: VideoProvider; model: string }> {
  if (videoProvider() === "none") throw new AiVideoUnavailableError();
  const { width, height } = imageSize(aspect, "hd");
  const clip = await generateSceneVideo({
    prompt,
    duration: videoDuration(),
    width,
    height,
    aspect,
    seed,
  });
  // generateSceneVideo swallows provider errors and returns null rather than
  // throwing, which would surface here as a confusing "no data" failure.
  if (!clip) throw new AiVideoUnavailableError();
  return {
    data: await fs.readFile(clip.file),
    contentType: "video/mp4",
    provider: "replicate",
    model: clip.model,
  };
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
  if (videoProvider() === "none") throw new AiVideoUnavailableError();
  // HunyuanVideo is text-to-video only: it has no image or audio conditioning,
  // so animating a still or lip-syncing it is not something this provider can
  // do. Keep the guard explicit instead of silently ignoring the inputs.
  throw new Error(
    "Animating a character image needs a provider with an image-to-video or lip-sync model. Replicate HunyuanVideo only does text-to-video.",
  );
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

/**
 * Live end-to-end check of the configured text LLM.
 *
 * Sends one real script-shaped request through the exact production body and
 * reports what came back, so a broken key, a retired model name or truncated
 * JSON is visible instead of silently degrading to the built-in script engine.
 * A `models.list` style call is not enough: Gemini happily answers that with
 * 200 while `generateContent` 401s on a bad key.
 */
export async function llmProbe(): Promise<Record<string, unknown>> {
  const llm = llmConfig();
  if (!llm) {
    return { configured: false, reason: "No LLM key set (OPENAI / GEMINI / GROQ)." };
  }

  const messages = [
    { role: "system", content: 'Reply with JSON only: {"scenes":[{"narration":"..."}]}' },
    {
      role: "user",
      content:
        'Write a 2-scene storyboard about "a calm ocean sunrise". Return JSON: {"scenes":[{"narration":"...","caption":"...","mediaQuery":"..."}]}',
    },
  ];

  const report: Record<string, unknown> = {
    configured: true,
    provider: llm.label,
    model: llm.model,
    url: `${llm.baseUrl}/chat/completions`,
    authHeader: Object.keys(llm.authHeaders).join(","),
  };

  const started = Date.now();
  try {
    const response = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...llm.authHeaders },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0.8,
        ...(process.env.LLM_JSON_MODE !== "off" ? { response_format: { type: "json_object" } } : {}),
        ...llm.extras,
        messages,
      }),
    });
    report.httpStatus = response.status;
    report.elapsedMs = Date.now() - started;

    if (!response.ok) {
      report.ok = false;
      report.error = (await response.text().catch(() => "")).slice(0, 600);
      return report;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: Record<string, unknown>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    report.finishReason = data.choices?.[0]?.finish_reason ?? null;
    report.usage = data.usage ?? null;
    report.replyChars = content.length;

    const parsed = parseModelJson<{ scenes?: unknown[] }>(content);
    report.parsedScenes = parsed?.scenes?.length ?? null;
    report.ok = Boolean(parsed?.scenes?.length);
    if (!report.ok) report.error = "Reply did not contain a parseable scenes array";
    return report;
  } catch (error) {
    report.ok = false;
    report.elapsedMs = Date.now() - started;
    report.error = error instanceof Error ? error.message : String(error);
    return report;
  }
}
