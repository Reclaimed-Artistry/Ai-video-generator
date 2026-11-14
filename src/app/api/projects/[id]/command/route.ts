import { NextResponse } from "next/server";
import { interpretEditCommand } from "@/lib/command";
import { getProject, updateProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    command?: string;
  };
  const command = (body.command ?? "").trim();
  if (!command) {
    return NextResponse.json(
      {
        error:
          "Enter an edit command (e.g. 'Change voice to British male' or 'Switch to 9:16')",
      },
      { status: 400 },
    );
  }

  const result = await interpretEditCommand(project, command);
  if (!result.handled) {
    return NextResponse.json(
      {
        error:
          "Could not interpret that command. Try: 'Change voice to Kai', 'Switch to 9:16 vertical', 'Change scene 2 to ocean waves', 'Add cinematic music', or 'Export 1080p'.",
      },
      { status: 422 },
    );
  }

  await updateProject(id, {
    ...result.patch,
    status: "ready",
    stage: result.changes.join(" · "),
    error: null,
  });

  const updated = await getProject(id);
  return NextResponse.json({
    project: updated,
    changes: result.changes,
  });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply command" },
      { status: 500 },
    );
  }
}
