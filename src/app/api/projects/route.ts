import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { enforceMediaPolicy } from "@/lib/media-policy";
import { isCastOption, type CastOption } from "@/lib/people";
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
  try {
    const items = await listProjects(24);
    return NextResponse.json({ projects: items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load projects" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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
      cast?: CastOption;
    };

    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "A prompt or script is required" }, { status: 400 });
    }

    const duration = Math.min(90, Math.max(15, Number(body.duration ?? 30)));
    const tone = (body.tone ?? "cinematic") as Tone;
    const workflow = (body.workflow ?? "explainer") as Workflow;
    const language = body.language ?? "en";
    const cast: CastOption = isCastOption(body.cast) ? body.cast : "any";
    const generated = await generateScript({
      prompt,
      duration,
      tone,
      language,
      workflow,
      musicTrack: body.musicTrack,
      musicVolume: body.musicVolume,
      captionMode: body.captionMode,
      title: body.title,
      cast,
    });
    const { script } = await enforceMediaPolicy(generated, prompt);

    const project = await createProject({
      title: body.title?.trim() || script.title,
      prompt,
      tone,
      style: (body.style ?? "modern") as Style,
      resolution: (body.resolution ?? "1080p") as Resolution,
      aspect: (body.aspect ?? "16:9") as AspectRatio,
      voice: body.voice ?? "ava",
      language,
      duration,
      script,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not draft sequence" },
      { status: 500 },
    );
  }
}
