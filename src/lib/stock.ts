import catalogData from "./stock-catalog.json";
import {
  getPeopleRepresentation,
  type MediaType,
  type PeopleRepresentation,
  type Scene,
  type StockAsset,
  type StockSource,
} from "./types";

/**
 * Hard filter blocking abstract, neon, 3D CGI, motion-graphics, particle,
 * wireframe, fractal, and subscribe-animation clips from EVERY local and live
 * stock provider so generated videos always use real-world camera footage.
 */
const ABSTRACT_MEDIA_RE =
  /\b(abstract|animation|animated|motion\s+graphic|motion\s+graphics|3d\s+(?:render|animation|model|like|subscribe|background|loop|art)|cgi|neon|light\s+trails?|luminous|fractal|hologram|holographic|particles?|vfx|cyberpunk|cyberspace|matrix|wireframe|geometric|background\s+loop|swirl|swirls|gradient|tunnel|like\s+and\s+subscribe|subscribe\s+animation|text\s+animation|glitch|plexus|network\s+connections|data\s+flow|molecular\s+network|futuristic\s+digital|vaporwave|kaleidoscope|wave\s+animation|lines\s+background|screensaver|render\s+loop)\b/i;

export function isAbstractAsset(
  asset: Pick<StockAsset, "title" | "tags" | "pageUrl">,
): boolean {
  const haystack = `${asset.title ?? ""} ${(asset.tags ?? []).join(" ")} ${asset.pageUrl ?? ""}`;
  return ABSTRACT_MEDIA_RE.test(haystack);
}

const DEMOGRAPHIC_PATTERNS: Record<Exclude<PeopleRepresentation, "all">, RegExp> = {
  "african-american": /\b(african[\s-]american|afro[\s-]american|black[\s-]american|black\s+(?:man|woman|men|women|couple|family|business|businessman|businesswoman|founder|owned|entrepreneur|team|athlete|developer|people))\b/i,
  african: /\b(africa|african|nigeria|nigerian|lagos|abuja|kenya|kenyan|nairobi|ghana|accra|cameroon|douala|south\s+africa|johannesburg|ethiopia|uganda|tanzania|senegal)\b/i,
  hispanic: /\b(hispanic|latino|latina|latinx|mexican|colombian|spanish|brazilian|argentinian|peruvian|amigos|hombre)\b/i,
  "east-asian": /\b(east[\s-]asian|chinese|japanese|korean|seoul|tokyo|taiwanese|vietnamese|asian\s+(?:man|woman|men|women|business|couple|family|developer|team|people))\b/i,
  "south-asian": /\b(south[\s-]asian|indian|india|mumbai|delhi|bangalore|pakistani|bengali|bangladeshi|sri\s+lankan|brown\s+people)\b/i,
  "middle-eastern": /\b(middle[\s-]eastern|arab|arabian|hijab|dubai|emirates|saudi|egyptian|moroccan|lebanese|jordanian|turkish|persian)\b/i,
  caucasian: /\b(caucasian|white\s+(?:man|woman|men|women|couple|family|business|team|people)|european|blond|blonde)\b/i,
};

const HUMAN_INDICATOR_RE =
  /\b(man|woman|men|women|person|people|couple|family|team|colleagues|coworkers|workers|employees|friends|entrepreneur|founder|founders|executive|businessman|businesswoman|developer|engineer|doctor|chef|barista|athlete|runner|student|artist|musician|singer|vendor|crowd|pedestrian|pedestrians|shoppers|manager|specialist|portrait|smiling|talking|walking|typing|working|meeting|brainstorming|jogging|exercising|training)\b/i;

function inferDemographicsFromMetadata(
  asset: StockAsset,
  searchDemographicHint?: PeopleRepresentation,
): { hasPeople: boolean; demographics: PeopleRepresentation[] } {
  if (Array.isArray(asset.demographics) && typeof asset.hasPeople === "boolean") {
    return { hasPeople: asset.hasPeople, demographics: asset.demographics };
  }

  const text = `${asset.title} ${asset.tags.join(" ")} ${asset.pageUrl}`;
  const found: PeopleRepresentation[] = [];
  for (const [demo, re] of Object.entries(DEMOGRAPHIC_PATTERNS) as [
    Exclude<PeopleRepresentation, "all">,
    RegExp,
  ][]) {
    if (re.test(text)) found.push(demo);
  }

  const hasPeople =
    found.length > 0 ||
    HUMAN_INDICATOR_RE.test(text) ||
    /\b(diverse|multiracial|multiethnic)\b/i.test(text);

  if (found.length === 0 && hasPeople) {
    if (/\b(diverse|multiracial|multiethnic)\b/i.test(text)) {
      found.push("all");
    } else if (searchDemographicHint && searchDemographicHint !== "all") {
      found.push(searchDemographicHint);
    }
  }

  return { hasPeople, demographics: found };
}

/**
 * Checks whether an asset is permitted under the selected people/race option:
 * - Never allows abstract media
 * - For a specific race (`!== "all"`), rejects any human clip belonging to
 *   another race or whose race is unverified (when strictPeopleOnly is set)
 */
export function isAssetCompatibleWithPeople(
  asset: StockAsset,
  people: PeopleRepresentation = "all",
  opts: { allowNonHumanScenic?: boolean } = {},
): boolean {
  if (isAbstractAsset(asset)) return false;
  if (!people || people === "all") return true;

  const { hasPeople, demographics } = inferDemographicsFromMetadata(asset);

  // Explicit match for the requested demographic -> always allowed
  if (demographics.includes(people)) return true;

  // Non-human scenic / animal / landscape / object footage: allowed only when
  // the narration explicitly calls for a non-human subject
  if (!hasPeople && demographics.length === 0) {
    return Boolean(opts.allowNonHumanScenic);
  }

  // Human clip of a different (or unknown) race -> reject
  return false;
}

export const LOCAL_CATALOG = (catalogData as StockAsset[]).filter(
  (asset) => asset.type === "video" && !isAbstractAsset(asset),
);
export const VIDEO_CATALOG = LOCAL_CATALOG;

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
  /** True when the concept is inherently scenic/animal/object rather than people-centric */
  nonHumanSubject?: boolean;
};

/**
 * Concrete visual concept dictionary mapping narrative subjects & synonyms
 * to filmable real-world B-roll slugs (zero abstract/neon/CGI entries).
 */
const VISUAL_CONCEPTS: VisualConcept[] = [
  {
    triggers: ["bottle", "water bottle", "hydration", "flask", "reusable", "thermos", "plastic"],
    slugs: ["water-bottle", "water", "drinking-water", "park"],
    displayQuery: "water bottle hydration",
  },
  {
    triggers: ["coffee", "espresso", "barista", "latte", "roastery", "roaster", "cappuccino", "cafe", "beans", "brew"],
    slugs: ["coffee-barista", "coffee", "cafe", "espresso"],
    displayQuery: "coffee cafe barista",
  },
  {
    triggers: ["pasta", "cooking", "recipe", "chef", "kitchen", "baking", "bread", "restaurant", "meal", "dinner", "food", "ingredient", "dish", "smoothie", "cake", "market"],
    slugs: ["cooking", "kitchen", "chef", "food", "market"],
    displayQuery: "food cooking kitchen",
  },
  {
    triggers: ["robot", "robotics", "ai", "agent", "agents", "artificial intelligence", "chatbot", "automation", "machine learning", "neural", "algorithm", "llm"],
    slugs: ["coding", "laptop", "office", "technology", "computer"],
    displayQuery: "ai software laptop office",
  },
  {
    triggers: ["code", "coding", "software", "developer", "programming", "app", "saas", "cybersecurity", "cloud", "server", "data", "analytics", "dashboard", "digital", "network", "tech", "technology"],
    slugs: ["coding", "laptop", "computer", "office", "technology"],
    displayQuery: "software developer laptop",
  },
  {
    triggers: ["dog", "puppy", "dogs", "pet", "pets"],
    slugs: ["dog", "dog-park", "puppy"],
    displayQuery: "dog playing park",
    nonHumanSubject: true,
  },
  {
    triggers: ["cat", "kitten", "cats"],
    slugs: ["cat", "kitten"],
    displayQuery: "cat indoor portrait",
    nonHumanSubject: true,
  },
  {
    triggers: ["lion", "safari", "elephant", "tiger", "wildlife", "animal", "animals", "savanna", "zoo"],
    slugs: ["lion", "wildlife", "animals", "nature"],
    displayQuery: "lion wildlife safari",
    nonHumanSubject: true,
  },
  {
    triggers: ["outer space", "spaceship", "space station", "astronaut", "rocket", "galaxy", "planet", "mars", "moon", "cosmos", "stars", "universe", "nasa", "orbit", "satellite"],
    slugs: ["space", "stars", "earth", "galaxy"],
    displayQuery: "space galaxy stars",
    preferNasa: true,
    nonHumanSubject: true,
  },
  {
    triggers: ["ocean", "waves", "sea", "surf", "underwater", "coral", "marine", "coast", "shore", "beach", "island"],
    slugs: ["ocean", "beach", "waves", "sea"],
    displayQuery: "ocean waves coast",
    nonHumanSubject: true,
  },
  {
    triggers: ["mountain", "mountains", "hiking", "hike", "trail", "alps", "summit", "peak", "climbing", "trek"],
    slugs: ["mountain-hiking", "mountain", "forest", "nature"],
    displayQuery: "mountain hiking landscape",
    nonHumanSubject: true,
  },
  {
    triggers: ["forest", "trees", "woods", "jungle", "rainforest", "sustainable", "sustainability", "climate", "eco", "green", "environment", "earth", "river", "waterfall", "wildlife", "nature"],
    slugs: ["forest", "nature", "river", "water"],
    displayQuery: "forest nature river",
    nonHumanSubject: true,
  },
  {
    triggers: ["gym", "workout", "fitness", "training", "running", "runner", "marathon", "exercise", "muscle", "weightlifting", "cardio", "athlete", "sport", "yoga", "stretch", "mobility", "jogging"],
    slugs: ["gym", "workout", "running", "fitness"],
    displayQuery: "gym workout fitness",
  },
  {
    triggers: ["doctor", "hospital", "medical", "medicine", "clinic", "healthcare", "nurse", "surgery", "stethoscope", "microscope", "laboratory", "vaccine", "pharmacy"],
    slugs: ["doctor", "medical", "hospital", "laboratory"],
    displayQuery: "doctor medical clinic",
  },
  {
    triggers: ["money", "finance", "invest", "investing", "stock", "stocks", "crypto", "banking", "bank", "revenue", "profit", "wealth", "budget", "economy", "trading", "commerce", "cash"],
    slugs: ["money", "finance", "business", "office"],
    displayQuery: "finance money business",
  },
  {
    triggers: ["car", "cars", "driving", "drive", "vehicle", "electric", "highway", "road", "roadtrip", "traffic", "supercar", "automotive"],
    slugs: ["car", "driving", "highway", "traffic"],
    displayQuery: "car driving highway",
    nonHumanSubject: true,
  },
  {
    triggers: ["airplane", "flight", "airport", "plane", "travel", "vacation", "holiday", "hotel", "passport", "destination", "tourist", "adventure"],
    slugs: ["airplane", "travel", "beach", "walking"],
    displayQuery: "airplane flight travel",
    nonHumanSubject: true,
  },
  {
    triggers: ["train", "railway", "subway", "metro", "commute", "rail", "station"],
    slugs: ["train", "city", "street", "skyline"],
    displayQuery: "train city transit",
    nonHumanSubject: true,
  },
  {
    triggers: ["city", "skyline", "downtown", "urban", "architecture", "skyscraper", "building", "buildings", "street", "nightlife", "rooftop"],
    slugs: ["city", "skyline", "street", "walking"],
    displayQuery: "city street architecture",
  },
  {
    triggers: ["house", "home", "apartment", "interior", "real estate", "living room", "property", "furniture", "design", "minimalist"],
    slugs: ["house", "home", "interior", "architecture"],
    displayQuery: "modern home interior",
  },
  {
    triggers: ["guitar", "piano", "music", "musician", "concert", "band", "singer", "dj", "audio", "podcast", "microphone", "music studio", "recording studio", "headphones"],
    slugs: ["guitar", "music", "concert", "headphones"],
    displayQuery: "music studio headphones",
  },
  {
    triggers: ["camera", "filming", "cinema", "photographer", "creator", "youtube", "tiktok", "instagram", "social", "marketing", "brand", "advertising", "campaign", "smartphone"],
    slugs: ["camera", "smartphone", "creator", "marketing"],
    displayQuery: "creator smartphone marketing",
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
  /** True only when the scene explicitly describes non-human animals, space, or landscapes */
  allowNonHumanScenic: boolean;
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

  const primaryMentionsPeople = HUMAN_INDICATOR_RE.test(primaryLower);
  const allowNonHumanScenic =
    !primaryMentionsPeople &&
    orderedConcepts.length > 0 &&
    orderedConcepts[0].nonHumanSubject === true;

  return {
    displayQuery,
    slugs: slugs.slice(0, 6),
    targetTokens,
    preferNasa: orderedConcepts.some((c) => c.preferNasa),
    allowNonHumanScenic,
  };
}

function scoreAsset(asset: StockAsset, tokens: string[]): number {
  if (isAbstractAsset(asset)) return -1000;
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

/** Rank the bundled Pexels stock library against a search phrase and optional race/people preference. */
export function searchLocalCatalog(
  query: string,
  opts: {
    type?: MediaType;
    limit?: number;
    peopleRepresentation?: PeopleRepresentation;
    allowNonHumanScenic?: boolean;
  } = {},
): StockAsset[] {
  const people = opts.peopleRepresentation ?? "all";
  const tokens = extractConcreteWords(query);
  const fallbackTokens = tokens.length > 0 ? tokens : tokenize(query);
  const limit = opts.limit ?? 24;

  const eligible = LOCAL_CATALOG.filter(
    (asset) =>
      (!opts.type || asset.type === opts.type) &&
      isAssetCompatibleWithPeople(asset, people, {
        allowNonHumanScenic: opts.allowNonHumanScenic,
      }),
  );

  if (fallbackTokens.length === 0) {
    // No query -> return demographic-matched real clips first
    return eligible
      .sort((a, b) => {
        const aMatch = people !== "all" && a.demographics?.includes(people) ? 1 : 0;
        const bMatch = people !== "all" && b.demographics?.includes(people) ? 1 : 0;
        return bMatch - aMatch || a.title.localeCompare(b.title);
      })
      .slice(0, limit);
  }

  return eligible
    .map((asset) => {
      const textScore = scoreAsset(asset, fallbackTokens);
      const demoBonus =
        people !== "all" && asset.demographics?.includes(people) ? 14 : 0;
      return { asset, textScore, demoBonus, total: textScore + demoBonus };
    })
    .filter((entry) => entry.textScore > 0 || (people !== "all" && entry.demoBonus > 0))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.textScore - a.textScore ||
        a.asset.title.localeCompare(b.asset.title),
    )
    .slice(0, limit)
    .map((entry) => entry.asset);
}

export function topLocalVideoScore(
  query: string,
  peopleRepresentation: PeopleRepresentation = "all",
  allowNonHumanScenic = false,
): number {
  const tokens = extractConcreteWords(query);
  const effective = tokens.length > 0 ? tokens : tokenize(query);
  if (effective.length === 0) return 0;
  let best = 0;
  for (const asset of VIDEO_CATALOG) {
    if (
      !isAssetCompatibleWithPeople(asset, peopleRepresentation, {
        allowNonHumanScenic,
      })
    ) {
      continue;
    }
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
  peopleRepresentation: PeopleRepresentation = "all",
  allowNonHumanScenic = false,
): StockAsset | null {
  const type = preferred ?? "video";
  const candidates = searchLocalCatalog(query, {
    type,
    limit: 24,
    peopleRepresentation,
    allowNonHumanScenic,
  }).filter((asset) => !exclude.includes(asset.id));
  if (candidates.length > 0) return candidates[0];

  const reuse = searchLocalCatalog(query, {
    type,
    limit: 1,
    peopleRepresentation,
    allowNonHumanScenic,
  })[0];
  if (reuse) return reuse;

  // Strict demographic fallback so we never drop into a different race
  if (peopleRepresentation !== "all") {
    const demoPool = VIDEO_CATALOG.filter((asset) =>
      asset.demographics?.includes(peopleRepresentation),
    );
    const unusedDemo = demoPool.find((asset) => !exclude.includes(asset.id));
    if (unusedDemo) return unusedDemo;
    if (demoPool[0]) return demoPool[0];
  }

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

export function hydrateSceneMedia(
  scene: Scene,
  peopleRepresentation: PeopleRepresentation = "all",
): Scene {
  // Reject any legacy abstract clip titles/URLs and re-match to real footage
  const existingLooksAbstract = Boolean(
    scene.mediaTitle &&
      ABSTRACT_MEDIA_RE.test(`${scene.mediaTitle} ${scene.mediaQuery ?? ""}`),
  );

  // Keep custom uploaded/pasted URLs and non-abstract live external clips intact
  if (
    !existingLooksAbstract &&
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

  const fromId =
    !existingLooksAbstract && scene.mediaId
      ? getLocalAsset(scene.mediaId)
      : undefined;
  const videoAsset =
    fromId && fromId.type === "video"
      ? fromId
      : matchLocalAsset(
          scene.mediaQuery || scene.narration || scene.caption || "office",
          "video",
          [],
          peopleRepresentation,
          true,
        );

  if (!videoAsset) return scene;

  return {
    ...scene,
    mediaId: fromId ? fromId.id : videoAsset.id,
    mediaType: "video",
    mediaUrl:
      !existingLooksAbstract &&
      fromId &&
      scene.mediaUrl &&
      scene.mediaType === "video"
        ? scene.mediaUrl
        : previewUrlForAsset(videoAsset),
    mediaThumb: (!existingLooksAbstract && fromId && scene.mediaThumb) || videoAsset.thumb || null,
    mediaTitle: (!existingLooksAbstract && fromId && scene.mediaTitle) || videoAsset.title || null,
    mediaCreator: (!existingLooksAbstract && fromId && scene.mediaCreator) || videoAsset.creator || null,
    mediaProvider: (!existingLooksAbstract && fromId && scene.mediaProvider) || videoAsset.provider || "pexels",
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

function attachLiveDemographics(
  asset: StockAsset,
  searchDemographicHint?: PeopleRepresentation,
): StockAsset {
  const meta = inferDemographicsFromMetadata(asset, searchDemographicHint);
  return {
    ...asset,
    hasPeople: meta.hasPeople,
    demographics: meta.demographics,
  };
}

function withPeopleQuery(
  query: string,
  people: PeopleRepresentation = "all",
  skipPrefix = false,
): string {
  const base = query.trim();
  if (!people || people === "all" || skipPrefix) return base;
  const prefix = getPeopleRepresentation(people).searchPrefix;
  if (!prefix) return base;
  const lower = base.toLowerCase();
  if (prefix.split(" ").some((w) => w.length > 3 && lower.includes(w))) {
    return base;
  }
  return base ? `${prefix} ${base}` : `${prefix} people lifestyle`;
}

async function searchPexelsLive(
  query: string,
  limit: number,
  peopleHint?: PeopleRepresentation,
): Promise<StockAsset[] | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const q = query.trim() || "city office people";
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
      .filter((asset) => asset.sources.length > 0 && !isAbstractAsset(asset))
      .map((asset) => attachLiveDemographics(asset, peopleHint));
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
    const hits = (await fetchMixkitSlugCached(slug, limit)).filter(
      (asset) => !isAbstractAsset(asset),
    );
    if (hits.length > 0) {
      return hits
        .map((asset) => ({ asset: attachLiveDemographics(asset), score: scoreAsset(asset, tokens) }))
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

      const candidate: StockAsset = {
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
      };
      if (!isAbstractAsset(candidate)) {
        results.push(attachLiveDemographics(candidate));
      }
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
  peopleHint?: PeopleRepresentation,
): Promise<StockAsset[] | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const q = query.trim() || "city office people";
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const response = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { hits?: Record<string, unknown>[] };
    const mapped = (data.hits ?? [])
      .map((hit) => {
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
      })
      .filter((asset) => asset.sources.length > 0 && !isAbstractAsset(asset))
      .map((asset) => attachLiveDemographics(asset, peopleHint));
    return mapped.length > 0 ? mapped : null;
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
 * Multi-site stock video search (100% real-world moving video clips, zero abstract).
 * Supports `all`, `pexels`, `mixkit`, `wikimedia`, `nasa`, and `pixabay`, plus
 * optional demographic/cast filtering (`peopleRepresentation`).
 */
export async function searchStock(
  query: string,
  opts: {
    type?: MediaType;
    limit?: number;
    provider?: string;
    peopleRepresentation?: PeopleRepresentation;
  } = {},
): Promise<{ assets: StockAsset[]; source: string }> {
  const limit = opts.limit ?? 20;
  const provider = (opts.provider ?? "all").toLowerCase();
  const people = opts.peopleRepresentation ?? "all";
  const effectiveQuery = query.trim();
  const plan = effectiveQuery ? buildVisualSearchPlan(effectiveQuery) : null;
  const allowScenic = plan ? plan.allowNonHumanScenic : true;
  const peopleAwareQuery = withPeopleQuery(effectiveQuery, people, allowScenic && Boolean(effectiveQuery));

  const filterCompatible = (list: StockAsset[]) =>
    list.filter((asset) =>
      isAssetCompatibleWithPeople(asset, people, {
        allowNonHumanScenic: allowScenic,
      }),
    );

  if (provider === "pexels") {
    const live = await searchPexelsLive(peopleAwareQuery, limit, people);
    const liveFiltered = live ? filterCompatible(live) : [];
    if (liveFiltered.length > 0) return { assets: liveFiltered, source: "pexels-live" };
    const local = searchLocalCatalog(effectiveQuery, {
      type: "video",
      limit,
      peopleRepresentation: people,
      allowNonHumanScenic: allowScenic,
    });
    return {
      assets:
        local.length > 0
          ? local
          : filterCompatible(VIDEO_CATALOG).slice(0, limit),
      source: "pexels-pool",
    };
  }

  if (provider === "mixkit") {
    const mixkit = filterCompatible(
      await searchMixkitLive(peopleAwareQuery || "office people", limit, plan?.slugs ?? []),
    );
    if (mixkit.length > 0) return { assets: mixkit, source: "mixkit-live" };
    return {
      assets: searchLocalCatalog(effectiveQuery, {
        type: "video",
        limit,
        peopleRepresentation: people,
        allowNonHumanScenic: allowScenic,
      }),
      source: "pexels-pool",
    };
  }

  if (provider === "wikimedia") {
    const wiki = filterCompatible(
      await searchWikimediaLive(peopleAwareQuery || "city", limit),
    );
    return { assets: wiki, source: "wikimedia-live" };
  }

  if (provider === "nasa") {
    const nasa = (await searchNasaLive(effectiveQuery || "earth", limit)).filter(
      (a) => !isAbstractAsset(a),
    );
    return { assets: nasa, source: "nasa-live" };
  }

  if (provider === "pixabay") {
    const pixabay = await searchPixabayLive(peopleAwareQuery, limit, people);
    const pixFiltered = pixabay ? filterCompatible(pixabay) : [];
    if (pixFiltered.length > 0) {
      return { assets: pixFiltered, source: "pixabay-live" };
    }
    const local = searchLocalCatalog(effectiveQuery, {
      type: "video",
      limit,
      peopleRepresentation: people,
      allowNonHumanScenic: allowScenic,
    });
    return { assets: local, source: "pexels-pool" };
  }

  // provider === "all": merge verified local pool + live Pexels/Mixkit/Pixabay, strictly filtering abstract & mismatched race
  const [pexelsLive, mixkitLive, pixabayLive] = await Promise.all([
    searchPexelsLive(peopleAwareQuery, Math.ceil(limit / 2), people),
    effectiveQuery && people === "all"
      ? searchMixkitLive(effectiveQuery, Math.ceil(limit / 2), plan?.slugs ?? [])
      : Promise.resolve([]),
    searchPixabayLive(peopleAwareQuery, Math.ceil(limit / 3), people),
  ]);

  const pexelsLocal = searchLocalCatalog(effectiveQuery, {
    type: "video",
    limit,
    peopleRepresentation: people,
    allowNonHumanScenic: allowScenic,
  });

  const livePexelsClean = pexelsLive ? filterCompatible(pexelsLive) : [];
  const liveMixkitClean = filterCompatible(mixkitLive);
  const livePixabayClean = pixabayLive ? filterCompatible(pixabayLive) : [];

  const pexelsList = livePexelsClean.length > 0 ? livePexelsClean : pexelsLocal;
  const lists = [pexelsList, liveMixkitClean, livePixabayClean, pexelsLocal].filter(
    (l) => l.length > 0,
  );

  if (lists.length === 0) {
    return {
      assets: filterCompatible(VIDEO_CATALOG).slice(0, limit),
      source: "pexels-pool",
    };
  }

  const sourcesUsed = [
    livePexelsClean.length ? "pexels-live" : pexelsLocal.length ? "pexels" : null,
    liveMixkitClean.length ? "mixkit" : null,
    livePixabayClean.length ? "pixabay" : null,
  ].filter(Boolean);

  return {
    assets: interleave(lists, limit),
    source: sourcesUsed.join(" + ") || "pexels-pool",
  };
}

/**
 * Semantic narration + cast matcher:
 * 1. Extracts concrete filmable visual concepts from the scene's narration + caption + video topic.
 * 2. Hard-blocks ALL abstract / neon / 3D / animation media.
 * 3. Strictly honors `peopleRepresentation` (African American, African Only, Hispanic, East Asian,
 *    South Asian, Middle Eastern, Caucasian, or All Races) while maximizing exact narration relevance
 *    and avoiding duplicate clips across scenes.
 */
export async function matchVideoForNarration(opts: {
  narration: string;
  caption?: string;
  topicContext?: string;
  excludeIds?: string[];
  preferredProvider?: string;
  peopleRepresentation?: PeopleRepresentation;
  usedDemographics?: PeopleRepresentation[];
}): Promise<{ asset: StockAsset | null; mediaQuery: string }> {
  const excludeIds = opts.excludeIds ?? [];
  const people = opts.peopleRepresentation ?? "all";
  const usedDemographics = opts.usedDemographics ?? [];

  const plan = buildVisualSearchPlan(
    opts.narration,
    opts.caption ?? "",
    opts.topicContext ?? "",
  );
  const peopleMeta = getPeopleRepresentation(people);
  const query =
    people !== "all" && !plan.allowNonHumanScenic
      ? withPeopleQuery(plan.displayQuery, people)
      : plan.displayQuery;

  const filterCompatible = (list: StockAsset[]) =>
    list.filter((asset) =>
      isAssetCompatibleWithPeople(asset, people, {
        allowNonHumanScenic: plan.allowNonHumanScenic,
      }),
    );

  if (opts.preferredProvider && opts.preferredProvider !== "all") {
    const { assets } = await searchStock(plan.displayQuery, {
      provider: opts.preferredProvider,
      peopleRepresentation: people,
      limit: 16,
    });
    const best = rankCandidates(
      filterCompatible(assets),
      plan.targetTokens,
      excludeIds,
      people,
      usedDemographics,
    );
    if (best) return { asset: best, mediaQuery: query };
  }

  // 1. Score our verified real-world Pexels CDN library (164 zero-abstract clips across all races)
  const localCandidates = searchLocalCatalog(
    `${plan.displayQuery} ${plan.targetTokens.slice(0, 6).join(" ")}`,
    {
      type: "video",
      limit: 24,
      peopleRepresentation: people,
      allowNonHumanScenic: plan.allowNonHumanScenic,
    },
  );

  const localBest = rankCandidates(
    localCandidates,
    plan.targetTokens,
    excludeIds,
    people,
    usedDemographics,
  );
  const localBestNarrationScore = localBest
    ? scoreAsset(localBest, plan.targetTokens)
    : 0;
  const localBestUnused = localBest && !excludeIds.includes(localBest.id);

  // When a specific race is chosen (and no live Pexels/Pixabay API key is set)
  // OR when an unused verified clip already matches the narration strongly,
  // use the verified demographic-tagged catalog clip directly so we NEVER leak
  // unverified/wrong-race Mixkit clips or abstract clips.
  if (
    !process.env.PEXELS_API_KEY &&
    !process.env.PIXABAY_API_KEY &&
    !plan.preferNasa &&
    localBest &&
    localBestUnused &&
    (people !== "all"
      ? !plan.allowNonHumanScenic || localBestNarrationScore >= 12
      : localBestNarrationScore >= 14)
  ) {
    return { asset: localBest, mediaQuery: query };
  }

  // 2. Query live providers with demographic-aware queries (and strict abstract/race filtering)
  const mixkitSlugs =
    people !== "all" && !plan.allowNonHumanScenic
      ? [
          ...peopleMeta.slugPrefixes.flatMap((p) =>
            plan.slugs.slice(0, 2).map((s) => `${p}-${s}`),
          ),
          ...peopleMeta.slugPrefixes,
        ]
      : plan.slugs;

  const [pexelsLive, mixkitLive, nasaLive, pixabayLive] = await Promise.all([
    process.env.PEXELS_API_KEY
      ? searchPexelsLive(query, 12, people)
      : Promise.resolve(null),
    people === "all" || plan.allowNonHumanScenic
      ? searchMixkitLive(query, 12, mixkitSlugs)
      : Promise.resolve([]),
    plan.preferNasa ? searchNasaLive(plan.displayQuery, 6) : Promise.resolve([]),
    process.env.PIXABAY_API_KEY
      ? searchPixabayLive(query, 10, people)
      : Promise.resolve(null),
  ]);

  const pool = filterCompatible(
    interleave(
      [
        pexelsLive ?? [],
        nasaLive.filter((a) => !isAbstractAsset(a)),
        mixkitLive,
        pixabayLive ?? [],
        localCandidates,
      ].filter((l) => l.length > 0),
      40,
    ),
  );

  let best = rankCandidates(
    pool,
    plan.targetTokens,
    excludeIds,
    people,
    usedDemographics,
  );

  // 3. Only check Wikimedia for non-human documentary topics when score is still low
  if (
    (people === "all" || plan.allowNonHumanScenic) &&
    (!best || scoreAsset(best, plan.targetTokens) < 10)
  ) {
    const wiki = filterCompatible(await searchWikimediaLive(query, 8));
    if (wiki.length > 0) {
      best = rankCandidates(
        [...pool, ...wiki],
        plan.targetTokens,
        excludeIds,
        people,
        usedDemographics,
      );
    }
  }

  return {
    asset:
      best ??
      matchLocalAsset(
        plan.displayQuery,
        "video",
        excludeIds,
        people,
        plan.allowNonHumanScenic,
      ),
    mediaQuery: query,
  };
}

function rankCandidates(
  candidates: StockAsset[],
  tokens: string[],
  excludeIds: string[],
  people: PeopleRepresentation = "all",
  usedDemographics: PeopleRepresentation[] = [],
): StockAsset | null {
  const realCandidates = candidates.filter((a) => !isAbstractAsset(a));
  if (realCandidates.length === 0) return null;

  const scored = realCandidates.map((asset) => {
    const narrationScore = scoreAsset(asset, tokens);
    const alreadyUsed = excludeIds.includes(asset.id);
    const meta = inferDemographicsFromMetadata(asset);

    let peopleBonus = 0;
    if (people !== "all") {
      if (meta.demographics.includes(people)) {
        // Strongly reward explicit cast match
        peopleBonus = 36;
      } else if (!meta.hasPeople) {
        // Non-human scenic clip: only competitive when narration strongly matches it
        peopleBonus = narrationScore >= 16 ? 12 : -25;
      } else {
        // Conflicting race -> heavy penalty (already filtered upstream)
        peopleBonus = -200;
      }
    } else if (meta.hasPeople && meta.demographics.length > 0) {
      // "All Races": reward rotating across diverse demographics from scene to scene
      const introducesFreshDemo = meta.demographics.some(
        (d) => d === "all" || !usedDemographics.includes(d),
      );
      peopleBonus = introducesFreshDemo ? 6 : 0;
    }

    const unusedBonus = alreadyUsed ? -65 : 24;
    const total = narrationScore * 2 + peopleBonus + unusedBonus;
    return { asset, narrationScore, total };
  });

  scored.sort((a, b) => b.total - a.total || b.narrationScore - a.narrationScore);
  return scored[0]?.asset ?? null;
}

/** Backwards-compatible wrapper for direct query-based clip matching. */
export async function matchBestStockVideo(
  query: string,
  excludeIds: string[] = [],
  preferredProvider?: string,
  topicContext?: string,
  peopleRepresentation: PeopleRepresentation = "all",
): Promise<StockAsset | null> {
  const { asset } = await matchVideoForNarration({
    narration: query,
    topicContext,
    excludeIds,
    preferredProvider,
    peopleRepresentation,
  });
  return asset;
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
