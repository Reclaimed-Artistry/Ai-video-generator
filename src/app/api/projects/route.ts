import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { generateScript } from "@/lib/script";
import { AI_STYLES } from "@/lib/types";
import type {
  AspectRatio,
  CaptionMode,
  MusicTrackId,
  PeopleRepresentation,
  Resolution,
  Style,
  Tone,
  Workflow,
  AiStyleId,
  VisualMode,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

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
      peopleRepresentation?: PeopleRepresentation;
      visualMode?: VisualMode;
      aiStyle?: AiStyleId;
      stickTheme?: "whiteboard" | "chalkboard" | "pop";
      progressBar?: boolean;
      punchZoom?: boolean;
      sceneSfx?: boolean;
    };

    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "A prompt or script is required" }, { status: 400 });
    }

    const duration = Math.min(90, Math.max(15, Number(body.duration ?? 30)));
    const tone = (body.tone ?? "cinematic") as Tone;
    const workflow = (body.workflow ?? "explainer") as Workflow;
    const language = body.language ?? "en";
    const peopleRepresentation = (body.peopleRepresentation ?? "all") as PeopleRepresentation;
    const script = await generateScript({
      prompt,
      duration,
      tone,
      language,
      workflow,
      musicTrack: body.musicTrack,
      musicVolume: body.musicVolume,
      captionMode: body.captionMode,
      peopleRepresentation,
      title: body.title,
      visualMode:
        body.visualMode === "ai-video" ||
        body.visualMode === "ai-image" ||
        body.visualMode === "stickman"
          ? body.visualMode
          : body.visualMode === "ai"
            ? "ai-image"
            : "stock",
      aiStyle: body.aiStyle && body.aiStyle in AI_STYLES ? body.aiStyle : undefined,
      stickTheme:
        body.stickTheme === "chalkboard" || body.stickTheme === "pop" ? body.stickTheme : "whiteboard",
      progressBar: typeof body.progressBar === "boolean" ? body.progressBar : undefined,
      punchZoom: typeof body.punchZoom === "boolean" ? body.punchZoom : undefined,
      sceneSfx: typeof body.sceneSfx === "boolean" ? body.sceneSfx : undefined,
    });

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
