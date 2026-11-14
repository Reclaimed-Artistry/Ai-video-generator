import { NextResponse } from "next/server";
import { applyCommand } from "@/lib/commands";
import { getProject, updateProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Natural-language editing: "make it shorter", "use a British male voice", … */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status === "rendering") {
    return NextResponse.json(
      { error: "Wait for the current render to finish, then try the command again." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { command?: string };
  const command = (body.command ?? "").trim().slice(0, 500);
  if (!command) {
    return NextResponse.json({ error: "Type what you would like to change." }, { status: 400 });
  }

  const result = await applyCommand(project, command);
  if (result.applied.length === 0) {
    return NextResponse.json({
      project,
      applied: [],
      reply:
        "I couldn't work out what to change. Try something like “make it shorter”, “use a British male voice”, “switch to vertical” or “add calm music”.",
    });
  }

  await updateProject(id, {
    ...result.patch,
    script: result.script,
    status: "ready",
    stage: "Edited with AI command",
  });
  const updated = await getProject(id);
  return NextResponse.json({
    project: updated,
    applied: result.applied,
    reply: result.applied.join(" · "),
    usedAi: result.usedAi,
  });
}
