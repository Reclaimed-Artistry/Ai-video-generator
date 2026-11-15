import { NextResponse } from "next/server";
import {
  AiRateLimitError,
  buildImagePrompt,
  generateImageOnServer,
  randomSeed,
} from "@/lib/ai";
import { saveGeneratedImage } from "@/lib/storage";
import { AI_STYLES, ASPECTS, type AiStyleId, type AspectRatio } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Generate a scene visual on the server and store it once.
 * OPENAI_API_KEY is used when set. Rate limits return 429 + retryAfter,
 * which the studio turns into a countdown and automatic retry.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    style?: AiStyleId;
    aspect?: AspectRatio;
    seed?: number;
    projectId?: string;
  };

  const scenePrompt = (body.prompt ?? "").trim();
  if (scenePrompt.length < 3) {
    return NextResponse.json({ error: "Describe the image you want first." }, { status: 400 });
  }
  const style: AiStyleId = body.style && body.style in AI_STYLES ? body.style : "cinematic";
  const aspect: AspectRatio = body.aspect && body.aspect in ASPECTS ? body.aspect : "16:9";
  const seed =
    typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.floor(body.seed) : randomSeed();
  const prompt = buildImagePrompt(scenePrompt, style);

  try {
    const generated = await generateImageOnServer(prompt, aspect, seed);
    const url = await saveGeneratedImage(body.projectId ?? null, generated.data, generated.contentType);
    return NextResponse.json({ mode: "server", url, seed, style, provider: generated.provider });
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: 429, headers: { "retry-after": String(error.retryAfter) } },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 502 },
    );
  }
}
