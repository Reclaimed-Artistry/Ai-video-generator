import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { regenerateSceneAi } from "@/lib/script";
import type { Scene } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function POST(_request: Request, context: Context) {
  const { id, sceneId } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const index = project.script.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const next = await regenerateSceneAi(project.script, index, {
    prompt: project.prompt,
    tone: project.tone,
    language: project.language,
    duration: project.duration,
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
