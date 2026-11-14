import { after, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { getJobState, runRenderJob } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    error: project.error ?? (project.status === "error" ? job.error : null),
    outputPath: project.outputPath,
    posterPath: project.posterPath,
    job: project.status === "rendering" ? "running" : job.status,
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

  // Prevent double-starting if an encode updated within the last 6 minutes
  const lastUpdatedMs = Date.parse(project.updatedAt) || 0;
  const activelyRendering =
    project.status === "rendering" && Date.now() - lastUpdatedMs < 6 * 60 * 1000;
  if (activelyRendering) {
    return NextResponse.json({ started: false, status: "rendering" }, { status: 200 });
  }

  await updateProject(id, {
    status: "rendering",
    progress: 2,
    stage: "Starting FFmpeg pipeline",
    error: null,
  });

  // `after()` integrates with Vercel Fluid Compute / waitUntil so the FFmpeg
  // encode runs to completion after returning HTTP 202.
  after(async () => {
    await runRenderJob(id);
  });

  return NextResponse.json({ started: true, status: "rendering" }, { status: 202 });
}
