import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { flaqKey, generateFlaqMedia } from "@/lib/flaq";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { hexToFfmpegColor } from "./brandkit";
import { saveAppArtifact } from "./storage";
import { RESOLUTIONS, type AspectRatio, type Resolution } from "./types";

export type ImageProvider =
  | "flaq"
  | "openai"
  | "stability"
  | "replicate"
  | "gemini"
  | "procedural";

export type GeneratedImage = {
  /** Browser-reachable URL for the generated still. */
  url: string;
  /** Storage key (relative path or Blob URL) persisted on the scene. */
  key: string;
  provider: ImageProvider;
  prompt: string;
  /** True when no image API was configured and we composed the frame locally. */
  fallback: boolean;
  width: number;
  height: number;
};

/** Provider chosen from whichever key is present, in quality order. */
export function activeImageProvider(): ImageProvider {
  if (flaqKey()) return "flaq";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.STABILITY_API_KEY) return "stability";
  if (process.env.REPLICATE_API_TOKEN) return "replicate";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  return "procedural";
}

/** Status payload returned by `GET /api/imagen` and by image mutations. */
export type ImageProviderStatus = {
  provider: ImageProvider;
  configured: boolean;
  label: string;
  note: string;
};

export function imageProviderStatus(): {
  provider: ImageProvider;
  configured: boolean;
  label: string;
  note: string;
} {
  const provider = activeImageProvider();
  const labels: Record<ImageProvider, string> = {
    flaq: "Flaq AI Images",
    openai: "OpenAI Images",
    stability: "Stability AI",
    replicate: "Replicate Flux",
    gemini: "Gemini Imagen",
    procedural: "On-device generator",
  };
  const notes: Record<ImageProvider, string> = {
    flaq: "Flaq AI text-to-image scene plates.",
    openai: "gpt-image-1 photoreal scene plates.",
    stability: "Stable Image Core scene plates.",
    replicate: "Flux Schnell scene plates.",
    gemini: "Imagen 3 scene plates.",
    procedural:
      "No image API key found — generating brand-tinted abstract plates locally with FFmpeg.",
  };
  return {
    provider,
    configured: provider !== "procedural",
    label: labels[provider],
    note: notes[provider],
  };
}

export function rasterFor(
  resolution: Resolution,
  aspect: AspectRatio,
): { width: number; height: number } {
  const base = RESOLUTIONS[resolution] ?? RESOLUTIONS["1080p"];
  const short = Math.min(base.width, base.height);
  let width = short;
  let height = short;
  if (aspect === "16:9") {
    height = short;
    width = Math.round((short * 16) / 9 / 2) * 2;
  } else if (aspect === "9:16") {
    width = short;
    height = Math.round((short * 16) / 9 / 2) * 2;
  } else {
    width = short;
    height = short;
  }
  return { width: Math.max(256, width), height: Math.max(256, height) };
}

/** Expands a short scene keyword into a photographic image prompt. */
export function buildImagePrompt(topic: string, styleHint?: string): string {
  const clean = (topic || "").trim().replace(/\s+/g, " ");
  const base = clean || "abstract cinematic texture";
  const style =
    styleHint?.trim() ||
    "cinematic, shallow depth of field, dramatic natural lighting, film grain, ultra detailed, no text, no watermark, no logos";
  return `${base}. ${style}`.slice(0, 900);
}

/* ------------------------------------------------------------- providers */

async function generateFlaq(
  prompt: string,
  aspect: AspectRatio,
): Promise<{ data: Buffer; ext: string } | null> {
  if (!flaqKey()) return null;
  return generateFlaqMedia("image", {
    model_name: process.env.FLAQ_IMAGE_MODEL || "gpt-image-2",
    prompt: prompt.slice(0, 5000),
    aspect_ratio: aspect === "9:16" ? "9:16" : aspect === "1:1" ? "1:1" : "16:9",
    resolution: process.env.FLAQ_IMAGE_RESOLUTION || "1k",
  });
}

async function generateOpenAi(
  prompt: string,
  aspect: AspectRatio,
): Promise<{ data: Buffer; ext: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const size =
    aspect === "9:16" ? "1024x1536" : aspect === "1:1" ? "1024x1024" : "1536x1024";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: prompt.slice(0, 1000),
      size,
      n: 1,
      ...(process.env.OPENAI_IMAGE_MODEL?.startsWith("dall-e") ? {} : {}),
    }),
  });
  if (!response.ok) throw new Error(`OpenAI image generation failed (${response.status})`);
  const json = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = json.data?.[0];
  if (first?.b64_json) {
    return { data: Buffer.from(first.b64_json, "base64"), ext: "png" };
  }
  if (first?.url) {
    const asset = await fetch(first.url);
    if (!asset.ok) throw new Error("Could not download generated image");
    return { data: Buffer.from(await asset.arrayBuffer()), ext: "png" };
  }
  throw new Error("OpenAI returned no image");
}

async function generateStability(
  prompt: string,
  aspect: AspectRatio,
): Promise<{ data: Buffer; ext: string } | null> {
  const key = process.env.STABILITY_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("prompt", prompt.slice(0, 2000));
  form.append("output_format", "jpeg");
  form.append(
    "aspect_ratio",
    aspect === "9:16" ? "9:16" : aspect === "1:1" ? "1:1" : "16:9",
  );
  const response = await fetch(
    "https://api.stability.ai/v2beta/stable-image/generate/core",
    {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, accept: "image/*" },
      body: form,
    },
  );
  if (!response.ok) throw new Error(`Stability image generation failed (${response.status})`);
  return { data: Buffer.from(await response.arrayBuffer()), ext: "jpg" };
}

async function generateReplicate(
  prompt: string,
  aspect: AspectRatio,
): Promise<{ data: Buffer; ext: string } | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  const created = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "wait",
    },
    body: JSON.stringify({
      version: process.env.REPLICATE_IMAGE_VERSION || "black-forest-labs/flux-schnell",
      input: {
        prompt: prompt.slice(0, 1500),
        aspect_ratio: aspect === "9:16" ? "9:16" : aspect === "1:1" ? "1:1" : "16:9",
        output_format: "jpg",
      },
    }),
  });
  if (!created.ok) throw new Error(`Replicate image generation failed (${created.status})`);
  const prediction = (await created.json()) as {
    output?: string | string[];
    status?: string;
  };
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!output) throw new Error("Replicate returned no image");
  const asset = await fetch(output);
  if (!asset.ok) throw new Error("Could not download Replicate image");
  return { data: Buffer.from(await asset.arrayBuffer()), ext: "jpg" };
}

async function generateGemini(
  prompt: string,
  aspect: AspectRatio,
): Promise<{ data: Buffer; ext: string } | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: prompt.slice(0, 1000) }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspect === "9:16" ? "9:16" : aspect === "1:1" ? "1:1" : "16:9",
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini image generation failed (${response.status})`);
  const json = (await response.json()) as {
    predictions?: { bytesBase64Encoded?: string }[];
  };
  const b64 = json.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Gemini returned no image");
  return { data: Buffer.from(b64, "base64"), ext: "png" };
}

/* -------------------------------------------------- on-device composition */

/**
 * Composes a brand-tinted abstract plate locally with FFmpeg. This is both the
 * zero-key fallback and what keeps rendering possible in air-gapped or
 * network-restricted environments.
 */
/** Cellular automaton rules that produce mid-brightness, well-textured plates. */
const CELLULAR_RULES = [30, 90, 110, 126];

/**
 * Writes a brand-tinted abstract plate to `output` using only lavfi options
 * that exist across FFmpeg 4.x → 7.x, so the fallback never breaks on older
 * builds.
 *
 * Two source families are used, validated for luminance and texture:
 *   - `mandelbrot` (organic, high texture) — most seeds.
 *   - `cellauto`   (structured, finer texture) — every fifth seed.
 * `life` is deliberately excluded: at frame 1 it renders near-black and it is
 * not seedable on older FFmpeg builds.
 *
 * The seed drives the source, its parameters, blur radius, saturation, blend
 * opacity and hue rotation, while brightness stays inside a consistent band so
 * no scene renders as a black or blown-out frame.
 */
/** Rec.601 luma of an RGB triple (0–255). */
function luma(rgb: [number, number, number]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

/**
 * The base plate is a flat brand-colour fill, so a dark brand (deep navy,
 * burnt orange, forest green) would otherwise produce a murky frame once the
 * texture is overlaid on top of it.
 *
 * Lifting in HSV — raising only V — clears a luma floor while leaving hue and
 * saturation untouched, so a dark teal stays a teal instead of washing out to
 * grey the way mixing toward white would.
 */
const PLATE_LUMA_FLOOR = 118;

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? delta / max : 0, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function liftPlateColor(hex: string): string {
  const raw = (hex || "").trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!match) return hexToFfmpegColor("#6D4AFF");

  const int = parseInt(match[1], 16);
  const rgb: [number, number, number] = [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
  if (luma(rgb) >= PLATE_LUMA_FLOOR) return hexToFfmpegColor(raw);

  const [h, s, v] = rgbToHsv(...rgb);
  let best = rgb;
  // Step V up in 1% increments until the luma floor is cleared (or V maxes
  // out — a fully saturated pure red can never reach the floor).
  for (let nv = v; nv <= 1.0001; nv += 0.01) {
    best = hsvToRgb(h, s, nv);
    if (luma(best) >= PLATE_LUMA_FLOOR) break;
  }
  return hexToFfmpegColor(rgbToHex(best));
}

export async function renderProceduralPlate(
  output: string,
  options: {
    seed: number;
    width: number;
    height: number;
    primaryColor?: string;
  },
): Promise<void> {
  const { width, height } = options;
  const size = `${width}x${height}`;
  const tint = liftPlateColor(options.primaryColor ?? "#6D4AFF");
  const seed = Math.abs(Math.floor(options.seed)) % 9973;

  const scale = (0.008 + (seed % 40) * 0.006).toFixed(4);
  const maxiter = 200 + (seed % 6) * 50;
  const rule = CELLULAR_RULES[seed % CELLULAR_RULES.length];

  const source =
    seed % 5 === 4
      ? `cellauto=s=${size}:rate=1:rule=${rule}:scroll=0`
      : `mandelbrot=s=${size}:rate=1:start_scale=${scale}:end_scale=${scale}:maxiter=${maxiter}`;

  const spin = (seed % 13) - 6;
  const sigma = 8 + (seed % 6) * 2;
  const opacity = (0.78 + (seed % 5) * 0.03).toFixed(2);
  const saturation = (0.18 + (seed % 6) * 0.03).toFixed(2);

  // `softlight` beats `overlay` here: it keeps far more of the fractal's
  // texture (contrast sd ~37–41 vs ~24–38) and holds the finished plate in a
  // tight mean-luma band (~73–95) across every brand hue, where `overlay`
  // swings wildly (69–121) and crushes the complementary channel to zero.
  const complex = [
    `[0:v]gblur=sigma=${sigma},eq=saturation=${saturation}:contrast=1.24:brightness=-0.04,format=yuv420p[tex]`,
    `[1:v]format=yuv420p[base]`,
    `[base][tex]blend=all_mode=softlight:all_opacity=${opacity},hue=h=${spin}:s=1.06,vignette=PI/6,noise=alls=5:allf=u[out]`,
  ].join(";");

  try {
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      source,
      "-f",
      "lavfi",
      "-i",
      `color=c=${tint}:s=${size}:d=1:r=1`,
      "-filter_complex",
      complex,
      "-map",
      "[out]",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ]);
  } catch {
    // Ultra-conservative fallback: a flat brand wash with grain and vignette.
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${tint}:s=${size}:d=1:r=1`,
      "-vf",
      "noise=alls=7:allf=t+u,vignette=PI/5",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ]);
  }
}

/* ------------------------------------------------------------------ public */

export type GenerateImageOptions = {
  prompt: string;
  aspect?: AspectRatio;
  resolution?: Resolution;
  projectId?: string;
  seed?: number;
  primaryColor?: string;
};

export async function generateSceneImage(
  options: GenerateImageOptions,
): Promise<GeneratedImage> {
  const aspect: AspectRatio = options.aspect ?? "16:9";
  const resolution: Resolution = options.resolution ?? "1080p";
  const { width, height } = rasterFor(resolution, aspect);
  const prompt = buildImagePrompt(options.prompt);
  const seed = options.seed ?? Math.floor(Math.random() * 997);
  const provider = activeImageProvider();

  const scope = options.projectId ?? "scratch";
  const id = randomUUID();
  const dir = path.join("generated", scope);
  const filename = `${id}.jpg`;
  const key = `${dir}/${filename}`;
  const tmpDir = path.join(require("node:os").tmpdir(), "reclaimed-artistry-imagen");
  fs.mkdirSync(/* turbopackIgnore: true */ tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, filename);

  let buffer: Buffer | null = null;

  if (provider !== "procedural") {
    try {
      const result =
        provider === "flaq"
          ? await generateFlaq(prompt, aspect)
          : provider === "openai"
            ? await generateOpenAi(prompt, aspect)
            : provider === "stability"
              ? await generateStability(prompt, aspect)
              : provider === "replicate"
                ? await generateReplicate(prompt, aspect)
                : await generateGemini(prompt, aspect);

      if (result) buffer = result.data;
    } catch (error) {
      console.warn(
        `[imagen] ${provider} failed, using on-device generator:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  let usedProvider: ImageProvider = provider;
  if (!buffer) {
    usedProvider = "procedural";
    await renderProceduralPlate(tmpFile, {
      seed,
      width,
      height,
      primaryColor: options.primaryColor ?? "#6D4AFF",
    });
    buffer = fs.readFileSync(/* turbopackIgnore: true */ tmpFile);
  } else {
    // Re-encode through FFmpeg so every plate is a clean, baseline JPEG that
    // the render pipeline can rely on regardless of upstream format.
    fs.writeFileSync(/* turbopackIgnore: true */ tmpFile, buffer);
    const encoded = path.join(tmpDir, `${id}-enc.jpg`);
    try {
      await runFfmpeg([
        "-y",
        "-i",
        tmpFile,
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        encoded,
      ]);
      buffer = fs.readFileSync(/* turbopackIgnore: true */ encoded);
      fs.rmSync(/* turbopackIgnore: true */ encoded, { force: true });
    } catch {
      // Keep the upstream bytes if re-encoding fails.
    }
  }

  const stored = await saveAppArtifact(key, buffer, "image/jpeg");
  fs.rmSync(/* turbopackIgnore: true */ tmpFile, { force: true });

  return {
    url: stored,
    key,
    provider: usedProvider,
    prompt,
    fallback: usedProvider === "procedural",
    width,
    height,
  };
}
