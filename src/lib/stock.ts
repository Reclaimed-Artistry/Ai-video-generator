import catalogData from "./stock-catalog.json";
import type { MediaType, StockAsset, StockSource } from "./types";

import type { Scene } from "./types";

export const LOCAL_CATALOG = catalogData as StockAsset[];
export const VIDEO_CATALOG = LOCAL_CATALOG.filter((asset) => asset.type === "video");

export function getLocalAsset(id: string): StockAsset | undefined {
  return LOCAL_CATALOG.find((asset) => asset.id === id);
}

/**
 * Pick a lightweight 360p–720p stream URL suitable for smooth browser preview,
 * while the server-side FFmpeg pipeline independently selects the exact master
 * rendition via `pickSource(asset, targetHeight)`.
 */
export function previewUrlForAsset(asset: StockAsset): string | null {
  if (!asset.sources?.length) return null;
  const preferred = pickSource(asset, 540) ?? asset.sources[0];
  return preferred?.url ?? null;
}

export function hydrateSceneMedia(scene: Scene): Scene {
  const fromId = scene.mediaId ? getLocalAsset(scene.mediaId) : undefined;
  const videoAsset =
    fromId && fromId.type === "video"
      ? fromId
      : matchLocalAsset(scene.mediaQuery || scene.caption || "city", "video");

  if (!videoAsset) return scene;

  return {
    ...scene,
    mediaId: scene.mediaId && fromId?.type === "video" ? scene.mediaId : videoAsset.id,
    mediaType: "video",
    mediaUrl:
      scene.mediaUrl && scene.mediaType === "video"
        ? scene.mediaUrl
        : previewUrlForAsset(videoAsset),
    mediaThumb: scene.mediaThumb || videoAsset.thumb || null,
    mediaTitle: scene.mediaTitle || videoAsset.title || null,
    mediaCreator: scene.mediaCreator || videoAsset.creator || null,
    mediaProvider: scene.mediaProvider || videoAsset.provider || "pexels",
  };
}

const STOPWORDS = new Set(
  ("the and for with your you our are was were this that these those from into onto over under " +
    "about after before while when then than them they their there here have has had not but out off " +
    "just more most less very can will would could should what which who whom how why all any each " +
    "every some such only own same too its it's his her him she one two three four five six seven " +
    "eight nine ten get got make makes made let lets like way ways start starts keep keeps time times " +
    "day days even also back up down tonight today now new tip tips step steps thing things").split(" "),
);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function scoreAsset(asset: StockAsset, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = asset.title.toLowerCase();
  const tags = asset.tags.map((tag) => tag.toLowerCase());
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 4;
    if (tags.some((tag) => tag === token)) score += 3;
    else if (tags.some((tag) => tag.includes(token))) score += 1;
  }
  return score;
}

/** Rank the bundled stock library against a search phrase. */
export function searchLocalCatalog(
  query: string,
  opts: { type?: MediaType; limit?: number } = {},
): StockAsset[] {
  const tokens = tokenize(query);
  const limit = opts.limit ?? 24;
  return LOCAL_CATALOG.filter((asset) => !opts.type || asset.type === opts.type)
    .map((asset) => ({ asset, score: scoreAsset(asset, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.title.localeCompare(b.asset.title))
    .slice(0, limit)
    .map((entry) => entry.asset);
}

/** Best matching local asset, used to auto-fill scenes. */
export function matchLocalAsset(
  query: string,
  preferred?: MediaType | null,
  exclude: string[] = [],
): StockAsset | null {
  const candidates = searchLocalCatalog(query, {
    type: preferred ?? undefined,
    limit: 12,
  }).filter((asset) => !exclude.includes(asset.id));
  if (candidates.length > 0) return candidates[0];
  if (preferred) {
    const fallback = searchLocalCatalog(query, { type: preferred, limit: 12 }).filter(
      (asset) => !exclude.includes(asset.id),
    );
    if (fallback[0]) return fallback[0];
    // Everything matched is already used elsewhere: reuse the best match so a
    // scene never ends up without footage.
    const reuse = searchLocalCatalog(query, { type: preferred, limit: 1 })[0];
    if (reuse) return reuse;
    // Last resort: any clip from the library.
    return LOCAL_CATALOG.find((asset) => asset.type === preferred) ?? null;
  }
  return null;
}

function mapPexelsVideo(item: Record<string, unknown>): StockAsset {
  const files = (item.files as Record<string, unknown>[] | undefined) ?? [];
  const sources: StockSource[] = files
    .filter((file) => (file.file_type as string)?.includes("mp4"))
    .map((file) => ({
      url: file.link as string,
      width: Number(file.width ?? 0),
      height: Number(file.height ?? 0),
      fps: undefined,
      bytes: Number(file.size ?? 0),
    }))
    .filter((source) => source.url);
  return {
    id: `pexels-video-${item.id}`,
    provider: "pexels",
    type: "video",
    title: (item.title as string) || "Pexels video",
    tags: String(item.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    creator: (item.user as { name?: string } | undefined)?.name ?? "Pexels",
    pageUrl: (item.url as string) ?? "https://www.pexels.com/",
    thumb: (item.image as string) ?? "",
    duration: Number(item.duration ?? 10),
    sources,
  };
}

function mapPexelsPhoto(item: Record<string, unknown>): StockAsset {
  const src = (item.src ?? {}) as Record<string, string>;
  const sources: StockSource[] = [
    { url: src.large2x ?? src.original, width: 1880 },
    { url: src.large, width: 1200 },
    { url: src.medium, width: 800 },
  ].filter((source) => Boolean(source.url));
  return {
    id: `pexels-photo-${item.id}`,
    provider: "pexels",
    type: "photo",
    title: (item.alt as string) || "Pexels photo",
    tags: String(item.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    creator: (item.photographer as string) ?? "Pexels",
    pageUrl: (item.url as string) ?? "https://www.pexels.com/",
    thumb: src.medium ?? src.original ?? "",
    sources,
  };
}

async function searchPexels(
  query: string,
  type: MediaType,
  limit: number,
): Promise<StockAsset[] | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const url =
    type === "video"
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}`
      : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}`;
  try {
    const response = await fetch(url, { headers: { authorization: key } });
    if (!response.ok) return null;
    const data = (await response.json()) as { videos?: Record<string, unknown>[]; photos?: Record<string, unknown>[] };
    if (type === "video") return (data.videos ?? []).map(mapPexelsVideo);
    return (data.photos ?? []).map(mapPexelsPhoto);
  } catch {
    return null;
  }
}

async function searchPixabay(
  query: string,
  limit: number,
): Promise<StockAsset[] | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const q = query.trim() || "cinematic";
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { hits?: Record<string, unknown>[] };
    return (data.hits ?? []).map((hit) => {
      const videos = (hit.videos ?? {}) as Record<string, Record<string, unknown>>;
      const sources: StockSource[] = Object.values(videos)
        .filter((variant) => variant && typeof variant.url === "string")
        .map((variant) => ({
          url: variant.url as string,
          width: Number(variant.width ?? 0),
          height: Number(variant.height ?? 0),
          bytes: Number(variant.size ?? 0),
        }));
      const mediumThumb = (videos.medium?.thumbnail ?? videos.small?.thumbnail ?? "") as string;
      return {
        id: `pixabay-${hit.id}`,
        provider: "pixabay",
        type: "video",
        title: String(hit.tags ?? "Pixabay clip").split(",")[0].trim(),
        tags: String(hit.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        creator: String(hit.user ?? "Pixabay"),
        pageUrl: String(hit.pageURL ?? "https://pixabay.com/videos/"),
        thumb: mediumThumb,
        duration: Number(hit.duration ?? 10),
        sources,
      } satisfies StockAsset;
    });
  } catch {
    return null;
  }
}

/**
 * Search configured stock video providers (videos only). Queries live Pexels
 * and Pixabay APIs when keys are present, merging or falling back cleanly to
 * the verified Pexels video pool.
 */
export async function searchStock(
  query: string,
  opts: { type?: MediaType; limit?: number; provider?: string } = {},
): Promise<{ assets: StockAsset[]; source: string }> {
  const limit = opts.limit ?? 20;
  const provider = (opts.provider ?? "all").toLowerCase();
  const effectiveQuery = query.trim();

  if (provider === "pexels" || provider === "all") {
    const pexels = await searchPexels(effectiveQuery || "cinematic", "video", limit);
    if (pexels && pexels.length > 0 && provider === "pexels") {
      return { assets: pexels, source: "pexels-live" };
    }
    if (pexels && pexels.length > 0 && provider === "all") {
      const pixabay = await searchPixabay(effectiveQuery || "cinematic", Math.max(6, Math.floor(limit / 3)));
      const combined = pixabay?.length ? [...pexels, ...pixabay].slice(0, limit) : pexels;
      return {
        assets: combined,
        source: pixabay?.length ? "pexels+pixabay" : "pexels-live",
      };
    }
  }

  if (provider === "pixabay") {
    const pixabay = await searchPixabay(effectiveQuery || "cinematic", limit);
    if (pixabay && pixabay.length > 0) {
      return { assets: pixabay, source: "pixabay-live" };
    }
  }

  if (!effectiveQuery) {
    return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
  }

  const localMatches = searchLocalCatalog(effectiveQuery, { type: "video", limit });
  if (localMatches.length > 0) {
    return { assets: localMatches, source: "pexels-pool" };
  }

  return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
}

/** Choose the smallest rendition that still covers the requested height. */
export function pickSource(
  asset: StockAsset,
  targetHeight: number,
): StockSource | null {
  if (asset.sources.length === 0) return null;
  const sorted = [...asset.sources].sort((a, b) => {
    const aHeight = a.height ?? Math.round((a.width * 9) / 16);
    const bHeight = b.height ?? Math.round((b.width * 9) / 16);
    return aHeight - bHeight;
  });
  const covering = sorted.find((source) => {
    const height = source.height ?? Math.round((source.width * 9) / 16);
    return height >= targetHeight;
  });
  return covering ?? sorted[sorted.length - 1];
}

export function providerStatus() {
  return {
    pexels: Boolean(process.env.PEXELS_API_KEY),
    pixabay: Boolean(process.env.PIXABAY_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    bundledLibrary: VIDEO_CATALOG.length,
  };
}
