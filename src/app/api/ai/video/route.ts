import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  AiRateLimitError,
  AiVideoUnavailableError,
  buildImagePrompt,
  generateVideoOnServer,
  randomSeed,
  videoProvider,
} from "@/lib/ai";
import { runFfmpeg } from "@/lib/ffmpeg";
import { saveGeneratedMedia } from "@/lib/storage";
import { AI_STYLES, ASPECTS, type AiStyleId, type AspectRatio } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Text-to-video takes a minute or two; 300s is the Vercel Hobby maximum. */
export const maxDuration = 300;

/** Grab a poster frame so scene lists and the timeline can show the clip. */
async function extractPoster(video: Buffer): Promise<Buffer | null> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-"));
  const input = path.join(dir, "clip.mp4");
  const output = path.join(dir, "poster.jpg");
  try {
    fs.writeFileSync(input, video);
    await runFfmpeg(["-y", "-ss", "0.5", "-i", input, "-frames:v", "1", "-q:v", "4", output]);
    return fs.existsSync(output) ? fs.readFileSync(output) : null;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Generate a real AI video clip for a scene and store it (plus a poster).
 * Without REPLICATE_API_TOKEN this answers 409 so the studio can fall back
 * to a motion shot made from an AI image.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    style?: AiStyleId;
    aspect?: AspectRatio;
    seed?: number;
    projectId?: string;
  };

  if (videoProvider() === "none") {
    return NextResponse.json(
      { error: new AiVideoUnavailableError().message, fallback: "image" },
      { status: 409 },
    );
  }

  const scenePrompt = (body.prompt ?? "").trim();
  if (scenePrompt.length < 3) {
    return NextResponse.json({ error: "Describe the shot you want first." }, { status: 400 });
  }
  const style: AiStyleId = body.style && body.style in AI_STYLES ? body.style : "cinematic";
  const aspect: AspectRatio = body.aspect && body.aspect in ASPECTS ? body.aspect : "16:9";
  const seed =
    typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.floor(body.seed) : randomSeed();
  const prompt = `${buildImagePrompt(scenePrompt, style)}, smooth natural motion`;

  try {
    const clip = await generateVideoOnServer(prompt, aspect, seed);
    const url = await saveGeneratedMedia(body.projectId ?? null, clip.data, clip.contentType);
    const poster = await extractPoster(clip.data);
    const thumbUrl = poster
      ? await saveGeneratedMedia(body.projectId ?? null, poster, "image/jpeg").catch(() => null)
      : null;
    return NextResponse.json({ url, thumbUrl, seed, style, provider: clip.provider, model: clip.model });
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: 429, headers: { "retry-after": String(error.retryAfter) } },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video generation failed" },
      { status: 502 },
    );
  }
}
