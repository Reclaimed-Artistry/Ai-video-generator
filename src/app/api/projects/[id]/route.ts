import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject } from "@/lib/projects";
import type { AspectRatio, Resolution, Style, Tone, VideoScript } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    voice?: string;
    resolution?: Resolution;
    aspect?: AspectRatio;
    tone?: Tone;
    style?: Style;
    language?: string;
    duration?: number;
    script?: VideoScript;
    brandKitId?: string | null;
  };

  const renderDirty =
    body.voice !== undefined ||
    body.resolution !== undefined ||
    body.aspect !== undefined ||
    body.tone !== undefined ||
    body.style !== undefined ||
    body.language !== undefined ||
    body.duration !== undefined ||
    body.script !== undefined ||
    body.brandKitId !== undefined;

  await updateProject(id, {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.voice !== undefined ? { voice: body.voice } : {}),
    ...(body.resolution !== undefined ? { resolution: body.resolution } : {}),
    ...(body.aspect !== undefined ? { aspect: body.aspect } : {}),
    ...(body.tone !== undefined ? { tone: body.tone } : {}),
    ...(body.style !== undefined ? { style: body.style } : {}),
    ...(body.language !== undefined ? { language: body.language } : {}),
    ...(body.duration !== undefined ? { duration: body.duration } : {}),
    ...(body.script !== undefined ? { script: body.script } : {}),
    ...(body.brandKitId !== undefined ? { brandKitId: body.brandKitId } : {}),
    ...(renderDirty && project.status !== "rendering"
      ? { status: "ready", stage: "Edits pending master render" }
      : {}),
  });

  const updated = await getProject(id);
  return NextResponse.json({ project: updated });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const ok = await deleteProject(id);
  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
