import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { regenerateScene } from "@/lib/script";
import type { Scene } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; sceneId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id, sceneId } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Scene>;
  const scenes = project.script.scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, ...body, id: scene.id } : scene,
  );

  await updateProject(id, {
    script: { ...project.script, scenes },
    status: "ready",
    stage: "Scene updated",
  });

  const updated = await getProject(id);
  return NextResponse.json({ project: updated });
}

export async function POST(request: Request, context: Context) {
  const { id, sceneId } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const index = project.script.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { tone?: never };
  const next = regenerateScene(project.script, index, {
    prompt: body?.tone ? project.prompt : project.prompt,
    tone: project.tone,
  });

  const scenes = project.script.scenes.map((scene, sceneIndex) =>
    sceneIndex === index ? { ...next, id: scene.id } : scene,
  );

  await updateProject(id, {
    script: { ...project.script, scenes },
    status: "ready",
    stage: "Scene rewritten",
  });

  const updated = await getProject(id);
  return NextResponse.json({ project: updated });
}
