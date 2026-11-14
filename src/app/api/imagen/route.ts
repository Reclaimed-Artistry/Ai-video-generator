import { NextResponse } from "next/server";
import { generateSceneImage, imageProviderStatus } from "@/lib/imagen";
import type { AspectRatio, Resolution } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  return NextResponse.json({ status: imageProviderStatus() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    aspect?: AspectRatio;
    resolution?: Resolution;
    projectId?: string;
    seed?: number;
    primaryColor?: string;
  };

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  try {
    const image = await generateSceneImage({
      prompt,
      aspect: body.aspect ?? "16:9",
      resolution: body.resolution ?? "1080p",
      projectId: body.projectId,
      seed: body.seed,
      primaryColor: body.primaryColor,
    });
    return NextResponse.json({ image, status: imageProviderStatus() }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Image generation failed",
        status: imageProviderStatus(),
      },
      { status: 500 },
    );
  }
}
