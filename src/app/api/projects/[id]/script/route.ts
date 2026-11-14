import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { generateScript } from "@/lib/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const script = await generateScript({
    prompt: project.prompt,
    duration: project.duration,
    tone: project.tone,
    language: project.language,
  });

  await updateProject(id, {
    script,
    title: script.title,
    status: "ready",
    stage: "Script rewritten",
    progress: 0,
  });

  const updated = await getProject(id);
  return NextResponse.json({ project: updated });
}
