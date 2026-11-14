import catalogData from "./stock-catalog.json";
import type { MediaType, Scene, StockAsset, StockSource } from "./types";

import {
  assetMatchesCast,
  castLabel,
  castSearchTerms,
  detectPeople,
  isAbstractAsset,
  sceneTokensForNarration,
  type CastOption,
} from "./people";

/** Bundled library minus any motion-graphic / abstract footage. */
export const LOCAL_CATALOG = (catalogData as StockAsset[]).filter(
  (asset) => asset.type !== "video" || !isAbstractAsset(asset),
);
export const VIDEO_CATALOG = LOCAL_CATALOG.filter((asset) => asset.type === "video");

export function getLocalAsset(id: string): StockAsset | undefined {
  return LOCAL_CATALOG.find((asset) => asset.id === id);
}

const VISUAL_STOP_WORDS = new Set([
  // Common 3-letter & grammatical words
  "the", "and", "for", "are", "you", "all", "can", "had", "her", "was", "one",
  "our", "out", "day", "get", "has", "him", "his", "how", "its", "let", "may",
  "new", "now", "old", "see", "two", "way", "who", "did", "own", "say", "she",
  "too", "use", "but", "not", "top", "try", "why", "yet", "put", "set", "big",
  "end", "far", "few", "cut", "add", "fit", "hit", "low", "mix", "pay", "win",
  // Abstract / narrative filler words (never concrete filmable subjects)
  "about", "after", "again", "against", "almost", "already", "also", "always",
  "another", "around", "because", "before", "being", "below", "best", "better",
  "between", "both", "breakthrough", "brief", "build", "built", "carry",
  "change", "changes", "changing", "clear", "clicks", "clip", "clips", "closer",
  "comes", "comment", "compounds", "could", "create", "created", "creates",
  "creating", "cutting", "daily", "decision", "deliver", "delivers", "designed",
  "difference", "different", "disposables", "does", "done", "dont", "double",
  "down", "draft", "durable", "easier", "easily", "easy", "edit", "editing",
  "effort", "enough", "every", "everyday", "everything", "experience", "explain",
  "explained", "explainer", "explaining", "fast", "faster", "feel", "feels",
  "film", "finally", "first", "five", "follow", "four", "framework", "friendly",
  "from", "full", "generate", "getting", "give", "goes", "going", "good",
  "great", "guess", "guesswork", "guide", "half", "happens", "have", "help",
  "helps", "here", "high", "hours", "idea", "ideas", "imagine", "important",
  "instead", "into", "just", "keep", "keeps", "know", "lands", "last", "launch",
  "less", "like", "link", "little", "look", "looks", "make", "makes", "making",
  "many", "materials", "matter", "matters", "maybe", "meet", "minute", "minutes",
  "modern", "more", "most", "motion", "much", "need", "needs", "never", "next",
  "noise", "none", "nothing", "notice", "obvious", "once", "only", "other",
  "others", "over", "part", "people", "picture", "piece", "play", "post",
  "practical", "problem", "project", "promo", "proof", "quality", "quick",
  "quickly", "quietly", "real", "really", "reason", "reel", "repeatable",
  "replace", "responsible", "result", "results", "right", "same", "save",
  "scene", "scenes", "script", "scroll", "scrolling", "second", "seconds",
  "seem", "seems", "shift", "short", "shorts", "should", "show", "shows", "side",
  "simple", "simpler", "simply", "single", "small", "some", "something", "soon",
  "sourcing", "start", "started", "starting", "stays", "step", "steps", "still",
  "stop", "story", "strong", "subscribe", "such", "sure", "switch", "system",
  "take", "takes", "talk", "tell", "than", "that", "their", "them", "then",
  "there", "these", "they", "thing", "things", "think", "third", "this", "those",
  "thousands", "three", "through", "time", "today", "together", "told", "tone",
  "treat", "trend", "true", "turn", "turns", "under", "until", "using",
  "version", "very", "video", "videos", "want", "wasted", "watch", "watching",
  "ways", "week", "weeks", "well", "were", "what", "when", "where", "which",
  "while", "whole", "will", "with", "without", "word", "words", "work", "works",
  "worth", "would", "write", "your", "yourself",
]);

type VisualConcept = {
  triggers: string[];
  slugs: string[];
  displayQuery: string;
  preferNasa?: boolean;
};

/**
 * Concrete visual concept dictionary mapping narrative subjects & synonyms
 * to filmable B-roll slugs verified to return rich HD footage.
 */
const VISUAL_CONCEPTS: VisualConcept[] = [
  {
    triggers: ["bottle", "water bottle", "hydration", "flask", "reusable", "thermos", "plastic"],
    slugs: ["water-bottle", "water", "drinking-water", "nature"],
    displayQuery: "water bottle hydration",
  },
  {
    triggers: ["coffee", "espresso", "barista", "latte", "roastery", "roaster", "cappuccino", "cafe", "beans", "brew"],
    slugs: ["coffee-barista", "coffee", "cafe", "espresso"],
    displayQuery: "barista coffee espresso",
  },
  {
    triggers: ["pasta", "cooking", "recipe", "chef", "kitchen", "baking", "bread", "restaurant", "meal", "dinner", "food", "ingredient", "dish", "smoothie", "cake"],
    slugs: ["cooking", "kitchen", "chef", "food"],
    displayQuery: "chef cooking kitchen",
  },
  {
    triggers: ["robot", "robotics", "ai", "agent", "agents", "artificial intelligence", "chatbot", "automation", "machine learning", "neural", "algorithm", "llm"],
    slugs: ["robot", "technology", "coding", "computer"],
    displayQuery: "ai robot technology",
  },
  {
    triggers: ["code", "coding", "software", "developer", "programming", "app", "saas", "cybersecurity", "cloud", "server", "data", "analytics", "dashboard", "digital", "network", "tech", "technology"],
    slugs: ["coding", "technology", "computer", "data"],
    displayQuery: "software technology data",
  },
  {
    triggers: ["dog", "puppy", "dogs", "pet", "pets"],
    slugs: ["dog", "dog-park", "puppy"],
    displayQuery: "dog playing park",
  },
  {
    triggers: ["cat", "kitten", "cats"],
    slugs: ["cat", "kitten"],
    displayQuery: "cat indoor portrait",
  },
  {
    triggers: ["lion", "safari", "elephant", "tiger", "wildlife", "animal", "animals", "savanna", "zoo"],
    slugs: ["lion", "wildlife", "animals", "nature"],
    displayQuery: "lion wildlife safari",
  },
  {
    triggers: ["outer space", "spaceship", "space station", "astronaut", "rocket", "galaxy", "planet", "mars", "moon", "cosmos", "stars", "universe", "nasa", "orbit", "satellite"],
    slugs: ["space", "stars", "earth", "galaxy"],
    displayQuery: "space galaxy stars",
    preferNasa: true,
  },
  {
    triggers: ["ocean", "waves", "sea", "surf", "underwater", "coral", "marine", "coast", "shore", "beach", "island"],
    slugs: ["ocean", "beach", "waves", "sea"],
    displayQuery: "ocean waves coast",
  },
  {
    triggers: ["mountain", "mountains", "hiking", "hike", "trail", "alps", "summit", "peak", "climbing", "trek"],
    slugs: ["mountain-hiking", "mountain", "forest", "nature"],
    displayQuery: "mountain hiking landscape",
  },
  {
    triggers: ["forest", "trees", "woods", "jungle", "rainforest", "sustainable", "sustainability", "climate", "eco", "green", "environment", "earth", "river", "waterfall", "wildlife", "nature"],
    slugs: ["forest", "nature", "river", "water"],
    displayQuery: "forest nature river",
  },
  {
    triggers: ["gym", "workout", "fitness", "training", "running", "runner", "marathon", "exercise", "muscle", "weightlifting", "cardio", "athlete", "sport", "yoga", "stretch", "mobility"],
    slugs: ["gym", "workout", "running", "yoga"],
    displayQuery: "gym workout fitness",
  },
  {
    triggers: ["doctor", "hospital", "medical", "medicine", "clinic", "healthcare", "nurse", "surgery", "stethoscope", "microscope", "laboratory", "vaccine", "pharmacy"],
    slugs: ["doctor", "medical", "hospital", "laboratory"],
    displayQuery: "doctor medical clinic",
  },
  {
    triggers: ["money", "finance", "invest", "investing", "stock", "stocks", "crypto", "banking", "bank", "revenue", "profit", "wealth", "budget", "economy", "trading"],
    slugs: ["money", "finance", "business", "office"],
    displayQuery: "finance money business",
  },
  {
    triggers: ["car", "cars", "driving", "drive", "vehicle", "electric", "highway", "road", "roadtrip", "traffic", "supercar", "automotive"],
    slugs: ["car", "driving", "highway", "traffic"],
    displayQuery: "car driving highway",
  },
  {
    triggers: ["airplane", "flight", "airport", "plane", "travel", "vacation", "holiday", "hotel", "passport", "destination", "tourist", "adventure"],
    slugs: ["airplane", "travel", "beach", "hotel"],
    displayQuery: "airplane flight travel",
  },
  {
    triggers: ["train", "railway", "subway", "metro", "commute", "rail", "station"],
    slugs: ["train", "city", "street", "skyline"],
    displayQuery: "train city transit",
  },
  {
    triggers: ["city", "skyline", "downtown", "urban", "architecture", "skyscraper", "building", "buildings", "street", "nightlife", "rooftop"],
    slugs: ["city", "skyline", "street", "architecture"],
    displayQuery: "city skyline architecture",
  },
  {
    triggers: ["house", "home", "apartment", "interior", "real estate", "living room", "property", "furniture", "design", "minimalist"],
    slugs: ["house", "interior", "architecture", "living-room"],
    displayQuery: "modern house interior",
  },
  {
    triggers: ["guitar", "piano", "music", "musician", "concert", "band", "singer", "dj", "audio", "podcast", "microphone", "music studio", "recording studio"],
    slugs: ["guitar", "music", "concert", "microphone"],
    displayQuery: "music guitar studio",
  },
  {
    triggers: ["camera", "filming", "cinema", "photographer", "creator", "youtube", "tiktok", "instagram", "social", "marketing", "brand", "advertising", "campaign", "smartphone", "neon"],
    slugs: ["camera", "smartphone", "neon", "studio"],
    displayQuery: "camera creator studio",
  },
  {
    triggers: ["student", "school", "university", "college", "study", "studying", "library", "book", "books", "reading", "teacher", "classroom", "course", "learn", "education", "workshop"],
    slugs: ["studying", "books", "library", "laptop"],
    displayQuery: "studying books workspace",
  },
  {
    triggers: ["fashion", "clothing", "dress", "model", "skincare", "beauty", "cosmetics", "makeup", "jewelry", "luxury", "watch", "perfume"],
    slugs: ["fashion", "beauty", "portrait", "luxury"],
    displayQuery: "fashion beauty portrait",
  },
  {
    triggers: ["startup", "founder", "founders", "team", "meeting", "office", "workspace", "desk", "laptop", "productivity", "remote", "support", "customer", "client", "business", "company", "sales", "strategy", "entrepreneur"],
    slugs: ["startup-office", "office", "meeting", "laptop"],
    displayQuery: "startup team office",
  },
  {
    triggers: ["morning", "sunrise", "sunset", "routine", "habit", "meditation", "mindfulness", "calm", "journal", "focus", "wellness", "sleep"],
    slugs: ["sunrise", "morning", "sunset", "coffee"],
    displayQuery: "sunrise morning routine",
  },
  {
    triggers: ["art", "artistry", "painting", "woodworking", "woodcraft", "pottery", "ceramic", "ceramics", "sculpture", "artist", "reclaimed", "handmade", "artisan", "gallery", "handcraft"],
    slugs: ["painting", "art", "craft", "artist"],
    displayQuery: "artisan craft studio",
  },
];

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function extractConcreteWords(text: string): string[] {
  return tokenize(text).filter((word) => !VISUAL_STOP_WORDS.has(word));
}

export type VisualSearchPlan = {
  displayQuery: string;
  slugs: string[];
  targetTokens: string[];
  preferNasa: boolean;
};

/**
 * Turns any scene's spoken narration (+ caption + overall video topic) into an
 * ordered list of concrete filmable search slugs and relevance-scoring tokens.
 */
export function buildVisualSearchPlan(
  narration: string,
  caption = "",
  topicContext = "",
): VisualSearchPlan {
  const primaryText = `${narration} ${caption}`.trim();
  const primaryLower = primaryText.toLowerCase();
  const contextLower = topicContext.toLowerCase();

  const concretePrimary = extractConcreteWords(primaryText);
  const concreteContext = extractConcreteWords(topicContext);

  const matchedPrimaryConcepts: VisualConcept[] = [];
  const matchedContextConcepts: VisualConcept[] = [];

  for (const concept of VISUAL_CONCEPTS) {
    const inPrimary = concept.triggers.some((t) =>
      new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(
        primaryLower,
      ),
    );
    if (inPrimary) {
      matchedPrimaryConcepts.push(concept);
      continue;
    }
    const inContext =
      contextLower.length > 0 &&
      concept.triggers.some((t) =>
        new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(
          contextLower,
        ),
      );
    if (inContext) {
      matchedContextConcepts.push(concept);
    }
  }

  const orderedConcepts =
    matchedPrimaryConcepts.length > 0
      ? [...matchedPrimaryConcepts, ...matchedContextConcepts]
      : matchedContextConcepts;

  const slugs: string[] = [];
  const pushSlug = (raw: string) => {
    const clean = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .trim()
      .replace(/\s+/g, "-");
    if (clean.length >= 3 && !slugs.includes(clean)) {
      slugs.push(clean);
    }
  };

  // 1. Verified matched visual concepts first (primary narration -> overall topic)
  for (const concept of matchedPrimaryConcepts) {
    for (const s of concept.slugs) pushSlug(s);
  }
  for (const concept of matchedContextConcepts) {
    for (const s of concept.slugs) pushSlug(s);
  }

  // 2. Concrete nouns extracted directly from narration & topic
  if (concretePrimary.length >= 2) {
    pushSlug(`${concretePrimary[0]}-${concretePrimary[1]}`);
  }
  for (const word of concretePrimary.slice(0, 3)) {
    pushSlug(word);
  }
  for (const word of concreteContext.slice(0, 3)) {
    pushSlug(word);
  }

  if (slugs.length === 0) {
    pushSlug("cinematic");
    pushSlug("city");
  }

  const targetTokens = [
    ...new Set([
      ...matchedPrimaryConcepts.flatMap((c) => c.slugs.flatMap((s) => s.split("-"))),
      ...concretePrimary.slice(0, 5),
      ...matchedContextConcepts.flatMap((c) => c.slugs.flatMap((s) => s.split("-"))),
      ...concreteContext.slice(0, 4),
    ]),
  ].filter((t) => t.length > 2);

  const displayQuery =
    matchedPrimaryConcepts[0]?.displayQuery ||
    matchedContextConcepts[0]?.displayQuery ||
    (concretePrimary.length >= 2
      ? concretePrimary.slice(0, 3).join(" ")
      : concretePrimary[0]
        ? `${concretePrimary[0]} ${concreteContext[0] ?? ""}`.trim()
        : concreteContext.slice(0, 3).join(" ") || "cinematic footage");

  return {
    displayQuery,
    slugs: slugs.slice(0, 6),
    targetTokens,
    preferNasa: orderedConcepts.some((c) => c.preferNasa),
  };
}

function scoreAsset(asset: StockAsset, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = asset.title.toLowerCase();
  const titleWords = new Set(tokenize(title));
  const tags = asset.tags.map((tag) => tag.toLowerCase());
  let score = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    // Earlier tokens come directly from the scene's own narration -> higher weight
    const weight = i < 3 ? 2 : 1;
    if (titleWords.has(token)) score += 6 * weight;
    else if (title.includes(token)) score += 3 * weight;

    if (tags.some((tag) => tag === token)) score += 4 * weight;
    else if (tags.some((tag) => tag.includes(token))) score += 2 * weight;
  }
  return score;
}

/** Rank the bundled Pexels stock library against a search phrase. */
export function searchLocalCatalog(
  query: string,
  opts: { type?: MediaType; limit?: number; cast?: CastOption | null } = {},
): StockAsset[] {
  const tokens = extractConcreteWords(query);
  const fallbackTokens = tokens.length > 0 ? tokens : tokenize(query);
  const limit = opts.limit ?? 24;
  return LOCAL_CATALOG.filter(
    (asset) => (!opts.type || asset.type === opts.type) && assetMatchesCast(asset, opts.cast),
  )
    .map((asset) => ({ asset, score: scoreAsset(asset, fallbackTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.title.localeCompare(b.asset.title))
    .slice(0, limit)
    .map((entry) => entry.asset);
}

export function topLocalVideoScore(query: string): number {
  const tokens = extractConcreteWords(query);
  const effective = tokens.length > 0 ? tokens : tokenize(query);
  if (effective.length === 0) return 0;
  let best = 0;
  for (const asset of VIDEO_CATALOG) {
    const score = scoreAsset(asset, effective);
    if (score > best) best = score;
  }
  return best;
}

/** Best matching local video asset, used for synchronous hydration & fallback. */
export function matchLocalAsset(
  query: string,
  preferred?: MediaType | null,
  exclude: string[] = [],
  cast?: CastOption | null,
): StockAsset | null {
  const type = preferred ?? "video";
  const candidates = searchLocalCatalog(query, {
    type,
    limit: 16,
    cast,
  }).filter((asset) => !exclude.includes(asset.id));
  if (candidates.length > 0) return candidates[0];

  const reuse = searchLocalCatalog(query, { type, limit: 1, cast })[0];
  if (reuse) return reuse;

  // Never fall back outside the requested cast.
  const pool = cast && cast !== "any"
    ? VIDEO_CATALOG.filter((asset) => assetMatchesCast(asset, cast))
    : VIDEO_CATALOG;
  const unusedFallback = pool.find((asset) => !exclude.includes(asset.id));
  return unusedFallback ?? pool[0] ?? null;
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

export function hydrateSceneMedia(scene: Scene, cast?: CastOption | null): Scene {
  // Keep custom uploaded/pasted URLs and live external provider clips intact
  if (
    scene.mediaUrl &&
    scene.mediaType === "video" &&
    (!scene.mediaId || !scene.mediaId.startsWith("v"))
  ) {
    return {
      ...scene,
      mediaType: "video",
      mediaProvider: scene.mediaProvider || "custom",
    };
  }

  const fromId = scene.mediaId ? getLocalAsset(scene.mediaId) : undefined;
  const videoAsset =
    fromId && fromId.type === "video"
      ? fromId
      : matchLocalAsset(
          scene.mediaQuery || scene.narration || scene.caption || "city",
          "video",
          [],
          cast,
        );

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
// Live Multi-Site Stock Video Providers
// ---------------------------------------------------------------------------

function mapPexelsVideo(item: Record<string, unknown>): StockAsset {
  const files =
    (item.video_files as Record<string, unknown>[] | undefined) ??
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
    tags: [
      // Thumbnail file names carry Pexels' tag slug (e.g. "african-american-family").
      String(item.image ?? "")
        .split("/")
        .pop()
        ?.replace(/\?.*$/, "")
        .replace(/\.(jpe?g|png)$/i, "")
        .replace(/-?\d+$/, "")
        .replace(/^pexels-photo$/, "")
        .replace(/-/g, " ") ?? "",
      ...String(item.tags ?? urlSlug ?? "")
        .split(/[,\s]+/)
        .map((tag) => tag.trim())
        .filter((t) => t.length > 2)
        .slice(0, 6),
    ].filter(Boolean),
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

const globalMixkit = globalThis as typeof globalThis & {
  __raMixkitCache?: Map<string, { ts: number; items: StockAsset[] }>;
  __raMixkitCooldownUntil?: number;
};

function mixkitCache() {
  if (!globalMixkit.__raMixkitCache) globalMixkit.__raMixkitCache = new Map();
  return globalMixkit.__raMixkitCache;
}

async function fetchMixkitSlug(slug: string, limit: number): Promise<StockAsset[]> {
  const cached = mixkitCache().get(slug);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
    return cached.items.slice(0, limit);
  }
  if (globalMixkit.__raMixkitCooldownUntil && Date.now() < globalMixkit.__raMixkitCooldownUntil) {
    return [];
  }

  const url = `https://mixkit.co/free-stock-video/${encodeURIComponent(slug)}/`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        accept: "text/html",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (response.status === 429) {
      // Back off for 90s on rate-limit so we don't stall renders
      globalMixkit.__raMixkitCooldownUntil = Date.now() + 90_000;
      return [];
    }
    if (!response.ok) {
      mixkitCache().set(slug, { ts: Date.now(), items: [] });
      return [];
    }

    const html = await response.text();
    const idMatches = [
      ...html.matchAll(
        /https:\/\/assets\.mixkit\.co\/videos\/(\d+)\/\1-(?:360|720|1080)\.mp4/g,
      ),
    ];
    const uniqueIds = [...new Set(idMatches.map((m) => m[1]))].slice(0, limit);
    if (uniqueIds.length === 0) return [];

    const slugTokens = slug.split("-").filter((t) => t.length > 2);
    return uniqueIds.map((id) => {
      const altMatch = new RegExp(
        `alt="([^"]{4,160})"[^>]{0,280}assets\\.mixkit\\.co/videos/${id}/|assets\\.mixkit\\.co/videos/${id}/[^"]{0,140}"[^>]{0,280}alt="([^"]{4,160})"`,
      ).exec(html);
      const rawTitle = (
        altMatch?.[1] ||
        altMatch?.[2] ||
        `Mixkit ${slug.replace(/-/g, " ")} footage`
      )
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\.$/, "")
        .trim();

      const has1080InHtml = html.includes(
        `assets.mixkit.co/videos/${id}/${id}-1080.mp4`,
      );
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

      const tags = [...new Set([...slugTokens, ...extractConcreteWords(rawTitle)])].slice(
        0,
        7,
      );

      return {
        id: `mixkit-${id}`,
        provider: "mixkit",
        type: "video",
        title: rawTitle,
        tags,
        creator: "Mixkit",
        pageUrl: url,
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

async function fetchMixkitSlugCached(slug: string, limit: number): Promise<StockAsset[]> {
  const items = await fetchMixkitSlug(slug, Math.max(limit, 18));
  if (items.length > 0) {
    mixkitCache().set(slug, { ts: Date.now(), items });
  }
  return items.slice(0, limit);
}

/**
 * Rate-limit-friendly Mixkit live search: tries candidate slugs sequentially
 * (using the 30-min cache) and stops at the first slug with real hits so we
 * never burst Mixkit into HTTP 429.
 */
async function searchMixkitLive(
  query: string,
  limit: number,
  extraSlugs: string[] = [],
): Promise<StockAsset[]> {
  const words = extractConcreteWords(query);
  const rawWords = words.length > 0 ? words : tokenize(query);

  const candidates: string[] = [];
  const add = (s: string) => {
    const clean = s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");
    if (clean.length >= 3 && !candidates.includes(clean)) candidates.push(clean);
  };

  for (const s of extraSlugs) add(s);
  if (rawWords.length >= 2) add(`${rawWords[0]}-${rawWords[1]}`);
  for (const w of rawWords.slice(0, 3)) add(w);
  if (candidates.length === 0) add("cinematic");

  const tokens = rawWords.length > 0 ? rawWords : tokenize(query);
  for (const slug of candidates.slice(0, 4)) {
    const hits = await fetchMixkitSlugCached(slug, limit);
    if (hits.length > 0) {
      return hits
        .map((asset) => ({ asset, score: scoreAsset(asset, tokens) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((e) => e.asset);
    }
  }
  return [];
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
        tags: extractConcreteWords(`${q} ${cleanTitle}`).slice(0, 6),
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
          if (large && sources.length === 0) {
            sources.push({ url: large, width: 1920, height: 1080 });
          }
          if (sources.length === 0) {
            sources.push({ url: mp4s[0], width: 1280, height: 720 });
          }

          return {
            id: `nasa-${meta.nasa_id}`,
            provider: "nasa",
            type: "video",
            title: meta.title || "NASA Footage",
            tags: (meta.keywords ?? extractConcreteWords(meta.title || q)).slice(0, 6),
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
      const mediumThumb = (videos.medium?.thumbnail ??
        videos.small?.thumbnail ??
        "") as string;
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
  opts: { type?: MediaType; limit?: number; provider?: string; cast?: CastOption | null } = {},
): Promise<{ assets: StockAsset[]; source: string }> {
  const limit = opts.limit ?? 20;
  const cast = opts.cast ?? "any";
  if (cast === "any") {
    const result = await searchStockRaw(query, opts);
    return { ...result, assets: result.assets.filter((asset) => !isAbstractAsset(asset)) };
  }

  // Cast mode: only clips whose own metadata names the group, ranked by the query.
  const term = castSearchTerms(cast)[0] ?? "";
  const live = await searchStockRaw(`${term} ${query}`.trim(), { ...opts, limit: limit * 2 });
  const liveCast = live.assets.filter(
    (asset) => !isAbstractAsset(asset) && assetMatchesCast(asset, cast),
  );
  const tokens = [...new Set([...extractConcreteWords(query), ...sceneTokensForNarration(query)])];
  const local = VIDEO_CATALOG.filter((asset) => assetMatchesCast(asset, cast))
    .map((asset) => ({ asset, score: scoreAsset(asset, tokens) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.asset);
  const seen = new Set<string>();
  const assets = [...liveCast, ...local]
    .filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    })
    .map((asset, index) => ({ asset, index, score: scoreAsset(asset, tokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.asset);
  return {
    assets: assets.slice(0, limit),
    source: `${castLabel(cast)} only · ${liveCast.length ? live.source : "tagged library"}`,
  };
}

async function searchStockRaw(
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
    const plan = buildVisualSearchPlan(effectiveQuery);
    const mixkit = await searchMixkitLive(effectiveQuery || "cinematic", limit, plan.slugs);
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
    if (pixabay && pixabay.length > 0) {
      return { assets: pixabay, source: "pixabay-live" };
    }
    const plan = buildVisualSearchPlan(effectiveQuery);
    const mixkit = await searchMixkitLive(effectiveQuery || "cinematic", limit, plan.slugs);
    if (mixkit.length > 0) {
      return { assets: mixkit, source: "mixkit-live (pixabay key unset)" };
    }
    return { assets: VIDEO_CATALOG.slice(0, limit), source: "pexels-pool" };
  }

  // provider === "all": merge Pexels + Mixkit (+ Pixabay if key configured) in parallel
  const plan = effectiveQuery ? buildVisualSearchPlan(effectiveQuery) : null;
  const [pexelsLive, mixkitLive, pixabayLive] = await Promise.all([
    searchPexelsLive(effectiveQuery, Math.ceil(limit / 2)),
    effectiveQuery
      ? searchMixkitLive(effectiveQuery, Math.ceil(limit / 2), plan?.slugs ?? [])
      : Promise.resolve([]),
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
 * Semantic narration-to-video matcher: extracts filmable visual concepts from
 * the scene's actual narration + caption + video topic, searches Pexels,
 * Mixkit (with decomposed slugs), NASA, Wikimedia, and Pixabay, scores every
 * candidate's real title & tags against the narration tokens, and returns the
 * highest-relevance unused clip so each video ALWAYS matches its narration.
 */
export async function matchVideoForNarration(opts: {
  narration: string;
  caption?: string;
  topicContext?: string;
  excludeIds?: string[];
  preferredProvider?: string;
  cast?: CastOption | null;
}): Promise<{ asset: StockAsset | null; mediaQuery: string }> {
  const excludeIds = opts.excludeIds ?? [];
  const plan = buildVisualSearchPlan(
    opts.narration,
    opts.caption ?? "",
    opts.topicContext ?? "",
  );
  const query = plan.displayQuery;

  if (opts.cast && opts.cast !== "any") {
    return matchCastVideo(opts.cast, plan, opts, excludeIds);
  }

  if (opts.preferredProvider && opts.preferredProvider !== "all") {
    const { assets } = await searchStock(query, {
      provider: opts.preferredProvider,
      limit: 12,
    });
    const best = rankCandidates(assets, plan.targetTokens, excludeIds);
    if (best) return { asset: best, mediaQuery: query };
  }

  // 1. Check our 82-clip verified Pexels CDN library first (instant, zero 429)
  const localCandidates = searchLocalCatalog(
    `${query} ${plan.targetTokens.slice(0, 6).join(" ")}`,
    { type: "video", limit: 14 },
  );
  const unusedLocalBest = localCandidates.find((a) => !excludeIds.includes(a.id));
  const localBestScore = unusedLocalBest
    ? scoreAsset(unusedLocalBest, plan.targetTokens)
    : 0;

  // If we have no live Pexels/Pixabay keys and not a space/NASA topic, a strong
  // unused verified Pexels clip (score >= 16) is fast, reliable, and spot-on!
  if (
    !process.env.PEXELS_API_KEY &&
    !process.env.PIXABAY_API_KEY &&
    !plan.preferNasa &&
    unusedLocalBest &&
    localBestScore >= 16
  ) {
    return { asset: unusedLocalBest, mediaQuery: query };
  }

  // 2. Otherwise query live providers in parallel (cached Mixkit + Pexels + NASA + Pixabay)
  const [pexelsLive, mixkitLive, nasaLive, pixabayLive] = await Promise.all([
    process.env.PEXELS_API_KEY ? searchPexelsLive(query, 10) : Promise.resolve(null),
    searchMixkitLive(query, 12, plan.slugs),
    plan.preferNasa ? searchNasaLive(query, 6) : Promise.resolve([]),
    process.env.PIXABAY_API_KEY ? searchPixabayLive(query, 8) : Promise.resolve(null),
  ]);

  const pool = interleave(
    [
      pexelsLive ?? [],
      nasaLive,
      mixkitLive,
      pixabayLive ?? [],
      localCandidates,
    ].filter((l) => l.length > 0),
    36,
  );

  let best = rankCandidates(pool, plan.targetTokens, excludeIds);

  // 3. If still weak (score < 10), also check Wikimedia Commons for real-world subjects
  if (!best || scoreAsset(best, plan.targetTokens) < 10) {
    const wiki = await searchWikimediaLive(query, 8);
    if (wiki.length > 0) {
      best = rankCandidates([...pool, ...wiki], plan.targetTokens, excludeIds);
    }
  }

  return {
    asset: best ?? matchLocalAsset(query, "video", excludeIds),
    mediaQuery: query,
  };
}

/**
 * Cast-restricted matcher: only clips whose own metadata names the requested
 * group are eligible. Among those, the clip closest to the scene's narration
 * wins (narration concepts + everyday-scene vocabulary), preferring unused clips.
 */
async function matchCastVideo(
  cast: CastOption,
  plan: VisualSearchPlan,
  opts: { narration: string; caption?: string; topicContext?: string },
  excludeIds: string[],
): Promise<{ asset: StockAsset | null; mediaQuery: string }> {
  const sceneText = `${opts.narration} ${opts.caption ?? ""}`;
  const tokens = [
    ...new Set([
      ...plan.targetTokens,
      ...sceneTokensForNarration(sceneText),
      ...sceneTokensForNarration(opts.topicContext ?? ""),
    ]),
  ];

  const local = VIDEO_CATALOG.filter((asset) => assetMatchesCast(asset, cast));

  // With a Pexels key, also search the live library with the cast term added;
  // results are kept only if their own tags name the requested group.
  let live: StockAsset[] = [];
  if (process.env.PEXELS_API_KEY) {
    const term = castSearchTerms(cast)[0] ?? "";
    const found = await searchPexelsLive(`${term} ${plan.displayQuery}`.trim(), 15).catch(() => null);
    live = (found ?? []).filter((asset) => assetMatchesCast(asset, cast));
  }

  // Narration fit beats variety: an unused relevant clip, then a reused relevant
  // clip, and only when nothing in the cast is relevant, an unused clip.
  const scored = [...live, ...local]
    .filter((asset) => !isAbstractAsset(asset))
    .map((asset) => ({
      asset,
      score: scoreAsset(asset, tokens),
      used: excludeIds.includes(asset.id),
    }))
    .sort((a, b) => b.score - a.score);
  const best =
    scored.find((entry) => entry.score > 0 && !entry.used) ??
    scored.find((entry) => entry.score > 0) ??
    scored.find((entry) => !entry.used) ??
    scored[0];
  return { asset: best?.asset ?? null, mediaQuery: plan.displayQuery };
}

function rankCandidates(
  candidates: StockAsset[],
  tokens: string[],
  excludeIds: string[],
): StockAsset | null {
  const usable = candidates.filter((asset) => !isAbstractAsset(asset));
  if (usable.length === 0) return null;
  const scored = usable.map((asset) => {
    const baseScore = scoreAsset(asset, tokens);
    const alreadyUsed = excludeIds.includes(asset.id);
    // Prefer unused clips strongly while still honoring semantic relevance
    const total = baseScore + (alreadyUsed ? -10 : 5);
    return { asset, baseScore, total };
  });
  scored.sort((a, b) => b.total - a.total || b.baseScore - a.baseScore);
  return scored[0]?.asset ?? null;
}

/** Backwards-compatible wrapper for direct query-based clip matching. */
export async function matchBestStockVideo(
  query: string,
  excludeIds: string[] = [],
  preferredProvider?: string,
  topicContext?: string,
  cast?: CastOption | null,
): Promise<StockAsset | null> {
  const { asset } = await matchVideoForNarration({
    narration: query,
    topicContext,
    excludeIds,
    preferredProvider,
    cast,
  });
  return asset;
}

/** How many bundled clips are explicitly tagged with each cast group. */
export function castCoverage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const asset of VIDEO_CATALOG) {
    for (const group of detectPeople(asset.title, asset.tags).groups) {
      counts[group] = (counts[group] ?? 0) + 1;
    }
  }
  return counts;
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
    bundledLibrary: VIDEO_CATALOG.length,
  };
}
