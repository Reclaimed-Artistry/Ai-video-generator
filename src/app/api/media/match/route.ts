import { NextResponse } from "next/server";
import { matchSceneToNarration, narrationVisualQuery } from "@/lib/narration-match";
import type { Scene } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Pick the stock clip that best fits a scene's narration.
 * Body: { narration, caption?, topic?, excludeIds?, currentQuery? }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    narration?: string;
    caption?: string;
    topic?: string;
    excludeIds?: string[];
    currentQuery?: string;
  };

  const narration = (body.narration ?? "").trim();
  if (!narration && !(body.caption ?? "").trim()) {
    return NextResponse.json({ error: "Narration is empty" }, { status: 400 });
  }

  const probe: Scene = {
    id: "match",
    narration,
    caption: body.caption ?? "",
    mediaQuery: body.currentQuery ?? "",
    mediaId: null,
    mediaType: null,
    duration: null,
    transition: "none",
  };

  try {
    const matched = await matchSceneToNarration(probe, {
      excludeIds: Array.isArray(body.excludeIds) ? body.excludeIds.slice(0, 40) : [],
      topic: body.topic,
      force: true,
    });
    return NextResponse.json({
      query: narrationVisualQuery(narration, { caption: body.caption, topic: body.topic }),
      media: {
        mediaId: matched.mediaId,
        mediaType: matched.mediaType,
        mediaUrl: matched.mediaUrl ?? null,
        mediaThumb: matched.mediaThumb ?? null,
        mediaTitle: matched.mediaTitle ?? null,
        mediaCreator: matched.mediaCreator ?? null,
        mediaProvider: matched.mediaProvider ?? null,
        mediaQuery: matched.mediaQuery,
        mediaMatchedFor: matched.mediaMatchedFor ?? null,
        mediaStart: matched.mediaStart ?? 0,
        mediaLocked: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not match footage" },
      { status: 500 },
    );
  }
}
