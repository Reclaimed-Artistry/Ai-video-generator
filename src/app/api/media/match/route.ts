import { NextResponse } from "next/server";
import { isCastOption, type CastOption } from "@/lib/people";
import { matchVideoForNarration, previewUrlForAsset } from "@/lib/stock";
import type { StockAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SingleMatchBody = {
  narration?: string;
  caption?: string;
  topicContext?: string;
  excludeIds?: string[];
  cast?: CastOption;
  provider?: string;
  scenes?: {
    id: string;
    narration: string;
    caption?: string;
    mediaLocked?: boolean;
    mediaId?: string | null;
  }[];
};

function assetPayload(asset: StockAsset | null, mediaQuery: string) {
  if (!asset) return null;
  return {
    mediaId: asset.id,
    mediaType: "video" as const,
    mediaUrl: previewUrlForAsset(asset),
    mediaThumb: asset.thumb,
    mediaTitle: asset.title,
    mediaCreator: asset.creator,
    mediaProvider: asset.provider,
    mediaQuery,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SingleMatchBody;

    // Batch mode: sync all unlocked scenes to their narration without duplicates
    if (Array.isArray(body.scenes) && body.scenes.length > 0) {
      const usedIds: string[] = body.scenes
        .filter((s) => s.mediaLocked && s.mediaId)
        .map((s) => s.mediaId as string);

      const matches: Record<string, ReturnType<typeof assetPayload>> = {};

      for (const scene of body.scenes) {
        if (scene.mediaLocked) continue;
        const { asset, mediaQuery } = await matchVideoForNarration({
          narration: scene.narration || scene.caption || body.topicContext || "",
          caption: scene.caption,
          topicContext: body.topicContext,
          excludeIds: usedIds,
          preferredProvider: body.provider,
          cast: isCastOption(body.cast) ? body.cast : "any",
        });
        if (asset) usedIds.push(asset.id);
        matches[scene.id] = assetPayload(asset, mediaQuery);
      }

      return NextResponse.json({ matches });
    }

    // Single scene mode
    const narration = (body.narration ?? "").trim();
    const caption = (body.caption ?? "").trim();
    const topicContext = (body.topicContext ?? "").trim();
    if (!narration && !caption && !topicContext) {
      return NextResponse.json(
        { error: "Narration or query text is required" },
        { status: 400 },
      );
    }

    const { asset, mediaQuery } = await matchVideoForNarration({
      narration: narration || caption,
      caption,
      topicContext,
      excludeIds: body.excludeIds ?? [],
      preferredProvider: body.provider,
          cast: isCastOption(body.cast) ? body.cast : "any",
    });

    return NextResponse.json({
      match: assetPayload(asset, mediaQuery),
      mediaQuery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not match footage",
      },
      { status: 500 },
    );
  }
}
