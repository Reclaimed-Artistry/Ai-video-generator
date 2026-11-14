import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { generateScript } from "@/lib/script";
import { listProjects, toProject } from "@/lib/projects";
import type { AspectRatio, Resolution, Style, Tone } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listProjects(24);
  return NextResponse.json({ projects: items });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    title?: string;
    duration?: number;
    tone?: Tone;
    style?: Style;
    resolution?: Resolution;
    aspect?: AspectRatio;
    voice?: string;
    language?: string;
  };

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  const duration = Math.min(90, Math.max(15, Number(body.duration ?? 30)));
  const tone = (body.tone ?? "energetic") as Tone;
  const script = await generateScript({ prompt, duration, tone, language: body.language ?? "en" });

  const inserted = await db
    .insert(projects)
    .values({
      title: body.title?.trim() || script.title,
      prompt,
      status: "ready",
      progress: 0,
      stage: "Script ready",
      tone,
      style: (body.style ?? "modern") as Style,
      resolution: (body.resolution ?? "1080p") as Resolution,
      aspect: (body.aspect ?? "16:9") as AspectRatio,
      voice: body.voice ?? "ava",
      language: body.language ?? "en",
      duration,
      script,
    })
    .returning();

  return NextResponse.json({ project: toProject(inserted[0]) }, { status: 201 });
}
