import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { projects } from "@/db/schema";
import { listProjects, toProject } from "@/lib/projects";
import { generateScript } from "@/lib/script";
import type {
  AspectRatio,
  CaptionMode,
  MusicTrackId,
  Resolution,
  Style,
  Tone,
  Workflow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const items = await listProjects(24);
  return NextResponse.json({ projects: items });
}

export async function POST(request: Request) {
  await ensureSchema();

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
    workflow?: Workflow;
    musicTrack?: MusicTrackId;
    musicVolume?: number;
    captionMode?: CaptionMode;
  };

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "A prompt or script is required" }, { status: 400 });
  }

  const duration = Math.min(90, Math.max(15, Number(body.duration ?? 30)));
  const tone = (body.tone ?? "cinematic") as Tone;
  const workflow = (body.workflow ?? "explainer") as Workflow;
  const script = await generateScript({
    prompt,
    duration,
    tone,
    language: body.language ?? "en",
    workflow,
    musicTrack: body.musicTrack,
    musicVolume: body.musicVolume,
    captionMode: body.captionMode,
    title: body.title,
  });

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
