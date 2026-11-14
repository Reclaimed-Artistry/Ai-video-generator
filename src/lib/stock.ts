import catalogData from "./stock-catalog.json";
import type { MediaType, Scene, StockAsset, StockSource } from "./types";

export const LOCAL_CATALOG = catalogData as StockAsset[];
export const VIDEO_CATALOG = LOCAL_CATALOG.filter((asset) => asset.type === "video");

export function getLocalAsset(id: string): StockAsset | undefined {
  return LOCAL_CATALOG.find((asset) => asset.id === id);
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
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

/** Rank the bundled Pexels stock library against a search phrase. */
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

export function topLocalVideoScore(query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  let best = 0;
  for (const asset of VIDEO_CATALOG) {
    const score = scoreAsset(asset, tokens);
    if (score > best) best = score;
  }
  return best;
}

/** Best matching local video asset, used for synchronous hydration & fallback. */
export function matchLocalAsset(
  query: string,
  preferred?: MediaType | null,
  exclude: string[] = [],
): StockAsset | null {
  const type = preferred ?? "video";
  const candidates = searchLocalCatalog(query, {
    type,
    limit: 16,
  }).filter((asset) => !exclude.includes(asset.id));
  if (candidates.length > 0) return candidates[0];

  const reuse = searchLocalCatalog(query, { type, limit: 1 })[0];
  if (reuse) return reuse;

  const unusedFallback = VIDEO_CATALOG.find((asset) => !exclude.includes(asset.id));
  return unusedFallback ?? VIDEO_CATALOG[0] ?? null;
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
  // Keep external live provider clips (Mixkit / Wikimedia / NASA / Pixabay / Live Pexels)
  if (
    scene.mediaUrl &&
    scene.mediaType === "video" &&
    scene.mediaId &&
    !scene.mediaId.startsWith("v")
  ) {
    return {
      ...scene,
      mediaType: "video",
      mediaProvider: scene.mediaProvider || "mixkit",
    };
  }

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

// ---------------------------------------------------------------------------
// Live Stock Video Providers
// ---------------------------------------------------------------------------

function mapPexelsVideo(item: Record<string, unknown>): StockAsset {
  const files = (item.video_files as Record<string, unknown>[] | undefined) ??
    (item.files as Record<string, unknown>[] | undefined) ??
    [];
  const sources: StockSource[] = files
    .filter((file) => String(file.file_type ?? "").includes("mp4"))
    .map((file) => ({
      url: String(file.link ?? ""),
      width: Number(file.width ?? 0),
      height: Number(file.height ?? 0),
      fps: Number(file.fps ?? 30) || undefined,
      bytes: Number(file.size ?? 0) || undefined,
    }))
    .filter((source) => Boolean(source.url));

  const urlSlug = String(item.url ?? "")
    .replace(/\/$/, "")
    .split("/")
    .pop()
    ?.replace(/-\d+$/, "")
    .replace(/-/g, " ");

  return {
    id: `pexels-video-${item.id}`,
    provider: "pexels",
    type: "video",
    title:
      (item.title as string) ||
      (urlSlug ? urlSlug.charAt(0).toUpperCase() + urlSlug.slice(1) : "Pexels video"),
    tags: String(item.tags ?? urlSlug ?? "")
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter((t) => t.length > 2)
      .slice(0, 6),
    creator: (item.user as { name?: string } | undefined)?.name ?? "Pexels",
    pageUrl: (item.url as string) ?? "https://www.pexels.com/",
    thumb: (item.image as string) ?? "",
    duration: Number(item.duration ?? 10),
    portrait: Number(item.height ?? 0) > Number(item.width ?? 0),
    sources,
  };
}

async function searchPexelsLive(
  query: string,
  limit: number,
): Promise<StockAsset[] | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const q = query.trim() || "cinematic";
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const response = await fetch(url, {
      headers: { authorization: key },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { videos?: Record<string, unknown>[] };
    const mapped = (data.videos ?? [])
      .map(mapPexelsVideo)
      .filter((asset) => asset.sources.length > 0);
    return mapped.length > 0 ? mapped : null;
  } catch {
    return null;
  }
}

/**
 * Mixkit free stock video search (Envato Mixkit License) — live HD MP4s +
 * thumbnails with zero API key required.
 */
async function searchMixkitLive(
  query: string,
  limit: number,
): Promise<StockAsset[]> {
  const clean = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ");
  const slug = clean ? clean.split(" ").slice(0, 3).join("-") : "cinematic";
  const url = `https://mixkit.co/free-stock-video/${encodeURIComponent(slug)}/`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7500);
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        accept: "text/html",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return [];

    const html = await response.text();
    const idMatches = [
      ...html.matchAll(
        /https:\/\/assets\.mixkit\.co\/videos\/(\d+)\/\1-(?:360|720|1080)\.mp4/g,
      ),
    ];
    const uniqueIds = [...new Set(idMatches.map((m) => m[1]))].slice(0, limit);
    if (uniqueIds.length === 0) return [];

    const queryTokens = tokenize(query);
    return uniqueIds.map((id) => {
      const altMatch = new RegExp(
        `alt="([^"]{4,140})"[^>]{0,240}assets\\.mixkit\\.co/videos/${id}/|assets\\.mixkit\\.co/videos/${id}/[^"]{0,120}"[^>]{0,240}alt="([^"]{4,140})"`,
      ).exec(html);
      const rawTitle = (altMatch?.[1] || altMatch?.[2] || `Mixkit ${clean || "stock"} footage`)
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\.$/, "")
        .trim();

      const has1080InHtml = html.includes(`assets.mixkit.co/videos/${id}/${id}-1080.mp4`);
      const sources: StockSource[] = [
        {
          url: `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`,
          width: 640,
          height: 360,
          fps: 30,
        },
        {
          url: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
          width: 1280,
          height: 720,
          fps: 30,
        },
      ];
      if (has1080InHtml) {
        sources.push({
          url: `https://assets.mixkit.co/videos/${id}/${id}-1080.mp4`,
          width: 1920,
          height: 1080,
          fps: 30,
        });
      }

      const tags = [...new Set([...queryTokens, ...tokenize(rawTitle)])].slice(0, 6);

      return {
        id: `mixkit-${id}`,
        provider: "mixkit",
        type: "video" as const,
        title: rawTitle,
        tags,
        creator: "Mixkit",
        pageUrl: `https://mixkit.co/free-stock-video/${encodeURIComponent(slug)}/`,
        thumb: `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`,
        duration: 12,
        portrait: false,
        sources,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Wikimedia Commons open-license stock video API — WebM footage + JPEG
 * thumbnails, zero API key required.
 */
async function searchWikimediaLive(
  query: string,
  limit: number,
): Promise<StockAsset[]> {
  const q = query.trim() || "city skyline";
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrnamespace=6&gsrsearch=${encodeURIComponent(`filetype:video ${q}`)}` +
    `&gsrlimit=${Math.min(16, limit)}&prop=imageinfo&iiprop=url|size|mime|user&iiurlwidth=640&format=json`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "ReclaimedArtistry/1.0 (https://github.com/Reclaimed-Artistry/Ai-video-generator)",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      query?: { pages?: Record<string, Record<string, unknown>> };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const results: StockAsset[] = [];

    for (const page of pages) {
      const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
      if (!info) continue;
      const mime = String(info.mime ?? "");
      if (!mime.includes("webm") && !mime.includes("mp4")) continue;
      const fileUrl = String(info.url ?? "").split("?")[0];
      const thumb = String(info.thumburl ?? "");
      const sizeBytes = Number(info.size ?? 0);
      // Skip giant 100MB+ archival dumps so server downloads stay fast
      if (!fileUrl || !thumb || sizeBytes > 45 * 1024 * 1024) continue;

      const width = Number(info.width ?? 1280);
      const height = Number(info.height ?? 720);
      const cleanTitle = String(page.title ?? "Wikimedia clip")
        .replace(/^File:/i, "")
        .replace(/\.(webm|mp4|ogv)$/i, "")
        .replace(/_/g, " ")
        .trim();

      results.push({
        id: `wikimedia-${page.pageid}`,
        provider: "wikimedia",
        type: "video",
        title: cleanTitle,
        tags: tokenize(`${q} ${cleanTitle}`).slice(0, 6),
        creator: String(info.user ?? "Wikimedia Commons"),
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title ?? ""))}`,
        thumb,
        duration: Math.max(4, Math.min(60, Math.round(Number(info.duration ?? 12)))),
        portrait: height > width,
        sources: [{ url: fileUrl, width, height, bytes: sizeBytes }],
      });
    }
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * NASA Image & Video Library API — public-domain HD MP4 footage of Earth,
 * oceans, clouds, space, science, and engineering.
 */
async function searchNasaLive(
  query: string,
  limit: number,
): Promise<StockAsset[]> {
  const q = query.trim() || "earth";
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video&page_size=${Math.min(8, limit)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const response = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      collection?: {
        items?: {
          href?: string;
          data?: { nasa_id?: string; title?: string; keywords?: string[]; center?: string }[];
          links?: { rel?: string; href?: string }[];
        }[];
      };
    };

    const items = (data.collection?.items ?? []).slice(0, Math.min(6, limit));
    const resolved = await Promise.all(
      items.map(async (item): Promise<StockAsset | null> => {
        const meta = item.data?.[0];
        const thumb = item.links?.find((l) => l.rel === "preview")?.href;
        if (!meta?.nasa_id || !thumb || !item.href) return null;
        try {
          const manifestRes = await fetch(item.href);
          if (!manifestRes.ok) return null;
          const files = (await manifestRes.json()) as string[];
          const mp4s = files
            .filter((f) => typeof f === "string" && f.endsWith(".mp4"))
            .map((f) => f.replace(/^http:\/\//, "https://"));
          if (mp4s.length === 0) return null;

          const pickBySuffix = (suffix: string) =>
            mp4s.find((f) => f.toLowerCase().includes(suffix));
          const sources: StockSource[] = [];
          const mobile = pickBySuffix("~mobile.mp4") || pickBySuffix("~small.mp4");
          const medium = pickBySuffix("~medium.mp4") || pickBySuffix("~preview.mp4");
          const large = pickBySuffix("~large.mp4") || pickBySuffix("~orig.mp4");
          if (mobile) sources.push({ url: mobile, width: 640, height: 360 });
          if (medium) sources.push({ url: medium, width: 1280, height: 720 });
          if (large && sources.length === 0) sources.push({ url: large, width: 1920, height: 1080 });
          if (sources.length === 0) sources.push({ url: mp4s[0], width: 1280, height: 720 });

          return {
            id: `nasa-${meta.nasa_id}`,
            provider: "nasa",
            type: "video",
            title: meta.title || "NASA Footage",
            tags: (meta.keywords ?? tokenize(meta.title || q)).slice(0, 6),
            creator: meta.center ? `NASA / ${meta.center}` : "NASA",
            pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`,
            thumb: thumb.replace(/^http:\/\//, "https://"),
            duration: 15,
            portrait: false,
            sources,
          };
        } catch {
          return null;
        }
      }),
    );

    return resolved.filter((item): item is StockAsset => item !== null);
  } catch {
    return [];
  }
}

async function searchPixabayLive(
  query: string,
  limit: number,
): Promise<StockAsset[] | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const q = query.trim() || "cinematic";
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const response = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
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

function interleave(lists: StockAsset[][], limit: number): StockAsset[] {
  const out: StockAsset[] = [];
  const seen = new Set<string>();
  let idx = 0;
  while (out.length < limit) {
    let added = false;
    for (const list of lists) {
      const item = list[idx];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
    idx += 1;
  }
  return out;
}

/**
 * Multi-site stock video search (100% moving video clips).
 * Supports `all`, `pexels`, `mixkit`, `wikimedia`, `nasa`, and `pixabay`.
 */
export async function searchStock(
  query: string,
  opts: { type?: MediaType; limit?: number; provider?: string } = {},
): Promise<{ assets: StockAsset[]; source: string }> {
  const limit = opts.limit ?? 20;
  const provider = (opts.provider ?? "all").toLowerCase();
  const effectiveQuery = query.trim();

  if (provider === "pexels") {
    const live = await searchPexelsLive(effectiveQuery, limit);
    if (live && live.length > 0) return { assets: live, source: "pexels-live" };
    const local = effectiveQuery
      ? searchLocalCatalog(effectiveQuery, { type: "video", limit })
      : VIDEO_CATALOG.slice(0, limit);
    return {
      assets: local.length > 0 ? local : VIDEO_CATALOG.slice(0, limit),
      source: "pexels-pool",
    };
  }

  if (provider === "mixkit") {
    const mixkit = await searchMixkitLive(effectiveQuery || "cinematic", limit);
    if (mixkit.length > 0) return { assets: mixkit, source: "mixkit-live" };
    return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
  }

  if (provider === "wikimedia") {
    const wiki = await searchWikimediaLive(effectiveQuery || "city", limit);
    return { assets: wiki, source: "wikimedia-live" };
  }

  if (provider === "nasa") {
    const nasa = await searchNasaLive(effectiveQuery || "earth", limit);
    return { assets: nasa, source: "nasa-live" };
  }

  if (provider === "pixabay") {
    const pixabay = await searchPixabayLive(effectiveQuery, limit);
    if (pixabay && pixabay.length > 0) return { assets: pixabay, source: "pixabay-live" };
    // Clear fallback to live Mixkit + Pexels if Pixabay key isn't set
    const mixkit = await searchMixkitLive(effectiveQuery || "cinematic", limit);
    if (mixkit.length > 0) return { assets: mixkit, source: "mixkit-live (pixabay key unset)" };
    return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
  }

  // provider === "all": merge Pexels + Mixkit (+ Pixabay if key configured) in parallel!
  const [pexelsLive, mixkitLive, pixabayLive] = await Promise.all([
    searchPexelsLive(effectiveQuery, Math.ceil(limit / 2)),
    effectiveQuery ? searchMixkitLive(effectiveQuery, Math.ceil(limit / 2)) : Promise.resolve([]),
    searchPixabayLive(effectiveQuery, Math.ceil(limit / 3)),
  ]);

  const pexelsLocal = effectiveQuery
    ? searchLocalCatalog(effectiveQuery, { type: "video", limit: Math.ceil(limit / 2) })
    : VIDEO_CATALOG.slice(0, limit);

  const pexelsList = pexelsLive && pexelsLive.length > 0 ? pexelsLive : pexelsLocal;
  const lists = [pexelsList, mixkitLive, pixabayLive ?? []].filter((l) => l.length > 0);

  if (lists.length === 0) {
    return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
  }

  const sourcesUsed = [
    pexelsLive?.length ? "pexels-live" : pexelsLocal.length ? "pexels" : null,
    mixkitLive.length ? "mixkit" : null,
    pixabayLive?.length ? "pixabay" : null,
  ].filter(Boolean);

  return {
    assets: interleave(lists, limit),
    source: sourcesUsed.join(" + ") || "pexels-pool",
  };
}

/**
 * Smart topic-aware clip matcher for AI script generation and Command Box
 * scene swaps. Prefers live Pexels/Mixkit when the topic isn't strongly
 * covered in the local Pexels pool so obscure topics still get accurate video!
 */
export async function matchBestStockVideo(
  query: string,
  excludeIds: string[] = [],
  preferredProvider?: string,
): Promise<StockAsset | null> {
  if (preferredProvider && preferredProvider !== "all") {
    const { assets } = await searchStock(query, { provider: preferredProvider, limit: 8 });
    const picked = assets.find((a) => !excludeIds.includes(a.id)) ?? assets[0];
    if (picked) return picked;
  }

  // If Pexels API key is active, query live Pexels first
  if (process.env.PEXELS_API_KEY) {
    const live = await searchPexelsLive(query, 8);
    const picked = live?.find((a) => !excludeIds.includes(a.id)) ?? live?.[0];
    if (picked) return picked;
  }

  // If the local Pexels pool has a strong multi-signal match, use it (fast + verified renditions)
  const localScore = topLocalVideoScore(query);
  if (localScore >= 7) {
    const local = searchLocalCatalog(query, { type: "video", limit: 12 }).find(
      (a) => !excludeIds.includes(a.id),
    );
    if (local) return local;
  }

  // Otherwise query live Mixkit for topic-specific free HD video!
  const mixkit = await searchMixkitLive(query, 8);
  const pickedMixkit = mixkit.find((a) => !excludeIds.includes(a.id)) ?? mixkit[0];
  if (pickedMixkit) return pickedMixkit;

  return matchLocalAsset(query, "video", excludeIds);
}

export function providerStatus() {
  return {
    pexels: Boolean(process.env.PEXELS_API_KEY),
    mixkit: true,
    wikimedia: true,
    nasa: true,
    pixabay: Boolean(process.env.PIXABAY_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    pollinations: Boolean(process.env.POLLINATIONS_API_KEY),
    bundledLibrary: VIDEO_CATALOG.length,
  };
}
