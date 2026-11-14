"use client";

import type { AiKind, AiStyleId, AspectRatio } from "./types";

export type GeneratedImage = {
  url: string;
  seed: number;
  provider: string;
};

export type AiStatus = {
  text: string;
  image: string;
  video: "pollinations" | "none";
  videoLabel: string;
  characterLabel: string;
  imageMode: "server";
  freeTier: boolean;
  textLabel: string;
  imageLabel: string;
};

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Generate one scene image. The server calls the image provider, stores the
 * result once, and answers with its URL (or 429 + retryAfter when busy).
 */
export async function generateSceneImage(args: {
  prompt: string;
  style: AiStyleId;
  aspect: AspectRatio;
  projectId: string;
  seed?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImage> {
  let response: Response;
  try {
    response = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: args.prompt,
        style: args.style,
        aspect: args.aspect,
        seed: args.seed,
        projectId: args.projectId,
      }),
      signal: args.signal,
    });
  } catch {
    throw new Error(args.signal?.aborted ? "Cancelled" : "Could not reach the server.");
  }
  const data = (await response.json().catch(() => ({}))) as {
    url?: string;
    seed?: number;
    provider?: string;
    error?: string;
    retryAfter?: number;
  };
  if (response.status === 429) {
    throw new RateLimitError(data.error ?? "The image service is busy.", data.retryAfter ?? 30);
  }
  if (!response.ok || !data.url) throw new Error(data.error ?? "Image generation failed");
  return { url: data.url, seed: data.seed ?? 0, provider: data.provider ?? "server" };
}

export type GeneratedVideo = {
  url: string;
  thumbUrl: string | null;
  seed: number;
  provider: string;
  model: string;
};

/** Thrown when no text-to-video provider is configured (no free tier exists). */
export class VideoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoUnavailableError";
  }
}

/** Generate one real AI video clip for a scene (can take a minute or two). */
export async function generateSceneVideo(args: {
  prompt: string;
  style: AiStyleId;
  aspect: AspectRatio;
  projectId: string;
  seed?: number;
  signal?: AbortSignal;
}): Promise<GeneratedVideo> {
  let response: Response;
  try {
    response = await fetch("/api/ai/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: args.signal,
    });
  } catch {
    throw new Error(args.signal?.aborted ? "Cancelled" : "Could not reach the server.");
  }
  const data = (await response.json().catch(() => ({}))) as {
    url?: string;
    thumbUrl?: string | null;
    seed?: number;
    provider?: string;
    model?: string;
    error?: string;
    retryAfter?: number;
  };
  if (response.status === 409) {
    throw new VideoUnavailableError(data.error ?? "AI video is not configured.");
  }
  if (response.status === 429) {
    throw new RateLimitError(data.error ?? "The video service is busy.", data.retryAfter ?? 30);
  }
  if (!response.ok || !data.url) throw new Error(data.error ?? "Video generation failed");
  return {
    url: data.url,
    thumbUrl: data.thumbUrl ?? null,
    seed: data.seed ?? 0,
    provider: data.provider ?? "pollinations",
    model: data.model ?? "",
  };
}

/** Retry any generation through rate limits, reporting each wait for a countdown. */
export async function withRetry<T>(
  task: () => Promise<T>,
  onWait: (secondsLeft: number) => void,
  signal?: AbortSignal,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new Error("Cancelled");
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!(error instanceof RateLimitError)) throw error;
      for (let left = error.retryAfter + 1; left > 0; left -= 1) {
        if (signal?.aborted) throw new Error("Cancelled");
        onWait(left);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      onWait(0);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Generation failed");
}

export function generateWithRetry(
  args: Parameters<typeof generateSceneImage>[0],
  onWait: (secondsLeft: number) => void,
): Promise<GeneratedImage> {
  return withRetry(() => generateSceneImage(args), onWait, args.signal);
}

// ─── Natural-language generation requests ("generate a video of …") ─────────

export type GenerateIntent = {
  /** "stickman" = built-in animation; "lipsync" = make the scene character talk. */
  kind: AiKind | "stickman" | "lipsync";
  /** "active" scene, "all" scenes, or a zero-based scene index. */
  target: "active" | "all" | number;
  prompt: string | null;
};

export const AI_GENERATE_EVENT = "reclaimed-artistry:ai-generate";

const VIDEO_NOUNS = "videos?|clips?|footage|animations?|motion|shots?|b-?roll";
const IMAGE_NOUNS = "images?|pictures?|photos?|photographs?|illustrations?|stills?|artwork|drawings?|paintings?";
const INTENT_RE = new RegExp(
  `\\b(?:generate|create|make|produce|give\\s+me|show\\s+me|draw|paint|imagine|add)\\s+(?:me\\s+)?(?:an?\\s+|some\\s+|new\\s+|another\\s+)?(?:ai[\\s-]+(?:generated\\s+)?)?(?:(?:short|quick|cinematic|realistic|beautiful|epic|dramatic|slow[\\s-]motion|aerial|close[\\s-]up|4k|hd|photorealistic)\\s+){0,3}(${VIDEO_NOUNS}|${IMAGE_NOUNS})\\b(?=\\s+(?:of|showing|depicting|with|for|about|where|that)\\b|\\s*[:,]|\\s*$)`,
  "i",
);

/**
 * Recognise requests like "generate a video of waves at dusk for scene 2" or
 * "make AI images for every scene". Ordinary edits ("make the video shorter")
 * do not match and still go to the edit-command engine.
 */
function intentTarget(text: string): GenerateIntent["target"] {
  if (/\b(?:all|every|each)\s+(?:of\s+the\s+)?scenes?\b/i.test(text)) return "all";
  const sceneNum = /\bscene\s*#?\s*(\d{1,2})\b/i.exec(text);
  return sceneNum ? Math.max(0, Number(sceneNum[1]) - 1) : "active";
}

export function parseGenerateIntent(input: string): GenerateIntent | null {
  const text = input.trim();
  // "make the character talk", "lip-sync scene 2"
  if (/\blip[\s-]?sync\b|\bmake\s+(?:it|him|her|them|the\s+(?:character|person|avatar))\s+(?:talk|speak)\b/i.test(text)) {
    return { kind: "lipsync", target: intentTarget(text), prompt: null };
  }
  // "use stickman animation for every scene", "make a stick figure video of …"
  if (
    /\bstick\s?(?:man|men|figures?)\b/i.test(text) &&
    /\b(?:use|switch|turn|make|generate|create|animate|convert|change)\b/i.test(text)
  ) {
    return { kind: "stickman", target: intentTarget(text), prompt: null };
  }
  const match = INTENT_RE.exec(text);
  if (!match) return null;
  const noun = match[1].toLowerCase();
  const kind: AiKind = new RegExp(`^(?:${IMAGE_NOUNS})$`, "i").test(noun) ? "image" : "video";

  let target: GenerateIntent["target"] = "active";
  if (/\b(?:all|every|each)\s+(?:of\s+the\s+)?scenes?\b/i.test(text)) target = "all";
  const sceneNum = /\bscene\s*#?\s*(\d{1,2})\b/i.exec(text);
  if (sceneNum) target = Math.max(0, Number(sceneNum[1]) - 1);

  const after = text.slice(match.index + match[0].length);
  const subject = /^\s*(?:of|showing|depicting|with|about|where|that|:|,)\s*(.+)$/i.exec(after);
  let prompt = subject ? subject[1] : "";
  prompt = prompt
    .replace(/\s+(?:for|in|on)\s+(?:all|every|each)\s+(?:of\s+the\s+)?scenes?\b.*$/i, "")
    .replace(/\s+(?:for|in|on)\s+scene\s*#?\s*\d{1,2}\b.*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  return { kind, target, prompt: prompt.length >= 3 ? prompt : null };
}
