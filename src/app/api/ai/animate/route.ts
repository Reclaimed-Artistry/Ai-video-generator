import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  AiRateLimitError,
  AiVideoUnavailableError,
  generateCharacterVideo,
  imageToVideoModel,
  lipsyncModel,
  randomSeed,
  toPublicMediaUrl,
  videoDuration,
  videoProvider,
} from "@/lib/ai";
import { probeDuration, runFfmpeg } from "@/lib/ffmpeg";
import { saveGeneratedMedia } from "@/lib/storage";
import { synthesizeSpeech } from "@/lib/tts";
import { ASPECTS, type AspectRatio } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function publicOrigin(request: Request): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-animate-"));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Image-to-video for a scene character.
 *  mode "motion"  → animate the still with smooth, natural movement
 *  mode "lipsync" → synthesize the narration and drive the character's mouth
 *                   and face with it (audio-driven video model)
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: "motion" | "lipsync";
    imageUrl?: string;
    prompt?: string;
    aspect?: AspectRatio;
    projectId?: string;
    narration?: string;
    voice?: string;
    language?: string;
    seed?: number;
  };

  if (videoProvider() === "none") {
    return NextResponse.json({ error: new AiVideoUnavailableError().message }, { status: 409 });
  }
  const mode = body.mode === "lipsync" ? "lipsync" : "motion";
  if (!body.imageUrl) {
    return NextResponse.json({ error: "Choose or upload a character image first." }, { status: 400 });
  }
  if (mode === "lipsync" && !(body.narration ?? "").trim()) {
    return NextResponse.json({ error: "This scene has no narration to lip-sync." }, { status: 400 });
  }
  const aspect: AspectRatio = body.aspect && body.aspect in ASPECTS ? body.aspect : "16:9";
  const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.floor(body.seed) : randomSeed();
  const origin = publicOrigin(request);

  try {
    const imageUrl = toPublicMediaUrl(body.imageUrl, origin);
    const base = (body.prompt ?? "").trim();
    let audioUrl: string | null = null;
    let durationSec = videoDuration();

    if (mode === "lipsync") {
      const speech = await synthesizeSpeech(body.narration!.trim(), body.voice ?? "ava", body.language ?? "en");
      const contentType = speech.ext === "mp3" ? "audio/mpeg" : "audio/wav";
      durationSec = await withTempDir(async (dir) => {
        const file = path.join(dir, `voice.${speech.ext}`);
        fs.writeFileSync(file, speech.data);
        return (await probeDuration(file)) || speech.durationSec || 5;
      });
      audioUrl = toPublicMediaUrl(await saveGeneratedMedia(body.projectId ?? null, speech.data, contentType), origin);
    }

    const prompt =
      mode === "lipsync"
        ? `${base || "The character"} speaks directly to camera with accurate lip-sync, natural facial expressions, blinking and subtle head and hand movement, smooth motion, stable identity`
        : `${base || "The character comes to life"}, smooth natural character movement, fluid motion, consistent identity, cinematic`;

    const clip = await generateCharacterVideo({ prompt, imageUrl, audioUrl, aspect, seed, durationSec });
    const url = await saveGeneratedMedia(body.projectId ?? null, clip.data, clip.contentType);
    const thumbUrl = await withTempDir(async (dir) => {
      const input = path.join(dir, "clip.mp4");
      const poster = path.join(dir, "poster.jpg");
      fs.writeFileSync(input, clip.data);
      try {
        await runFfmpeg(["-y", "-ss", "0.4", "-i", input, "-frames:v", "1", "-q:v", "4", poster]);
        return await saveGeneratedMedia(body.projectId ?? null, fs.readFileSync(poster), "image/jpeg");
      } catch {
        return null;
      }
    });

    return NextResponse.json({
      url,
      thumbUrl,
      seed,
      lipsync: mode === "lipsync",
      durationSec,
      model: clip.model || (mode === "lipsync" ? lipsyncModel() : imageToVideoModel()),
    });
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: 429, headers: { "retry-after": String(error.retryAfter) } },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Animation failed" },
      { status: 502 },
    );
  }
}
