import { after, NextResponse } from "next/server";
import { getJobState, startRender } from "@/lib/render";
import { getProject, updateProject } from "@/lib/projects";
import { storageProblem } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Renders run in the background via `after()`, which keeps the function alive
 * up to this limit. 300s is the Vercel Hobby maximum (Fluid compute); Pro
 * plans may raise it to 800.
 */
export const maxDuration = 300;

/** A render with no progress update for this long was killed by the platform. */
const STALE_RENDER_MS = 240_000;

type Context = { params: Promise<{ id: string }> };

function isStale(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > STALE_RENDER_MS;
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const job = getJobState(id);

  if (project.status === "rendering" && job.status !== "running" && isStale(project.updatedAt)) {
    const message =
      "The render stopped before finishing (the server time limit was reached). Try 240p or 360p, or fewer/shorter scenes, then render again.";
    await updateProject(id, { status: "error", stage: "Render timed out", error: message });
    return NextResponse.json({
      status: "error",
      progress: project.progress,
      stage: "Render timed out",
      error: message,
      job: "error",
    });
  }

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

  const problem = storageProblem();
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 503 });
  }

  // Another serverless instance may already be encoding this project.
  if (project.status === "rendering" && !isStale(project.updatedAt)) {
    return NextResponse.json({ started: false, status: "rendering" }, { status: 200 });
  }

  // Persist the state first so the very first status poll already sees it.
  await updateProject(id, {
    status: "rendering",
    progress: 1,
    stage: "Queued for encoding",
    error: null,
  });

  const job = startRender(id);
  if (job) after(() => job);

  return NextResponse.json(
    { started: Boolean(job), status: "rendering" },
    { status: job ? 202 : 200 },
  );
}
