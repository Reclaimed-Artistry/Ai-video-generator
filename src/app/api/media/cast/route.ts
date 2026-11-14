import { NextResponse } from "next/server";
import { enforceMediaPolicy } from "@/lib/media-policy";
import { isCastOption } from "@/lib/people";
import type { VideoScript } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Apply a cast choice (and the no-abstract rule) to a script: every unlocked
 * scene whose clip doesn't feature the chosen cast is re-matched to its own
 * narration. Stateless, so it works with and without a database.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      script?: VideoScript;
      cast?: string;
      topicContext?: string;
    };
    if (!body.script || !Array.isArray(body.script.scenes)) {
      return NextResponse.json({ error: "A script with scenes is required" }, { status: 400 });
    }
    const cast = isCastOption(body.cast) ? body.cast : body.script.options?.cast ?? "any";
    const script: VideoScript = {
      ...body.script,
      options: { ...(body.script.options ?? {}), cast },
    };
    const result = await enforceMediaPolicy(script, body.topicContext ?? "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not apply cast" },
      { status: 500 },
    );
  }
}
