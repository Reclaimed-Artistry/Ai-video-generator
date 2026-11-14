import { after, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { getJobState, runRenderJob } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read render status" },
      { status: 500 },
    );
  }
}

export async function POST(_request: Request, context: Context) {
  try {
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

    after(async () => {
      await runRenderJob(id);
    });

    return NextResponse.json({ started: true, status: "rendering" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start render" },
      { status: 500 },
    );
  }
}
