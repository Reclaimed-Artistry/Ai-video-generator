import { NextResponse } from "next/server";
import { dubProject, dubProviderStatus, DUB_TARGETS } from "@/lib/dub";
import { getProject, updateProject } from "@/lib/projects";
import { startRender } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

export async function GET() {
  return NextResponse.json({
    targets: DUB_TARGETS,
    status: dubProviderStatus(),
  });
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    targetLanguage?: string;
    voiceGender?: "male" | "female";
    autoRender?: boolean;
  };

  const target = (body.targetLanguage ?? "").trim();
  if (!target) {
    return NextResponse.json({ error: "A target language is required" }, { status: 400 });
  }
  if (!DUB_TARGETS.some((lang) => lang.id === target)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }
  if (project.status === "rendering") {
    return NextResponse.json(
      { error: "This project is already rendering" },
      { status: 409 },
    );
  }

  try {
    const result = await dubProject(project, target, {
      voiceGender: body.voiceGender ?? "female",
    });

    await updateProject(id, {
      script: result.script,
      language: result.language,
      voice: result.voice,
      status: "ready",
      stage: result.translated
        ? `Dubbed into ${target} — ready to render`
        : `Voice locale set to ${target} — ready to render`,
      error: null,
    });

    const updated = await getProject(id);

    if (body.autoRender) {
      startRender(id);
    }

    return NextResponse.json({
      project: updated,
      changes: result.changes,
      translated: result.translated,
      provider: result.provider,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dubbing failed" },
      { status: 500 },
    );
  }
}
