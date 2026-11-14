import { LOCAL_CATALOG, matchBestStockVideo, previewUrlForAsset } from "./stock";
import { narrationFingerprint, sceneNarrationText } from "./fingerprint";
import type { Project, Scene, StockAsset } from "./types";

export { narrationFingerprint };

/**
 * Keeps every scene's footage in step with what the narrator is saying.
 *
 * Each scene stores a fingerprint of the narration its clip was matched to
 * (`mediaMatchedFor`). Whenever the narration changes — a manual edit, an AI
 * command, a rewrite — the fingerprint no longer matches and the clip is
 * re-picked from the narration's visual keywords. Clips the user chose by hand
 * (`mediaLocked`) are never replaced.
 */

const STOP = new Set(
  (
    "a an the and or but if then than so to of in on at by for with from into onto over under " +
    "about above below between through during before after again further once here there when " +
    "where why how all any both each few more most other some such no nor not only own same too " +
    "very can will just should now is are was were be been being have has had having do does did " +
    "doing would could might must shall may i me my we our you your he him his she her it its they " +
    "them their what which who whom this that these those am get got make makes made let lets " +
    "use uses using used one two three first next last also every thing things way ways really " +
    "like want need know think see look come goes going take takes give gives keep keeps start " +
    "starts try here's it's that's you're we're they're don't can't won't isn't simple simply " +
    "version step steps result results today tomorrow week weeks minute minutes second seconds " +
    "subscribe video videos more less much many well better best good great new real actually"
  ).split(/\s+/),
);

let vocabulary: Map<string, number> | null = null;

/** Words that actually describe footage, weighted by how often clips use them. */
function visualVocabulary(): Map<string, number> {
  if (vocabulary) return vocabulary;
  vocabulary = new Map();
  for (const asset of LOCAL_CATALOG) {
    if (asset.type !== "video") continue;
    const words = [...asset.tags, ...asset.title.toLowerCase().split(/[^a-z]+/)];
    for (const raw of words) {
      const word = raw.toLowerCase().trim();
      if (word.length < 3 || STOP.has(word)) continue;
      vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
    }
  }
  return vocabulary;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, "").replace(/'s$/, ""))
    .filter((word) => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word));
}

/** Naive singular form so "baristas" matches the "barista" tag. */
function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Build a stock-footage search query from narration. Words that appear in the
 * footage vocabulary (coffee, skyline, gym…) outrank generic words, then
 * concrete-sounding longer words; ties keep spoken order.
 */
export function narrationVisualQuery(
  narration: string,
  options: { caption?: string; topic?: string; fallback?: string } = {},
): string {
  const vocab = visualVocabulary();
  const spoken = tokens(narration);
  const supporting = tokens(`${options.caption ?? ""} ${options.topic ?? ""}`);

  const scored = new Map<string, { score: number; order: number }>();
  const add = (word: string, base: number, order: number) => {
    const form = vocab.has(word) ? word : singular(word);
    const hits = vocab.get(form) ?? 0;
    const score = base + (hits > 0 ? 6 + Math.min(hits, 6) : 0) + (form.length >= 6 ? 1 : 0);
    const existing = scored.get(form);
    if (!existing || existing.score < score) scored.set(form, { score, order: existing?.order ?? order });
    else existing.score += 1;
  };
  spoken.forEach((word, index) => add(word, 3, index));
  supporting.forEach((word, index) => add(word, 1, 1000 + index));

  const ranked = [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .map(([word]) => word);

  if (ranked.length === 0) return options.fallback?.trim() || "cinematic city";
  return ranked.slice(0, 3).join(" ");
}

export function sceneNeedsNarrationMatch(scene: Scene): boolean {
  if (scene.mediaLocked) return false;
  if (!scene.mediaUrl && !scene.mediaId) return true;
  return scene.mediaMatchedFor !== narrationFingerprint(sceneNarrationText(scene));
}

export function applyAssetToScene(
  scene: Scene,
  asset: StockAsset,
  extra: Partial<Scene> = {},
): Scene {
  return {
    ...scene,
    mediaId: asset.id,
    mediaType: "video",
    mediaUrl: previewUrlForAsset(asset),
    mediaThumb: asset.thumb || null,
    mediaTitle: asset.title || null,
    mediaCreator: asset.creator || null,
    mediaProvider: asset.provider || "pexels",
    mediaStart: 0,
    ...extra,
  };
}

/** Re-pick one scene's clip from its narration (no-op if locked or already in sync). */
export async function matchSceneToNarration(
  scene: Scene,
  options: { excludeIds?: string[]; topic?: string; force?: boolean } = {},
): Promise<Scene> {
  if (scene.mediaLocked && !options.force) return scene;
  if (!options.force && !sceneNeedsNarrationMatch(scene)) return scene;

  const narration = sceneNarrationText(scene);
  const query = narrationVisualQuery(narration, {
    caption: scene.caption,
    topic: options.topic,
    fallback: scene.mediaQuery,
  });

  let asset: StockAsset | null = null;
  try {
    asset = await matchBestStockVideo(query, options.excludeIds ?? []);
  } catch {
    asset = null;
  }
  if (!asset) {
    // Keep the current clip but still record the query used.
    return { ...scene, mediaQuery: query, mediaMatchedFor: narrationFingerprint(narration) };
  }

  return applyAssetToScene(scene, asset, {
    mediaQuery: query,
    mediaMatchedFor: narrationFingerprint(narration),
    mediaLocked: false,
  });
}

/**
 * Bring every unlocked scene of a project in line with its narration.
 * Adjacent scenes avoid reusing the same clip where possible.
 */
export async function syncScenesToNarration(
  scenes: Scene[],
  options: { topic?: string } = {},
): Promise<{ scenes: Scene[]; changed: number }> {
  const result: Scene[] = [];
  let changed = 0;
  for (const scene of scenes) {
    const used = [...result, ...scenes.slice(result.length + 1)]
      .map((item) => item.mediaId)
      .filter((id): id is string => Boolean(id));
    const next = await matchSceneToNarration(scene, { excludeIds: used, topic: options.topic });
    if (next.mediaId !== scene.mediaId || next.mediaMatchedFor !== scene.mediaMatchedFor) changed += 1;
    result.push(next);
  }
  return { scenes: result, changed };
}

export async function syncProjectToNarration(project: Project): Promise<{ project: Project; changed: number }> {
  const { scenes, changed } = await syncScenesToNarration(project.script.scenes ?? [], {
    topic: project.prompt,
  });
  return { project: { ...project, script: { ...project.script, scenes } }, changed };
}
