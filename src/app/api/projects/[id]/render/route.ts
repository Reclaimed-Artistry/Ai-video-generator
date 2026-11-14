import { NextResponse } from "next/server";
import { getJobState, startRender } from "@/lib/render";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const job = getJobState(id);
  return NextResponse.json({
    status: project.status,
    progress: project.progress,
    stage: project.stage,
    error: project.error ?? job.error,
    job: job.status,
  });
}

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.script.scenes?.length) {
    return NextResponse.json(
      { error: "Add at least one scene before rendering" },
      { status: 400 },
    );
  }
  const started = startRender(id);
  return NextResponse.json({ started, status: "rendering" }, { status: started ? 202 : 200 });
}
