import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { flaqKey, generateFlaqMedia } from "./flaq";
import type { AspectRatio } from "./types";

/**
 * Text-to-video generation for scene footage.
 *
 * HunyuanVideo is open-weight (https://github.com/Tencent-Hunyuan/HunyuanVideo)
 * but it is not a hosted API: the official requirements are an NVIDIA CUDA GPU
 * with ~45GB peak VRAM at the smallest supported setting (544x960x129f), tested
 * on a single 80GB card. That rules out running it inside this app — and rules
 * out serverless platforms like Vercel entirely. So we reach it through the
 * hosted replicas of the same model (Replicate runs the official
 * `tencent/hunyuan-video`), which is the only way a Next.js app can use it.
 */

export type AiVideoProvider = "flaq" | "hunyuan" | "none";

/**
 * When to spend money and wall-clock time generating footage.
 * - `fallback` (default): only for scenes with no usable stock clip, i.e. it
 *   replaces the on-device procedural plate rather than displacing cheap,
 *   already-licensed stock footage.
 * - `always`: generate for every scene that has no uploaded/generated asset.
 * - `off`: never generate; keep the existing behaviour.
 */
export type AiVideoMode = "always" | "fallback" | "off";

/** Replicate caps `video_length`, and HunyuanVideo wants 4k+1 frame counts. */
const HUNYUAN_MAX_FRAMES = 129;
const HUNYUAN_FPS = 24;

const DEFAULT_HUNYUAN_MODEL = "tencent/hunyuan-video";

/** Verbatim from Flaq's own per-model curl examples. */
const DEFAULT_FLAQ_VIDEO_MODEL = "seedance-v2.5-text-to-video";

/** Provider chosen from whichever key is present. */
export function activeAiVideoProvider(): AiVideoProvider {
  // Flaq first: one key covers several features, so prefer it when present.
  if (flaqKey()) return "flaq";
  if (process.env.REPLICATE_API_TOKEN) return "hunyuan";
  return "none";
}

export function aiVideoMode(): AiVideoMode {
  const raw = (process.env.AI_VIDEO_MODE || "fallback").trim().toLowerCase();
  if (raw === "always" || raw === "off" || raw === "fallback") return raw;
  return "fallback";
}

export function aiVideoEnabled(): boolean {
  return aiVideoMode() !== "off" && activeAiVideoProvider() !== "none";
}

export type AiVideoStatus = {
  provider: AiVideoProvider;
  configured: boolean;
  label: string;
  note: string;
  mode: AiVideoMode;
  model: string;
};

export function aiVideoStatus(): AiVideoStatus {
  const provider = activeAiVideoProvider();
  const mode = aiVideoMode();
  const labels: Record<AiVideoProvider, string> = {
    flaq: "Flaq AI Video",
    hunyuan: "HunyuanVideo",
    none: "Not configured",
  };
  const notes: Record<AiVideoProvider, string> = {
    flaq: "Seedance / Kling / Wan scene footage via Flaq AI.",
    hunyuan: "HunyuanVideo scene footage via Replicate.",
    none: "No video API key found — scenes use stock clips, or an AI still with camera motion.",
  };
  return {
    provider,
    configured: provider !== "none" && mode !== "off",
    label: labels[provider],
    note: notes[provider],
    mode,
    model:
      provider === "flaq"
        ? process.env.FLAQ_VIDEO_MODEL || DEFAULT_FLAQ_VIDEO_MODEL
        : process.env.HUNYUAN_VIDEO_MODEL || DEFAULT_HUNYUAN_MODEL,
  };
}

/* ------------------------------------------------------------------ helpers */

type GenerateOptions = {
  prompt: string;
  duration: number;
  width: number;
  height: number;
  aspect: AspectRatio;
  seed?: number;
};

export type GeneratedSceneVideo = {
  file: string;
  provider: Exclude<AiVideoProvider, "none">;
  model: string;
  prompt: string;
};

/** HunyuanVideo wants dimensions divisible by 16. */
function snapSize(width: number, height: number): { width: number; height: number } {
  const snap = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  return { width: snap(width), height: snap(height) };
}

/** Frames for `duration` seconds, snapped to 4k+1 and capped at the model max. */
export function snapFrames(duration: number, fps = HUNYUAN_FPS): number {
  const raw = Math.max(1, Math.round(duration * fps));
  const k = Math.max(0, Math.round((raw - 1) / 4));
  return Math.min(HUNYUAN_MAX_FRAMES, k * 4 + 1);
}

/**
 * Snaps a scene duration to the values Seedance accepts (4, 8 or 12 seconds).
 * Sending an unsupported duration is rejected outright, so round to the
 * nearest legal value rather than letting the request fail.
 */
export function snapDuration(duration: number): number {
  const allowed = [4, 8, 12];
  return allowed.reduce((best, value) =>
    Math.abs(value - duration) < Math.abs(best - duration) ? value : best,
  );
}

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildVideoPrompt(topic: string): string {
  const clean = (topic || "").trim().replace(/\s+/g, " ");
  const base = clean || "abstract cinematic texture";
  return `${base}. Smooth cinematic camera motion, shallow depth of field, natural lighting, film grain, no text, no watermark, no logos.`.slice(
    0,
    900,
  );
}

function tmpDir(): string {
  const dir = path.join(/* turbopackIgnore: true */ os.tmpdir(), "reclaimed-artistry-video");
  fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  return dir;
}

async function downloadToFile(url: string, file: string, headers?: Record<string, string>) {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok) throw new Error(`Could not download generated video (${response.status})`);
  if (!response.body) throw new Error("Generated video download returned no body");
  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);
  // A real clip is always well over a few KB; anything smaller is an error page.
  if (buffer.byteLength < 1024) throw new Error("Generated video was empty");
  fs.writeFileSync(/* turbopackIgnore: true */ file, buffer);
}

/* ------------------------------------------------------- HunyuanVideo (Replicate) */

type ReplicatePrediction = {
  id?: string;
  status?: string;
  error?: string | null;
  output?: unknown;
  urls?: { get?: string };
};

/** Replicate returns either a URL string, an array of them, or a file object. */
function replicateOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    return typeof first === "string" ? first : null;
  }
  if (output && typeof output === "object") {
    const maybe = output as { url?: string | (() => string) };
    if (typeof maybe.url === "string") return maybe.url;
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPrediction(
  prediction: ReplicatePrediction,
  token: string,
  timeoutMs: number,
): Promise<ReplicatePrediction> {
  const pollUrl =
    prediction.urls?.get ||
    (prediction.id ? `https://api.replicate.com/v1/predictions/${prediction.id}` : null);
  if (!pollUrl) throw new Error("Replicate returned no prediction URL");

  const deadline = Date.now() + timeoutMs;
  const interval = numFromEnv("HUNYUAN_POLL_MS", 4000);
  let current = prediction;

  while (current.status === "starting" || current.status === "processing") {
    if (Date.now() > deadline) throw new Error("HunyuanVideo generation timed out");
    await sleep(interval);
    const response = await fetch(pollUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Replicate status check failed (${response.status})`);
    }
    current = (await response.json()) as ReplicatePrediction;
  }

  if (current.status !== "succeeded") {
    throw new Error(
      `HunyuanVideo generation ${current.status ?? "failed"}${current.error ? `: ${current.error}` : ""}`,
    );
  }
  return current;
}

async function generateHunyuan(options: GenerateOptions): Promise<GeneratedSceneVideo> {
  const token = process.env.REPLICATE_API_TOKEN as string;
  const model = process.env.HUNYUAN_VIDEO_MODEL || DEFAULT_HUNYUAN_MODEL;
  const { width, height } = snapSize(options.width, options.height);

  const created = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: {
        prompt: buildVideoPrompt(options.prompt),
        width,
        height,
        video_length: snapFrames(options.duration),
        infer_steps: numFromEnv("HUNYUAN_INFER_STEPS", 50),
        flow_shift: numFromEnv("HUNYUAN_FLOW_SHIFT", 7),
        embedded_guidance_scale: numFromEnv("HUNYUAN_GUIDANCE_SCALE", 6),
        ...(options.seed === undefined ? {} : { seed: options.seed }),
      },
    }),
  });

  if (!created.ok) {
    const detail = await created.text().catch(() => "");
    throw new Error(
      `Replicate rejected the HunyuanVideo request (${created.status})${
        detail ? `: ${detail.slice(0, 220)}` : ""
      }`,
    );
  }

  const prediction = await waitForPrediction(
    (await created.json()) as ReplicatePrediction,
    token,
    numFromEnv("HUNYUAN_TIMEOUT_MS", 600_000),
  );

  const url = replicateOutputUrl(prediction.output);
  if (!url) throw new Error("Replicate returned no video");

  const file = path.join(/* turbopackIgnore: true */ tmpDir(), `hunyuan-${randomUUID()}.mp4`);
  await downloadToFile(url, file);
  return { file, provider: "hunyuan", model, prompt: options.prompt };
}

/* ------------------------------------------------------------------- public */

/**
 * Generates a scene clip, or `null` — callers must fall back. Every failure is
 * caught here so a video API outage can never fail a render that would have
 * completed with stock footage or an on-device plate.
 */
async function generateFlaq(options: GenerateOptions): Promise<GeneratedSceneVideo> {
  const key = flaqKey();
  if (!key) throw new Error("FLAQ_API_KEY is not set");
  const model = process.env.FLAQ_VIDEO_MODEL || DEFAULT_FLAQ_VIDEO_MODEL;

  const { data, ext } = await generateFlaqMedia("video", {
    model_name: model,
    prompt: buildVideoPrompt(options.prompt),
    resolution: process.env.FLAQ_VIDEO_RESOLUTION || "720p",
    // Seedance accepts 4, 8 or 12 seconds.
    duration: snapDuration(options.duration),
    aspect_ratio: options.aspect ?? "16:9",
  });

  const file = path.join(os.tmpdir(), `flaq-${randomUUID()}.${ext}`);
  fs.writeFileSync(file, data);
  return { file, provider: "flaq", model, prompt: options.prompt };
}

export async function generateSceneVideo(
  options: GenerateOptions,
): Promise<GeneratedSceneVideo | null> {
  const provider = activeAiVideoProvider();
  if (provider === "none") return null;

  try {
    return provider === "flaq" ? await generateFlaq(options) : await generateHunyuan(options);
  } catch (error) {
    console.warn(
      `[video] ${provider} generation failed, falling back:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
