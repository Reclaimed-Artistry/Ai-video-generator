import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { generateScript } from "@/lib/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      project?: import("@/lib/types").Project;
    };
    const project = (await getProject(id)) ?? body.project ?? null;
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

    const updated = (await getProject(id)) ?? {
      ...project,
      script,
      title: script.title,
      status: "ready" as const,
      stage: "Script rewritten",
      progress: 0,
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ project: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rewrite script" },
      { status: 500 },
    );
  }
}
