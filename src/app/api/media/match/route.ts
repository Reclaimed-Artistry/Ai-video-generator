import { NextResponse } from "next/server";
import { matchVideoForNarration, previewUrlForAsset } from "@/lib/stock";
import type { PeopleRepresentation, StockAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MatchBody = {
  narration?: string;
  caption?: string;
  topicContext?: string;
  excludeIds?: string[];
  provider?: string;
  peopleRepresentation?: PeopleRepresentation;
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
    mediaPageUrl: asset.pageUrl,
    mediaLicense: asset.license ?? null,
    mediaQuery,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as MatchBody;
    const peopleRepresentation: PeopleRepresentation =
      body.peopleRepresentation ?? "all";

    // Batch mode: sync all unlocked scenes to their narration + race option without duplicates
    if (Array.isArray(body.scenes) && body.scenes.length > 0) {
      const usedIds: string[] = body.scenes
        .filter((s) => s.mediaLocked && s.mediaId)
        .map((s) => s.mediaId as string);
      const usedDemographics: PeopleRepresentation[] = [];

      const matches: Record<string, ReturnType<typeof assetPayload>> = {};

      for (const scene of body.scenes) {
        if (scene.mediaLocked) continue;
        const { asset, mediaQuery } = await matchVideoForNarration({
          narration: scene.narration || scene.caption || body.topicContext || "",
          caption: scene.caption,
          topicContext: body.topicContext,
          excludeIds: usedIds,
          preferredProvider: body.provider,
          peopleRepresentation,
          usedDemographics,
        });
        if (asset) {
          usedIds.push(asset.id);
          if (asset.demographics?.length) {
            usedDemographics.push(...asset.demographics);
          }
        }
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
      peopleRepresentation,
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
