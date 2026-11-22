import { createHash } from "node:crypto";
import catalogData from "./stock-catalog.json";
import extraPeopleData from "./stock-people-extra.json";
import reviewData from "./stock-review.json";
import { MAX_STOCK_PAGE, stockAssetKey } from "./stock-id";
import {
  getPeopleRepresentation,
  type MediaType,
  type PeopleRepresentation,
  type Scene,
  type StockAsset,
  type StockSource,
} from "./types";

/**
 * Automatic narration matching avoids abstract/animated footage by default.
 * Manual stock searches can opt in to every video style instead.
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
 * - Excludes abstract media unless `includeAbstract` is set
 * - For a specific race (`!== "all"`), rejects any human clip belonging to
 *   another race or whose race is unverified (when strictPeopleOnly is set)
 */
export function isAssetCompatibleWithPeople(
  asset: StockAsset,
  people: PeopleRepresentation = "all",
  opts: { allowNonHumanScenic?: boolean; includeAbstract?: boolean } = {},
): boolean {
  if (!opts.includeAbstract && isAbstractAsset(asset)) return false;
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

/**
 * Race labels in the generated catalog were not backed by Pexels' own
 * (race-neutral) descriptions, so every labelled clip was reviewed by eye.
 * `stock-review.json` holds the corrections and is applied on load so that
 * regenerating `stock-catalog.json` can never silently undo the review.
 */
type ReviewOverride = { demographics: PeopleRepresentation[]; hasPeople: boolean };
const REVIEW_OVERRIDES = (reviewData as unknown as { overrides: Record<string, ReviewOverride> })
  .overrides;

const RACE_TERM_TAGS = new Set([
  "african american", "black", "african", "africa", "hispanic", "latino", "latina",
  "east asian", "asian", "south asian", "indian", "middle eastern", "arab",
  "caucasian", "white", "european", "diverse", "multiracial",
]);
const RACE_TITLE_WORDS =
  /\b(african[\s-]american|black|african|hispanic|latin[oa]|east[\s-]asian|south[\s-]asian|asian|indian|middle[\s-]eastern|arab|caucasian|white|european|diverse|multiracial)\b\s*/gi;
const TAGS_FOR_DEMOGRAPHIC: Record<PeopleRepresentation, string[]> = {
  all: ["diverse", "multiracial"],
  "african-american": ["african american", "black"],
  african: ["african", "africa"],
  hispanic: ["hispanic", "latino"],
  "east-asian": ["east asian", "asian"],
  "south-asian": ["south asian", "indian"],
  "middle-eastern": ["middle eastern", "arab"],
  caucasian: ["caucasian", "white"],
};

function applyReview(asset: StockAsset): StockAsset {
  const override = REVIEW_OVERRIDES[asset.id];
  if (!override) return asset;
  const title = asset.title.replace(RACE_TITLE_WORDS, "").replace(/\s+/g, " ").trim();
  return {
    ...asset,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    tags: [
      ...override.demographics.flatMap((demo) => TAGS_FOR_DEMOGRAPHIC[demo] ?? []),
      ...asset.tags.filter((tag) => !RACE_TERM_TAGS.has(tag.toLowerCase())),
    ],
    hasPeople: override.hasPeople,
    demographics: override.demographics,
  };
}

/** Generated catalog (with reviewed corrections) + hand-verified people clips. */
const MERGED_CATALOG: StockAsset[] = (() => {
  const base = (catalogData as StockAsset[]).map(applyReview);
  const seen = new Set(base.map((asset) => asset.id));
  const extra = (extraPeopleData as unknown as StockAsset[]).filter((asset) => !seen.has(asset.id));
  return [...base, ...extra];
})();

const ANIMAL_CLIP_RE =
  /\b(dogs?|puppy|puppies|cats?|kittens?|lions?|cubs?|birds?|horses?|animals?|wildlife|pets?|golden retriever)\b/i;

const ALL_LOCAL_VIDEOS = MERGED_CATALOG.filter((asset) => asset.type === "video");
export const LOCAL_CATALOG = ALL_LOCAL_VIDEOS.filter((asset) => !isAbstractAsset(asset));
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

function scoreAsset(asset: StockAsset, tokens: string[], includeAbstract = false): number {
  if (!includeAbstract && isAbstractAsset(asset)) return -1000;
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

/** Avoid matching short words inside unrelated words (for example, cat in education). */
function matchesLocalSearch(asset: StockAsset, tokens: string[]): boolean {
  const words = `${asset.title} ${asset.tags.join(" ")}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.some((token) => words.some((word) =>
    word === token || word === `${token}s` || `${word}s` === token ||
    (token.length >= 4 && word.startsWith(token)),
  ));
}

/** Rank the bundled Pexels stock library against a search phrase and optional race/people preference. */
export function searchLocalCatalog(
  query: string,
  opts: {
    type?: MediaType;
    limit?: number;
    offset?: number;
    peopleRepresentation?: PeopleRepresentation;
    allowNonHumanScenic?: boolean;
    includeAbstract?: boolean;
    requireTextMatch?: boolean;
  } = {},
): StockAsset[] {
  const people = opts.peopleRepresentation ?? "all";
  const tokens = extractConcreteWords(query);
  const fallbackTokens = tokens.length > 0
    ? tokens
    : opts.requireTextMatch
      ? (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 2)
      : tokenize(query);
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;

  const eligible = (opts.includeAbstract ? ALL_LOCAL_VIDEOS : LOCAL_CATALOG).filter(
    (asset) =>
      (!opts.type || asset.type === opts.type) &&
      isAssetCompatibleWithPeople(asset, people, {
        allowNonHumanScenic: opts.allowNonHumanScenic,
        includeAbstract: opts.includeAbstract,
      }),
  );

  if (fallbackTokens.length === 0) {
    // A non-empty manual query with no searchable words must not become a generic search.
    if (opts.requireTextMatch && query.trim()) return [];
    return eligible
      .sort((a, b) => {
        const aMatch = people !== "all" && a.demographics?.includes(people) ? 1 : 0;
        const bMatch = people !== "all" && b.demographics?.includes(people) ? 1 : 0;
        return bMatch - aMatch || a.title.localeCompare(b.title);
      })
      .slice(offset, offset + limit);
  }

  return eligible
    .map((asset) => {
      const textScore = scoreAsset(asset, fallbackTokens, opts.includeAbstract);
      const demoBonus =
        people !== "all" && asset.demographics?.includes(people) ? 14 : 0;
      return { asset, textScore, demoBonus, total: textScore + demoBonus };
    })
    .filter((entry) => opts.requireTextMatch
      ? matchesLocalSearch(entry.asset, fallbackTokens)
      : entry.textScore > 0 || (people !== "all" && entry.demoBonus > 0))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.textScore - a.textScore ||
        a.asset.title.localeCompare(b.asset.title),
    )
    .slice(offset, offset + limit)
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
  // Generated (AI) visuals and stickman animation are owned by the scene;
  // never swap them for stock footage.
  if ((scene.mediaSource === "ai" && scene.mediaUrl) || scene.mediaSource === "stickman") {
    return { ...scene, mediaLocked: true };
  }

  // Explicitly selected/locked footage belongs to the editor, including animation.
  if (scene.mediaLocked && scene.mediaUrl && scene.mediaType === "video") return scene;

  // Reject automatically matched legacy abstract clips and re-match to real footage.
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
    mediaPageUrl: (!existingLooksAbstract && fromId && scene.mediaPageUrl) || videoAsset.pageUrl || null,
    mediaLicense: (!existingLooksAbstract && fromId && scene.mediaLicense) || videoAsset.license || null,
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
    // Pexels also labels HLS manifests as video/mp4. Keep playable files, not playlists.
    .filter((file) => String(file.file_type ?? "").includes("mp4") &&
      String(file.quality ?? "").toLowerCase() !== "hls" &&
      !/\.m3u8(?:[?#]|$)/i.test(String(file.link ?? "")))
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

type ProviderPage = {
  assets: StockAsset[];
  hasMore: boolean;
  status: "ok" | "unconfigured" | "unavailable";
  reason?: string;
};

const unavailable = (reason: string): ProviderPage => ({
  assets: [], hasMore: false, status: "unavailable", reason,
});

function providerError(provider: string, status: number): string {
  if (status === 401 || status === 403) return `${provider} rejected its API key or denied access.`;
  if (status === 429) return `${provider} is temporarily rate-limited. Try again later.`;
  return `${provider} is temporarily unavailable.`;
}

async function searchPexelsLive(
  query: string,
  limit: number,
  peopleHint?: PeopleRepresentation,
  page = 1,
): Promise<ProviderPage> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return { assets: [], hasMore: false, status: "unconfigured" };
  const q = query.trim();
  const url = new URL(q
    ? "https://api.pexels.com/v1/videos/search"
    : "https://api.pexels.com/v1/videos/popular");
  if (q) url.searchParams.set("query", q);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("page", String(page));
  try {
    const response = await fetch(url, {
      headers: { authorization: key },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok) return unavailable(providerError("Pexels", response.status));
    const data = (await response.json()) as {
      videos?: Record<string, unknown>[];
      total_results?: number;
      next_page?: string;
    };
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const assets = videos
      .map(mapPexelsVideo)
      .filter((asset) => asset.sources.length > 0)
      .map((asset) => attachLiveDemographics(asset, peopleHint));
    return {
      assets,
      hasMore: typeof data.total_results === "number"
        ? page * limit < data.total_results
        : Boolean(data.next_page) || videos.length === limit,
      status: "ok",
    };
  } catch {
    return unavailable("Pexels is temporarily unavailable.");
  }
}

type MixkitSlot = {
  id: string;
  title: string;
  pageUrl: string;
  thumb: string;
  slug: string;
  contentUrl: string;
  duration: number;
  width: number;
  height: number;
  free: boolean;
};

type MixkitNativePage = {
  slots: MixkitSlot[];
  hasMore: boolean;
  status: "ok" | "unavailable";
};

const MIXKIT_PAGE_SIZE = 24;
const globalMixkit = globalThis as typeof globalThis & {
  __raMixkitPages?: Map<string, { ts: number; page: MixkitNativePage }>;
  __raMixkitDetails?: Map<string, { ts: number; free: boolean; source: string }>;
  __raMixkitCooldownUntil?: number;
};

function mixkitCache() {
  if (!globalMixkit.__raMixkitPages) globalMixkit.__raMixkitPages = new Map();
  return globalMixkit.__raMixkitPages;
}

function mixkitDetailCache() {
  if (!globalMixkit.__raMixkitDetails) globalMixkit.__raMixkitDetails = new Map();
  return globalMixkit.__raMixkitDetails;
}

function cacheMixkitDetail(url: string, detail: { ts: number; free: boolean; source: string }) {
  const cache = mixkitDetailCache();
  cache.set(url, detail);
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
}

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const scripts = html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const pending: unknown[] = [JSON.parse(script[1])];
      while (pending.length) {
        const value = pending.shift();
        if (Array.isArray(value)) pending.push(...value);
        else if (value && typeof value === "object") {
          const node = value as Record<string, unknown>;
          nodes.push(node);
          pending.push(...Object.values(node).filter((item) => item && typeof item === "object"));
        }
      }
    } catch {
      // Ignore a malformed JSON-LD block without losing other blocks.
    }
  }
  return nodes;
}

function isVideoObject(node: Record<string, unknown>): boolean {
  return node["@type"] === "VideoObject" ||
    (Array.isArray(node["@type"]) && node["@type"].includes("VideoObject"));
}

function mixkitFreeLicense(node: Record<string, unknown>): boolean {
  const text = `${node.license ?? ""} ${node.copyrightNotice ?? ""}`.toLowerCase();
  return !text.includes("restricted") &&
    (/videofree|stock video free license|free license/.test(text) || text.trim() === "free");
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string") ?? "";
  return "";
}

function mixkitMediaUrl(value: string): string {
  try {
    const url = new URL(value.replace(/&amp;/g, "&"), "https://mixkit.co");
    return url.protocol === "https:" && url.hostname === "assets.mixkit.co" && /\.mp4$/i.test(url.pathname)
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function mixkitDuration(value: unknown): number {
  if (typeof value === "number" && value > 0) return value;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(String(value ?? ""));
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 12;
}

/** Parse the listing's actual VideoObjects; never invent a downloadable rendition. */
function parseMixkitListing(html: string, slug: string): MixkitSlot[] {
  const normalizedHtml = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const slots: MixkitSlot[] = [];
  const seen = new Set<string>();
  for (const node of jsonLdNodes(html)) {
    if (!isVideoObject(node)) continue;
    const rawPage = firstString(node["@id"]) || firstString(node.url);
    let pageUrl: URL;
    try {
      pageUrl = new URL(rawPage.split("#")[0], "https://mixkit.co");
    } catch {
      continue;
    }
    const id = /-(\d+)\/?$/.exec(pageUrl.pathname)?.[1];
    if (pageUrl.hostname !== "mixkit.co" || !pageUrl.pathname.startsWith("/free-stock-video/") || !id || seen.has(id)) continue;
    seen.add(id);
    const publishedFile = new RegExp(`https://assets\\.mixkit\\.co/videos/${id}/${id}-(?:360|720|1080)\\.mp4(?:\\?[^"'\\s<>]*)?`, "i").exec(normalizedHtml)?.[0] ?? "";
    const publishedThumb = new RegExp(`https://assets\\.mixkit\\.co/videos/${id}/${id}-thumb-[^"'\\s<>]+\\.(?:jpg|jpeg|png|webp)(?:\\?[^"'\\s<>]*)?`, "i").exec(normalizedHtml)?.[0] ?? "";
    const title = firstString(node.name).trim() || pageUrl.pathname.split("/").filter(Boolean).pop()?.replace(/-\d+$/, "").replace(/-/g, " ") || "Mixkit video";
    slots.push({
      id,
      title,
      pageUrl: pageUrl.toString(),
      thumb: firstString(node.thumbnailUrl) || publishedThumb,
      slug,
      contentUrl: mixkitMediaUrl(firstString(node.contentUrl)) || mixkitMediaUrl(publishedFile),
      duration: mixkitDuration(node.duration),
      width: Number(node.width) || 0,
      height: Number(node.height) || 0,
      free: mixkitFreeLicense(node),
    });
  }
  return slots;
}

async function fetchMixkitNativePage(slug: string, page: number): Promise<MixkitNativePage> {
  const key = `${slug}:${page}`;
  const cached = mixkitCache().get(key);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) return cached.page;
  if (globalMixkit.__raMixkitCooldownUntil && Date.now() < globalMixkit.__raMixkitCooldownUntil) {
    return { slots: [], hasMore: false, status: "unavailable" };
  }
  const url = new URL(`https://mixkit.co/free-stock-video/${encodeURIComponent(slug)}${slug ? "/" : ""}`);
  if (page > 1) url.searchParams.set("page", String(page));
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ReclaimedArtistry/1.0)", accept: "text/html" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (response.status === 429) {
      globalMixkit.__raMixkitCooldownUntil = Date.now() + 90_000;
      return { slots: [], hasMore: false, status: "unavailable" };
    }
    if (response.status === 404) return { slots: [], hasMore: false, status: "ok" };
    if (!response.ok) return { slots: [], hasMore: false, status: "unavailable" };
    const html = await response.text();
    const slots = parseMixkitListing(html, slug);
    // A changed listing format is an outage, not proof that the query has no results.
    if (slots.length === 0 && /item-grid-card/.test(html)) {
      return { slots: [], hasMore: false, status: "unavailable" };
    }
    const hasNextLink = new RegExp(`(?:\\?|&amp;|&)page=${page + 1}(?:["'&#]|$)`, "i").test(html);
    const result: MixkitNativePage = { slots, hasMore: hasNextLink || slots.length >= MIXKIT_PAGE_SIZE, status: "ok" };
    mixkitCache().set(key, { ts: Date.now(), page: result });
    // Bound the per-process cache; entries must never depend on a prior requested limit.
    if (mixkitCache().size > 200) mixkitCache().delete(mixkitCache().keys().next().value!);
    return result;
  } catch {
    return { slots: [], hasMore: false, status: "unavailable" };
  }
}

async function resolveMixkitSlot(slot: MixkitSlot): Promise<{ asset: StockAsset | null; unavailable: boolean }> {
  // The detail page is authoritative: a listing can say "free" while the
  // actual downloadable clip is licensed for personal use only.
  if (!slot.free) return { asset: null, unavailable: false };
  let detail = mixkitDetailCache().get(slot.pageUrl);
  if (!detail || Date.now() - detail.ts >= 30 * 60 * 1000) {
    try {
      const response = await fetch(slot.pageUrl, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; ReclaimedArtistry/1.0)", accept: "text/html" },
        signal: AbortSignal.timeout(6000), cache: "no-store",
      });
      if (!response.ok) return { asset: null, unavailable: true };
      const html = await response.text();
      const declared = [...html.matchAll(/\bdata-license\s*=\s*["'](video(?:Free|Restricted))["']/gi)]
        .map((match) => match[1].toLowerCase());
      const videoNodes = jsonLdNodes(html).filter(isVideoObject);
      const node = videoNodes.find((item) => {
        const id = firstString(item["@id"]) || firstString(item.url);
        return id.split("#")[0].replace(/\/$/, "") === slot.pageUrl.replace(/\/$/, "");
      }) ?? (videoNodes.length === 1 ? videoNodes[0] : undefined);
      // Download-block labels override JSON-LD. If a page has conflicting
      // labels, do not risk presenting a restricted clip as commercial-free.
      const restricted = declared.includes("videorestricted");
      const free = declared.length > 0
        ? declared.includes("videofree") && !restricted
        : Boolean(node && mixkitFreeLicense(node));
      if (!free) {
        if (restricted || (node && !mixkitFreeLicense(node) && /restricted/i.test(`${node.license ?? ""} ${node.copyrightNotice ?? ""}`))) {
          cacheMixkitDetail(slot.pageUrl, { ts: Date.now(), free: false, source: "" });
          return { asset: null, unavailable: false };
        }
        return { asset: null, unavailable: true };
      }
      const published = new RegExp(`https://assets\\.mixkit\\.co/videos/${slot.id}/${slot.id}-(?:360|720|1080)\\.mp4(?:\\?[^"'\\s<>]*)?`, "i")
        .exec(html.replace(/\\\//g, "/").replace(/&amp;/g, "&"))?.[0] ?? "";
      // Both the detail JSON-LD and the original listing are provider-published
      // URLs. Never manufacture a different resolution from either one.
      const source = mixkitMediaUrl(firstString(node?.contentUrl)) || mixkitMediaUrl(published) || slot.contentUrl;
      if (!source) return { asset: null, unavailable: true };
      detail = { ts: Date.now(), free: true, source };
      cacheMixkitDetail(slot.pageUrl, detail);
    } catch {
      return { asset: null, unavailable: true };
    }
  }
  if (!detail.free) return { asset: null, unavailable: false };
  const source = detail.source;
  const inferredHeight = /-(360|720|1080)\.mp4/i.exec(source)?.[1];
  const tags = [...new Set([...slot.slug.split("-"), ...tokenize(slot.title)])].filter(Boolean).slice(0, 8);
  return { asset: attachLiveDemographics({
    id: `mixkit-${slot.id}`,
    provider: "mixkit",
    type: "video",
    title: slot.title,
    tags,
    creator: "Mixkit",
    pageUrl: slot.pageUrl,
    thumb: slot.thumb,
    duration: slot.duration,
    license: "Mixkit Stock Video Free License",
    licenseUrl: "https://mixkit.co/license/#videoFree",
    sources: [{ url: source, width: slot.width, height: slot.height || Number(inferredHeight) || undefined }],
  }), unavailable: false };
}

function matchesAllSearchWords(asset: StockAsset, words: string[]): boolean {
  return words.every((word) => matchesLocalSearch(asset, [word]));
}

/** Page through Mixkit's native 24-item pages without skipping or repeating slots. */
async function searchMixkitLive(
  query: string,
  limit: number,
  extraSlugs: string[] = [],
  page = 1,
): Promise<ProviderPage> {
  const words = extractConcreteWords(query);
  const rawWords = words.length > 0 ? words : tokenize(query);
  const candidates: string[] = [];
  const add = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (clean && !candidates.includes(clean)) candidates.push(clean);
  };
  // Automatic narration matching supplies carefully chosen demographic and
  // subject slugs; preserve their priority. Manual search has no such hints.
  for (const slug of extraSlugs) add(slug);
  add(query.trim().replace(/\s+/g, "-"));
  if (rawWords.length >= 2) add(`${rawWords[0]}-${rawWords[1]}`);
  for (const word of rawWords.slice(0, 3)) add(word);
  if (candidates.length === 0) candidates.push("");
  const exactSlug = candidates[0];

  for (const slug of candidates.slice(0, 5)) {
    const first = await fetchMixkitNativePage(slug, 1);
    if (first.status === "unavailable") return unavailable("Mixkit is temporarily unavailable.");
    if (first.slots.length === 0) continue;
    let nativePage = Math.floor(((page - 1) * limit) / MIXKIT_PAGE_SIZE) + 1;
    let offset = ((page - 1) * limit) % MIXKIT_PAGE_SIZE;
    let remaining = limit;
    let hasMore = false;
    const selected: MixkitSlot[] = [];
    while (remaining > 0) {
      const batch = nativePage === 1 ? first : await fetchMixkitNativePage(slug, nativePage);
      if (batch.status === "unavailable") return unavailable("Mixkit is temporarily unavailable.");
      const take = Math.min(remaining, MIXKIT_PAGE_SIZE - offset);
      selected.push(...batch.slots.slice(offset, offset + take));
      hasMore = batch.slots.length > offset + take || batch.hasMore;
      remaining -= take;
      if (!batch.hasMore || remaining <= 0) break;
      nativePage += 1;
      offset = 0;
    }
    const resolutions = await Promise.all(selected.map(resolveMixkitSlot));
    const resolved = resolutions.map(({ asset }) => asset).filter((asset): asset is StockAsset => asset !== null);
    // If a multi-word category does not exist, a broader category must still
    // match the other words rather than returning unrelated generic footage.
    const assets = slug !== exactSlug && rawWords.length > 1 && extraSlugs.length === 0
      ? resolved.filter((asset) => matchesAllSearchWords(asset, rawWords.slice(0, 3)))
      : resolved;
    return {
      assets, hasMore, status: "ok",
      reason: resolutions.some(({ unavailable }) => unavailable)
        ? "Some Mixkit clips could not be verified or are temporarily unavailable."
        : undefined,
    };
  }
  return { assets: [], hasMore: false, status: "ok" };
}

/** Wikimedia Commons is key-free; keep the per-file licence visible to the editor. */
async function searchWikimediaLive(query: string, limit: number, page = 1): Promise<ProviderPage> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  const params: Record<string, string> = {
    action: "query", generator: "search", gsrnamespace: "6",
    gsrsearch: `filetype:video ${query.trim()}`.trim(),
    gsrlimit: String(limit), gsroffset: String((page - 1) * limit),
    prop: "imageinfo|videoinfo", iiprop: "url|size|mime|user|extmetadata",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|AttributionRequired",
    viprop: "derivatives", iiurlwidth: "640", format: "json",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "ReclaimedArtistry/1.0 (https://github.com/Reclaimed-Artistry/Ai-video-generator)" },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok) return unavailable(providerError("Wikimedia", response.status));
    const data = (await response.json()) as {
      continue?: { gsroffset?: number };
      query?: { pages?: Record<string, Record<string, unknown>> };
    };
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
    const assets: StockAsset[] = [];
    for (const entry of pages) {
      const info = (entry.imageinfo as Record<string, unknown>[] | undefined)?.[0];
      if (!info) continue;
      const mime = String(info.mime ?? "");
      if (!mime.includes("webm") && !mime.includes("mp4")) continue;
      const thumb = String(info.thumburl ?? "");
      if (!thumb) continue;
      const duration = Number(info.duration ?? 12);
      const fileUrl = String(info.url ?? "").split("?")[0];
      const sizeBytes = Number(info.size ?? 0);
      const width = Number(info.width ?? 1280);
      const height = Number(info.height ?? 720);
      const sources: StockSource[] = [];
      if (fileUrl && sizeBytes > 0 && sizeBytes <= 45 * 1024 * 1024) {
        sources.push({ url: fileUrl, width, height, bytes: sizeBytes });
      }
      const videoInfo = (entry.videoinfo as { derivatives?: Record<string, unknown>[] }[] | undefined)?.[0];
      for (const derivative of videoInfo?.derivatives ?? []) {
        const src = String(derivative.src ?? "");
        const type = String(derivative.type ?? "");
        const estimatedBytes = Number(derivative.bandwidth ?? 0) * duration / 8;
        if (!src || (!type.includes("webm") && !type.includes("mp4")) || estimatedBytes > 45 * 1024 * 1024) continue;
        sources.push({ url: src, width: Number(derivative.width ?? 0), height: Number(derivative.height ?? 0), bytes: estimatedBytes || undefined });
      }
      if (sources.length === 0) continue;
      const cleanTitle = String(entry.title ?? "Wikimedia clip").replace(/^File:/i, "").replace(/\.(webm|mp4|ogv)$/i, "").replace(/_/g, " ").trim();
      const metadata = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
      const cleanMeta = (value?: string) => (value ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
      const license = cleanMeta(metadata.LicenseShortName?.value);
      const licenseUrl = cleanMeta(metadata.LicenseUrl?.value);
      assets.push(attachLiveDemographics({
        id: `wikimedia-${entry.pageid}`,
        provider: "wikimedia",
        type: "video",
        title: cleanTitle,
        tags: extractConcreteWords(cleanTitle).slice(0, 6),
        creator: cleanMeta(metadata.Artist?.value) || String(info.user ?? "Wikimedia Commons"),
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(entry.title ?? ""))}`,
        thumb,
        duration: Math.max(1, Math.round(duration)),
        portrait: height > width,
        license: license || "Check the file page for licence terms",
        licenseUrl: /^https?:\/\//i.test(licenseUrl) ? licenseUrl : undefined,
        sources,
      }));
    }
    return { assets, hasMore: typeof data.continue?.gsroffset === "number", status: "ok" };
  } catch {
    return unavailable("Wikimedia is temporarily unavailable.");
  }
}

/** NASA's search is key-free; resolve only the MP4 URLs in its asset manifests. */
async function searchNasaLive(query: string, limit: number, page = 1): Promise<ProviderPage> {
  const url = new URL("https://images-api.nasa.gov/search");
  if (query.trim()) url.searchParams.set("q", query.trim());
  url.searchParams.set("media_type", "video");
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("page", String(page));
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!response.ok) return unavailable(providerError("NASA", response.status));
    const data = (await response.json()) as {
      collection?: {
        items?: { href?: string; data?: { nasa_id?: string; title?: string; keywords?: string[]; center?: string }[]; links?: { rel?: string; href?: string }[] }[];
        links?: { rel?: string }[];
        metadata?: { total_hits?: number };
      };
    };
    const items = data.collection?.items ?? [];
    const resolved = await Promise.all(items.map(async (item): Promise<StockAsset | null> => {
      const meta = item.data?.[0];
      const thumb = item.links?.find((link) => link.rel === "preview")?.href;
      if (!meta?.nasa_id || !thumb || !item.href) return null;
      try {
        const manifestUrl = new URL(item.href.replace(/^http:\/\//, "https://"));
        if (manifestUrl.protocol !== "https:" || manifestUrl.hostname !== "images-assets.nasa.gov") return null;
        const manifest = await fetch(manifestUrl, { signal: AbortSignal.timeout(7000), cache: "no-store" });
        if (!manifest.ok) return null;
        const files = (await manifest.json()) as unknown;
        if (!Array.isArray(files)) return null;
        const mp4s = files.flatMap((file): string[] => {
          if (typeof file !== "string") return [];
          try {
            const url = new URL(file.replace(/^http:\/\//, "https://"));
            return url.protocol === "https:" && url.hostname === "images-assets.nasa.gov" && /\.mp4$/i.test(url.pathname)
              ? [url.toString()]
              : [];
          } catch {
            return [];
          }
        });
        if (!mp4s.length) return null;
        const pick = (suffix: string) => mp4s.find((file) => file.toLowerCase().includes(suffix));
        const sources: StockSource[] = [];
        const mobile = pick("~mobile.mp4") || pick("~small.mp4");
        const medium = pick("~medium.mp4") || pick("~preview.mp4");
        const large = pick("~large.mp4") || pick("~orig.mp4");
        if (mobile) sources.push({ url: mobile, width: 640, height: 360 });
        if (medium) sources.push({ url: medium, width: 1280, height: 720 });
        if (large && !sources.length) sources.push({ url: large, width: 1920, height: 1080 });
        if (!sources.length) sources.push({ url: mp4s[0], width: 1280, height: 720 });
        return attachLiveDemographics({
          id: `nasa-${meta.nasa_id}`, provider: "nasa", type: "video",
          title: meta.title || "NASA Footage",
          tags: (meta.keywords ?? extractConcreteWords(meta.title || query)).slice(0, 6),
          creator: meta.center ? `NASA / ${meta.center}` : "NASA",
          pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`,
          thumb: thumb.replace(/^http:\/\//, "https://"), duration: 15, portrait: false, sources,
        });
      } catch {
        return null;
      }
    }));
    const total = data.collection?.metadata?.total_hits;
    return {
      assets: resolved.filter((asset): asset is StockAsset => asset !== null),
      hasMore: typeof total === "number" ? page * limit < total : Boolean(data.collection?.links?.some((link) => link.rel === "next")),
      status: "ok",
    };
  } catch {
    return unavailable("NASA is temporarily unavailable.");
  }
}

type PixabayPageData = { hits?: Record<string, unknown>[]; totalHits?: number };
class PixabayPageRangeError extends Error {}
const PIXABAY_CACHE_SECONDS = 24 * 60 * 60;
const globalPixabay = globalThis as typeof globalThis & {
  __raPixabayPages?: Map<string, { ts: number; data: PixabayPageData }>;
  __raPixabayPending?: Map<string, Promise<PixabayPageData>>;
};

async function searchPixabayLive(
  query: string,
  limit: number,
  peopleHint?: PeopleRepresentation,
  page = 1,
): Promise<ProviderPage> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return { assets: [], hasMore: false, status: "unconfigured" };
  // Pixabay requires at least three results per page; slice its pages when the
  // combined search assigns a smaller quota so no hits are skipped.
  const upstreamLimit = Math.max(3, limit);
  const offset = (page - 1) * limit;
  const fetchPage = async (number: number, perPage: number): Promise<PixabayPageData> => {
    // Pixabay requires caching API responses for 24 hours. Keep a bounded
    // in-process cache and opt into Next's shared data cache for serverless.
    // Never put the raw API key into our own cache keys or client responses.
    const keyHash = createHash("sha256").update(key).digest("hex");
    const cacheKey = JSON.stringify([keyHash, query.trim().slice(0, 100), perPage, number]);
    const pages = globalPixabay.__raPixabayPages ??= new Map();
    const pending = globalPixabay.__raPixabayPending ??= new Map();
    const cached = pages.get(cacheKey);
    if (cached && Date.now() - cached.ts < PIXABAY_CACHE_SECONDS * 1000) return cached.data;
    const existing = pending.get(cacheKey);
    if (existing) return existing;

    const request = (async () => {
      const url = new URL("https://pixabay.com/api/videos/");
      url.searchParams.set("key", key);
      if (query.trim()) url.searchParams.set("q", query.trim().slice(0, 100));
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(number));
      const response = await fetch(url, {
        signal: AbortSignal.timeout(7000), next: { revalidate: PIXABAY_CACHE_SECONDS },
      });
      if (!response.ok) {
        // Once Pixabay's accessible results are exhausted it returns 400 rather
        // than an empty page. Do not confuse that with an invalid key.
        if (response.status === 400 && number > 1) {
          const message = await response.text().catch(() => "");
          if (/["']?page["']?\s+is\s+out\s+of\s+valid\s+range/i.test(message)) throw new PixabayPageRangeError();
        }
        throw new Error(String(response.status));
      }
      const data = (await response.json()) as PixabayPageData;
      pages.set(cacheKey, { ts: Date.now(), data });
      if (pages.size > 500) pages.delete(pages.keys().next().value!);
      return data;
    })();
    pending.set(cacheKey, request);
    try {
      return await request;
    } finally {
      pending.delete(cacheKey);
    }
  };
  const readSlice = async (perPage: number, count: number) => {
    const number = Math.floor(offset / perPage) + 1;
    const withinPage = offset % perPage;
    const first = await fetchPage(number, perPage);
    const firstHits = first.hits ?? [];
    let selected = firstHits.slice(withinPage, withinPage + count);
    if (withinPage + count > perPage && firstHits.length === perPage) {
      try {
        const next = await fetchPage(number + 1, perPage);
        selected = [...selected, ...(next.hits ?? []).slice(0, count - selected.length)];
      } catch (error) {
        if (!(error instanceof PixabayPageRangeError)) throw error;
      }
    }
    return { selected, first, firstHits, perPage };
  };
  try {
    let slice;
    try {
      slice = await readSlice(upstreamLimit, limit);
    } catch (error) {
      if (!(error instanceof PixabayPageRangeError)) throw error;
      // Standard Pixabay keys expose the first 500 hits. A partial final page
      // can be rejected when its requested page size crosses that boundary;
      // realign to 25-hit pages so those last clips are not lost.
      if (offset >= 500) return { assets: [], hasMore: false, status: "ok" };
      try {
        slice = await readSlice(25, Math.min(limit, 500 - offset));
      } catch (retryError) {
        if (retryError instanceof PixabayPageRangeError) return { assets: [], hasMore: false, status: "ok" };
        throw retryError;
      }
    }
    const { selected, first, firstHits, perPage } = slice;
    const assets = selected.map((hit) => {
      const videos = (hit.videos ?? {}) as Record<string, Record<string, unknown>>;
      const sources: StockSource[] = Object.values(videos)
        .filter((variant) => variant && typeof variant.url === "string" && Boolean(variant.url))
        .map((variant) => ({ url: variant.url as string, width: Number(variant.width ?? 0), height: Number(variant.height ?? 0), bytes: Number(variant.size ?? 0) }));
      return {
        id: `pixabay-${hit.id}`, provider: "pixabay", type: "video",
        title: String(hit.tags ?? "Pixabay clip").split(",")[0].trim(),
        tags: String(hit.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        creator: String(hit.user ?? "Pixabay"), pageUrl: String(hit.pageURL ?? "https://pixabay.com/videos/"),
        thumb: String(videos.medium?.thumbnail ?? videos.small?.thumbnail ?? videos.tiny?.thumbnail ?? ""),
        duration: Number(hit.duration ?? 10), sources,
      } satisfies StockAsset;
    }).filter((asset) => asset.sources.length > 0).map((asset) => attachLiveDemographics(asset, peopleHint));
    return {
      assets,
      hasMore: typeof first.totalHits === "number" ? offset + limit < first.totalHits : firstHits.length === perPage,
      status: "ok",
    };
  } catch (error) {
    const status = error instanceof Error ? Number(error.message) : 0;
    return unavailable(providerError("Pixabay", status));
  }
}

function interleave(lists: StockAsset[][], limit: number): StockAsset[] {
  const out: StockAsset[] = [];
  const seen = new Set<string>();
  const maxLength = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < maxLength && out.length < limit; index += 1) {
    for (const list of lists) {
      const asset = list[index];
      if (!asset) continue;
      const key = stockAssetKey(asset);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(asset);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export type StockSearchResult = {
  assets: StockAsset[];
  source: string;
  page: number;
  hasMore: boolean;
  notices: string[];
};

/** Manual searches can include all video styles; automatic matching retains its real-footage filter. */
export async function searchStock(
  query: string,
  opts: {
    type?: MediaType;
    limit?: number;
    page?: number;
    provider?: string;
    peopleRepresentation?: PeopleRepresentation;
    includeAbstract?: boolean;
  } = {},
): Promise<StockSearchResult> {
  const limit = Number.isFinite(opts.limit) ? Math.min(40, Math.max(1, Math.floor(opts.limit!))) : 20;
  const page = Number.isFinite(opts.page) ? Math.min(MAX_STOCK_PAGE, Math.max(1, Math.floor(opts.page!))) : 1;
  const provider = (opts.provider ?? "all").toLowerCase();
  const people = opts.peopleRepresentation ?? "all";
  const effectiveQuery = query.trim();
  const plan = effectiveQuery ? buildVisualSearchPlan(effectiveQuery) : null;
  const allowScenic = plan ? plan.allowNonHumanScenic : true;
  const peopleAwareQuery = withPeopleQuery(effectiveQuery, people, allowScenic && Boolean(effectiveQuery));
  const filterCompatible = (list: StockAsset[]) => list.filter((asset) =>
    isAssetCompatibleWithPeople(asset, people, { allowNonHumanScenic: allowScenic, includeAbstract: opts.includeAbstract }),
  );
  const localPage = (size: number): ProviderPage => {
    const items = searchLocalCatalog(effectiveQuery, {
      type: "video", limit: size + 1, offset: (page - 1) * size,
      peopleRepresentation: people, allowNonHumanScenic: allowScenic,
      includeAbstract: opts.includeAbstract, requireTextMatch: true,
    });
    return { assets: items.slice(0, size), hasMore: items.length > size, status: "ok" };
  };
  const fromPage = (result: ProviderPage, source: string, notices: string[] = []): StockSearchResult => ({
    assets: filterCompatible(result.assets), source, page, hasMore: result.hasMore,
    notices: [...notices, ...(result.reason ? [result.reason] : [])],
  });

  if (provider === "pexels") {
    const live = await searchPexelsLive(peopleAwareQuery, limit, people, page);
    if (live.status === "ok") return fromPage(live, "pexels-live");
    const notice = live.status === "unconfigured"
      ? "Pexels is showing the small bundled library. Set PEXELS_API_KEY for live search."
      : `${live.reason} Showing matching clips from the bundled Pexels library instead.`;
    return fromPage(localPage(limit), "pexels-pool", [notice]);
  }
  if (provider === "mixkit") return fromPage(await searchMixkitLive(peopleAwareQuery, limit, [], page), "mixkit-live");
  if (provider === "wikimedia") return fromPage(await searchWikimediaLive(peopleAwareQuery, limit, page), "wikimedia-live");
  if (provider === "nasa") return fromPage(await searchNasaLive(effectiveQuery, limit, page), "nasa-live");
  if (provider === "pixabay") {
    const live = await searchPixabayLive(peopleAwareQuery, limit, people, page);
    return fromPage(live, "pixabay-live", live.status === "unconfigured" ? ["Set PIXABAY_API_KEY to search Pixabay's full video catalogue."] : []);
  }

  // Each provider gets its own quota on each page. Returning all of those
  // results (rather than truncating larger provider pages) avoids losing hits.
  const sources: ("pexels" | "mixkit" | "wikimedia" | "nasa" | "pixabay")[] = ["pexels", "mixkit", "wikimedia", "nasa"];
  if (process.env.PIXABAY_API_KEY) sources.push("pixabay");
  const enabled = sources.slice(0, Math.max(1, limit));
  const quota = Math.max(1, Math.floor(limit / enabled.length));
  const pages = await Promise.all(enabled.map(async (name): Promise<{ name: string; result: ProviderPage }> => {
    if (name === "pexels") {
      const live = await searchPexelsLive(peopleAwareQuery, quota, people, page);
      if (live.status === "ok") return { name: "pexels-live", result: live };
      const local = localPage(quota);
      local.reason = live.status === "unconfigured"
        ? "Pexels is showing the small bundled library. Set PEXELS_API_KEY for live search."
        : `${live.reason} Showing matching bundled Pexels clips instead.`;
      return { name: "pexels-pool", result: local };
    }
    if (name === "mixkit") return { name: "mixkit", result: await searchMixkitLive(peopleAwareQuery, quota, [], page) };
    if (name === "wikimedia") return { name: "wikimedia", result: await searchWikimediaLive(peopleAwareQuery, quota, page) };
    if (name === "nasa") return { name: "nasa", result: await searchNasaLive(effectiveQuery, quota, page) };
    return { name: "pixabay", result: await searchPixabayLive(peopleAwareQuery, quota, people, page) };
  }));
  const cleaned = pages.map(({ name, result }) => ({ name, result, assets: filterCompatible(result.assets) }));
  const sourcesUsed = cleaned.filter((entry) => entry.assets.length).map((entry) => entry.name);
  return {
    assets: interleave(cleaned.map((entry) => entry.assets), limit),
    source: sourcesUsed.join(" + ") || "No results",
    page,
    hasMore: cleaned.some(({ result }) => result.hasMore),
    notices: [...new Set(cleaned.map(({ result }) => result.reason).filter((reason): reason is string => Boolean(reason)))],
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

  // A specific cast was chosen but no clip of that cast fits this narration:
  // an on-topic clip with no people in it (food, places, objects) matches the
  // narration without ever showing someone of a different race.
  const narrationMentionsAnimals = ANIMAL_CLIP_RE.test(`${opts.narration} ${opts.caption ?? ""}`);
  if (people !== "all" && localBestNarrationScore < 8) {
    const peopleFree = searchLocalCatalog(
      `${plan.displayQuery} ${plan.targetTokens.slice(0, 6).join(" ")}`,
      { type: "video", limit: 24, peopleRepresentation: people, allowNonHumanScenic: true },
    )
      .filter(
        (asset) =>
          asset.hasPeople === false &&
          !excludeIds.includes(asset.id) &&
          // Animal footage only stands in when the narration is about animals.
          (narrationMentionsAnimals || !ANIMAL_CLIP_RE.test(`${asset.title} ${asset.tags.join(" ")}`)),
      )
      .map((asset) => ({ asset, score: scoreAsset(asset, plan.targetTokens) }))
      .sort((a, b) => b.score - a.score)[0];
    if (peopleFree && peopleFree.score >= Math.max(8, localBestNarrationScore + 4)) {
      return { asset: peopleFree.asset, mediaQuery: query };
    }
  }

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
      ? searchPexelsLive(query, 12, people).then((result) => result.assets)
      : Promise.resolve(null),
    people === "all" || plan.allowNonHumanScenic
      ? searchMixkitLive(query, 12, mixkitSlugs).then((result) => result.assets)
      : Promise.resolve([]),
    plan.preferNasa ? searchNasaLive(plan.displayQuery, 6).then((result) => result.assets) : Promise.resolve([]),
    process.env.PIXABAY_API_KEY
      ? searchPixabayLive(query, 10, people).then((result) => result.assets)
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
    const wiki = filterCompatible((await searchWikimediaLive(query, 8)).assets);
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
