"use client";

import type { AiStyleId, AspectRatio } from "./types";

export type GeneratedImage = {
  url: string;
  seed: number;
  provider: string;
};

export type AiStatus = {
  text: string;
  image: string;
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

/** Retry through rate limits, reporting each wait so the UI can count down. */
export async function generateWithRetry(
  args: Parameters<typeof generateSceneImage>[0],
  onWait: (secondsLeft: number) => void,
  maxAttempts = 5,
): Promise<GeneratedImage> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (args.signal?.aborted) throw new Error("Cancelled");
    try {
      return await generateSceneImage(args);
    } catch (error) {
      lastError = error;
      if (!(error instanceof RateLimitError)) throw error;
      for (let left = error.retryAfter + 1; left > 0; left -= 1) {
        if (args.signal?.aborted) throw new Error("Cancelled");
        onWait(left);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      onWait(0);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Image generation failed");
}
