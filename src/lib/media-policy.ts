import { assetMatchesCast, detectPeople, isAbstractAsset, type CastOption } from "./people";
import { getLocalAsset, matchVideoForNarration, previewUrlForAsset } from "./stock";
import type { Scene, StockAsset, VideoScript } from "./types";

/** Metadata we can judge a scene's current clip by (bundled asset or stored scene fields). */
function sceneClipMeta(scene: Scene): { title: string; tags: string[] } | null {
  const local = scene.mediaId ? getLocalAsset(scene.mediaId) : undefined;
  if (local) return { title: local.title, tags: local.tags };
  if (!scene.mediaUrl) return null;
  return { title: scene.mediaTitle ?? "", tags: scene.mediaPeople ?? [] };
}

/** True when the scene's clip breaks the no-abstract rule or the cast choice. */
export function sceneViolatesPolicy(scene: Scene, cast: CastOption): boolean {
  if (scene.mediaLocked) return false; // an explicit user pick always wins
  const meta = sceneClipMeta(scene);
  if (!meta) return true;
  if (isAbstractAsset(meta)) return true;
  if (cast === "any") return false;
  // Bundled clips are always re-classified with the current rules; stored
  // mediaPeople is only trusted for live clips we cannot look up again.
  const local = scene.mediaId ? getLocalAsset(scene.mediaId) : undefined;
  if (local) return !assetMatchesCast(local, cast);
  if ((scene.mediaPeople ?? []).includes(cast)) return false;
  return !assetMatchesCast(meta, cast);
}

function applyAsset(scene: Scene, asset: StockAsset, mediaQuery: string): Scene {
  return {
    ...scene,
    mediaId: asset.id,
    mediaType: "video",
    mediaUrl: previewUrlForAsset(asset),
    mediaThumb: asset.thumb || null,
    mediaTitle: asset.title || null,
    mediaCreator: asset.creator || null,
    mediaProvider: asset.provider || "pexels",
    mediaPeople: detectPeople(asset.title, asset.tags).groups,
    mediaQuery: mediaQuery || scene.mediaQuery,
    mediaStart: null,
  };
}

/**
 * Enforce the footage policy on a script: no abstract clips, and when a cast is
 * selected every unlocked scene uses footage tagged with that cast, re-matched
 * against that scene's own narration. Compliant scenes are left untouched.
 */
export async function enforceMediaPolicy(
  script: VideoScript,
  topicContext = "",
): Promise<{ script: VideoScript; changed: number }> {
  const cast: CastOption = script.options?.cast ?? "any";
  const scenes = script.scenes ?? [];
  const used = new Set<string>();
  for (const scene of scenes) {
    if (scene.mediaId && !sceneViolatesPolicy(scene, cast)) used.add(scene.mediaId);
  }

  let changed = 0;
  const next: Scene[] = [];
  for (const scene of scenes) {
    if (!sceneViolatesPolicy(scene, cast)) {
      // Refresh the recorded groups for bundled clips so badges stay accurate.
      const local = scene.mediaId ? getLocalAsset(scene.mediaId) : undefined;
      const meta = sceneClipMeta(scene);
      next.push(
        local
          ? { ...scene, mediaPeople: detectPeople(local.title, local.tags).groups }
          : meta && !scene.mediaPeople?.length
            ? { ...scene, mediaPeople: detectPeople(meta.title, meta.tags).groups }
            : scene,
      );
      continue;
    }
    const { asset, mediaQuery } = await matchVideoForNarration({
      narration: scene.narration || scene.caption || topicContext,
      caption: scene.caption,
      topicContext,
      excludeIds: [...used],
      cast,
    }).catch(() => ({ asset: null, mediaQuery: "" }));
    if (asset) {
      used.add(asset.id);
      next.push(applyAsset(scene, asset, mediaQuery));
      changed += 1;
    } else {
      next.push(scene);
    }
  }

  return { script: { ...script, scenes: next }, changed };
}
