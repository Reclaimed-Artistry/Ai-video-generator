import { randomUUID } from "node:crypto";
import { chatJSON, textProvider } from "./ai";
import { stickThumbDataUrl, type StickTheme } from "./stickman";
import { defaultMusicForTone } from "./music";
import {
  hydrateSceneMedia,
  matchLocalAsset,
  matchVideoForNarration,
  previewUrlForAsset,
} from "./stock";
import {
  getPeopleRepresentation,
  MAX_SCENES,
  MIN_SCENES,
  WORKFLOWS,
  type CaptionMode,
  type MusicTrackId,
  type PeopleRepresentation,
  type Scene,
  type StockAsset,
  type Tone,
  type VideoScript,
  type Workflow,
  type AiStyleId,
  type VisualMode,
} from "./types";

type Category = {
  key: string;
  words: string[];
  visuals: string[];
  painPoint: string;
  craft: string;
  payoff: string;
  proof: string;
  ctaCommercial: string;
  ctaExplainer: string;
};

const CATEGORIES: Category[] = [
  {
    key: "technology",
    words: [
      "ai", "artificial intelligence", "tech", "technology", "software", "app",
      "saas", "data", "digital", "computer", "code", "robot", "machine learning",
      "cybersecurity", "crypto", "blockchain", "internet", "cloud", "developer",
      "automation", "chatbot", "generative", "agent", "agents", "llm", "copilot",
      "prompt", "prompts", "support", "workflow", "platform",
    ],
    visuals: [
      "software developer typing laptop office",
      "tech team collaborating computer desk",
      "engineer working modern office",
      "support specialist laptop headset",
      "startup founder analytics office",
    ],
    painPoint: "Teams lose hours every week to manual handoffs and slow legacy workflows",
    craft: "Intelligent automation handles the repetitive queue in seconds while keeping humans in control of every decision",
    payoff: "Response times drop, accuracy climbs, and your team finally focuses on high-leverage work",
    proof: "Modern teams deploying this shift cut turnaround times in half within the first month",
    ctaCommercial: "See what it looks like in your own workflow — try it today.",
    ctaExplainer: "Start with one repetitive bottleneck this week and measure the hours you win back.",
  },
  {
    key: "food",
    words: [
      "food", "restaurant", "coffee", "recipe", "cooking", "cafe", "meal",
      "chef", "baking", "drink", "smoothie", "kitchen", "espresso", "dinner",
      "roastery", "roaster", "beans", "brew", "barista", "brunch", "latte",
      "bakery", "pastry", "tea", "wine", "chocolate",
    ],
    visuals: [
      "barista pouring espresso coffee",
      "coffee machine brewing cafe",
      "fresh food kitchen preparation",
      "cozy cafe table latte art",
      "artisan chef cooking kitchen",
    ],
    painPoint: "Most mornings rush past with flat flavor and shortcuts you can taste immediately",
    craft: "Every batch starts with careful sourcing, patient temperature control, and craft you can smell before the first sip",
    payoff: "Rich balance, clean aroma, and a ritual worth slowing down for every single day",
    proof: "Once people taste the difference of small-batch craft, ordinary never feels the same again",
    ctaCommercial: "Taste the first pour — visit us or order your first batch today.",
    ctaExplainer: "Upgrade one ingredient at a time, dial in your timing, and let the craft speak for itself.",
  },
  {
    key: "business",
    words: [
      "business", "startup", "marketing", "sales", "entrepreneur", "company",
      "leadership", "revenue", "growth", "product", "customer", "seo", "brand",
      "agency", "finance", "money", "invest", "strategy", "remote work", "client",
      "founder", "founders", "pitch", "saas", "b2b",
    ],
    visuals: [
      "business team office meeting",
      "startup collaboration whiteboard",
      "modern skyscrapers city skyline",
      "analytics dashboard laptop office",
      "executive presentation conference room",
    ],
    painPoint: "Too many growing teams chase noise while their real pipeline stays unpredictable",
    craft: "Focus on one repeatable acquisition channel, sharp positioning, and weekly execution that compounds",
    payoff: "Clearer positioning, steadier conversions, and growth you can forecast instead of guess",
    proof: "Companies that replace scattered tactics with a focused weekly system outperform louder competitors",
    ctaCommercial: "Book a walkthrough today and build a system that scales with you.",
    ctaExplainer: "Pick one core lever, commit to a weekly cadence, and cut everything that doesn't move the needle.",
  },
  {
    key: "wildlife",
    words: [
      "lion", "lions", "safari", "savanna", "elephant", "tiger", "wildlife",
      "animal", "animals", "dog", "dogs", "puppy", "cat", "bird", "whale",
      "shark", "species", "habitat", "predator",
    ],
    visuals: [
      "lion wildlife african savanna",
      "wild animals nature reserve",
      "golden sunset savanna wildlife",
      "playful dogs park nature",
      "aerial river forest wildlife",
    ],
    painPoint: "Across wild habitats, survival comes down to instinct, patience, and balance with the landscape",
    craft: "Every movement across the terrain follows ancient rhythms shaped by water, seasons, and territory",
    payoff: "Up close, you see the quiet power, intelligence, and resilience that define life in the wild",
    proof: "Protecting open corridors and natural habitats keeps these ecosystems thriving for generations to come",
    ctaCommercial: "Explore the wild up close — watch the full story and support wildlife conservation.",
    ctaExplainer: "Look closer at the natural world, and you discover how every species keeps the whole ecosystem alive.",
  },
  {
    key: "craft",
    words: [
      "art", "artistry", "artist", "reclaimed", "wood", "woodworking", "pottery",
      "ceramic", "handmade", "artisan", "craft", "painting", "sculpture",
      "furniture", "workshop", "carving", "music", "guitar", "band", "concert",
      "studio", "fashion", "design",
    ],
    visuals: [
      "artisan woodworking craft workshop",
      "artist painting ceramic pottery studio",
      "handmade art studio close up",
      "musician playing guitar studio",
      "craftsperson shaping materials",
    ],
    painPoint: "Mass-produced objects fill every room yet carry none of the character that makes something worth keeping",
    craft: "Each piece is shaped by hand from reclaimed materials, honoring grain, texture, and honest studio craft",
    payoff: "One-of-a-kind work with soul, weight, and patina that only gets richer with every passing year",
    proof: "Collectors and makers alike know you can feel the difference of true handwork the moment you pick it up",
    ctaCommercial: "Explore the collection and bring genuine handmade artistry into your space.",
    ctaExplainer: "Slow down, respect the raw material, and let deliberate craftsmanship outlast every passing trend.",
  },
  {
    key: "nature",
    words: [
      "nature", "environment", "climate", "forest", "ocean", "mountain",
      "sustainability", "sustainable", "green", "earth", "weather",
      "renewable", "conservation", "eco", "water", "bottle", "solar", "river",
      "trees", "wild", "planet", "space", "coral",
    ],
    visuals: [
      "aerial ocean waves crashing",
      "mountain forest mist nature",
      "turquoise waves rocky shore",
      "sunlight forest trees aerial",
      "clear river nature landscape",
    ],
    painPoint: "Everyday habits leave a heavier footprint on the planet than most of us realize",
    craft: "Designed with durable materials and responsible sourcing built to replace thousands of single-use disposables",
    payoff: "Cleaner oceans, less waste, and thoughtful design made to travel anywhere you go",
    proof: "Small everyday switches scale fast when millions of people make durability the default",
    ctaCommercial: "Make the switch today and carry something built to last.",
    ctaExplainer: "Start with the single-use habits you repeat daily — consistency matters more than perfection.",
  },
  {
    key: "travel",
    words: [
      "travel", "trip", "vacation", "tour", "hotel", "flight", "beach",
      "destination", "adventure", "itinerary", "holiday", "airport", "road trip",
      "island", "lisbon", "tokyo", "paris", "istanbul", "resort", "explore",
    ],
    visuals: [
      "airplane flying over ocean beach",
      "aerial coastal beach sunset",
      "clouds from airplane wing",
      "scenic city aerial travel",
      "train passing through landscape",
    ],
    painPoint: "Great trips get ruined when you spend more time rushing through checklists than taking in the place",
    craft: "Build each day around one unforgettable anchor experience, then leave space for side streets and golden hour",
    payoff: "Less friction, richer stories, and a journey that actually feels like the postcards promised",
    proof: "Travelers who slow the pace down come home with twice the memories and half the burnout",
    ctaCommercial: "Plan your next departure and experience it firsthand.",
    ctaExplainer: "Pick the region first, lock in one anchor per day, and leave the rest open to discovery.",
  },
  {
    key: "fitness",
    words: [
      "fitness", "workout", "gym", "health", "training", "yoga", "run",
      "running", "muscle", "wellness", "nutrition", "exercise", "marathon",
      "mobility", "strength", "cardio", "athlete", "sport",
    ],
    visuals: [
      "athlete running treadmill gym",
      "modern gym workout training",
      "couple exercising fitness gym",
      "morning outdoor runner sunrise",
      "strength training gym weights",
    ],
    painPoint: "Chasing complicated routines burns people out long before real results show up",
    craft: "Nail the fundamentals, add small progressive overload each week, and treat sleep and recovery like part of the session",
    payoff: "Steady strength, higher energy through the afternoon, and momentum that holds all year",
    proof: "Consistency beats intensity every time — twenty focused minutes done daily outperforms occasional marathons",
    ctaCommercial: "Start your first session today and feel the shift in week one.",
    ctaExplainer: "Lock in three non-negotiable sessions a week before adding anything extra.",
  },
  {
    key: "city",
    words: [
      "city", "urban", "skyline", "downtown", "architecture", "street",
      "metro", "real estate", "apartment", "neighbourhood", "neighborhood",
      "train", "rail", "transit", "commute", "building", "buildings",
    ],
    visuals: [
      "aerial city skyline skyscrapers",
      "drone train passing buildings",
      "downtown night city traffic",
      "modern architecture sunset skyline",
      "railway tracks urban transit",
    ],
    painPoint: "Cities change faster than most people notice until entire neighborhoods feel transformed overnight",
    craft: "Better transit corridors, human-scale design, and smarter architecture reshape how millions move every morning",
    payoff: "Shorter commutes, livelier streets, and skylines designed around people instead of gridlock",
    proof: "From rail corridors to mixed-use blocks, the cities investing in movement win the next decade",
    ctaCommercial: "Discover the spaces shaping tomorrow's skyline.",
    ctaExplainer: "Next time you walk your neighborhood, watch how light, transit, and street design steer the crowd.",
  },
  {
    key: "marketing",
    words: [
      "social media", "instagram", "tiktok", "youtube", "promo", "reel",
      "advertisement", "campaign", "subscribe", "creator", "influencer",
      "newsletter", "brand awareness", "video", "content", "podcast",
    ],
    visuals: [
      "creator filming smartphone studio",
      "marketing team collaborating office",
      "social media strategist laptop desk",
      "brand founder presenting office",
      "creative team working studio",
    ],
    painPoint: "You have three seconds before a viewer scrolls past — weak openings kill even brilliant ideas",
    craft: "Lead with visual contrast, deliver the core payoff immediately, and pair crisp pacing with readable captions",
    payoff: "Higher watch-through rates, sharper brand recall, and content that holds attention to the final frame",
    proof: "Creators who tighten their first five seconds regularly double retention without changing their camera",
    ctaCommercial: "Launch your next campaign with footage and pacing built to stop the scroll.",
    ctaExplainer: "Cut the throat-clearing intro on your next upload and open straight on the payoff.",
  },
  {
    key: "lifestyle",
    words: [
      "life", "habit", "routine", "morning", "productivity", "mindset",
      "self improvement", "motivation", "focus", "balance", "wellbeing", "calm",
    ],
    visuals: [
      "minimal workspace morning light",
      "calm ocean waves sunrise",
      "person writing notebook desk",
      "coffee cup quiet morning",
      "peaceful forest landscape",
    ],
    painPoint: "When the first hour of the day belongs to notifications, the rest of the day stays reactive",
    craft: "Protect one quiet block before messages open, write down a single priority, and finish it before noon",
    payoff: "Calmer mornings, sharper focus, and tangible progress before lunch even arrives",
    proof: "High performers rarely rely on willpower — they remove friction from the first sixty minutes",
    ctaCommercial: "Reclaim your mornings starting tomorrow.",
    ctaExplainer: "Try protecting just the first thirty minutes tomorrow morning and notice how the rest of the day shifts.",
  },
];

const DEFAULT_CATEGORY = CATEGORIES[CATEGORIES.length - 1];

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "their",
  "about", "over", "under", "have", "will", "just", "more", "most", "very",
  "than", "then", "when", "where", "what", "which", "while", "how", "why",
  "video", "clip", "reel", "short", "second", "seconds", "minute", "minutes",
  "make", "create", "generate", "explainer", "promo", "commercial", "film",
  "scenes", "scene", "story", "today", "every", "single", "people", "teams",
  "start", "using", "build", "work", "best", "good", "great", "here", "there",
  "take", "five", "yourself", "right", "across", "quiet", "small", "inside",
  "spills", "wakes", "fresh", "smooth", "warm", "dark", "only", "even", "also",
  "really", "actually", "never", "always", "before", "after", "through", "around",
]);

const SMALL_WORDS = new Set(["a", "an", "the", "for", "of", "and", "to", "in", "on", "with"]);

const ACRONYMS = new Set([
  "ai", "api", "seo", "roi", "kpi", "hr", "saas", "ux", "ui", "vr", "ar",
  "diy", "b2b", "b2c", "ceo", "cfo", "cto", "faq", "pdf", "uk", "us", "ml",
  "gpu", "cpu", "iot", "crm", "erp", "3d", "2d", "hd", "4k", "mp4",
]);

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 7)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function cleanTopic(prompt: string): string {
  let topic = prompt.trim().replace(/\s+/g, " ");
  const question =
    /^(?:how|why|what|when|where|who)\b\s*(?:do|does|did|can|could|should|would|will|is|are|was|were|to)?\s*(?:\w+\s+){0,3}?(?:use|using|utilise|utilizing|leverage|leveraging|build|building|make|making|run|running|transform|transforms|change|changes|automate|automates|handle|handles|improve|improves|revolutionize|revolutionizes|work|works)\s+(.+)$/i.exec(
      topic,
    );
  const structured =
    /^(?:a|an|the)?\s*(?:\d+\s*[- ]?(?:second|sec|s|minute|min)s?\s+)?(?:[\w'’-]+\s+){0,4}?(?:video|clip|reel|ad|advert|advertisement|promo|explainer|film|post|piece|showcase|spot|documentary|short)\b\s+(?:about|on|for|explaining|that\s+explains|covering|highlighting|showcasing|featuring)\s+(.+)$/i.exec(
      topic,
    );
  if (question) {
    topic = question[1];
  } else if (structured) {
    topic = structured[1];
  } else {
    topic = topic.replace(
      /^(please\s+)?(can you\s+)?(make|create|generate|write|build|produce|design|shoot|record)\s+(me\s+)?(a|an|the)?\s*(short\s+)?(video|clip|reel|ad|advertisement|promo|explainer|film|video clip|social post|script)?\s*(about|on|for|explaining|that explains|of)?\s*/i,
      "",
    );
    topic = topic.replace(/^(a|an|the)\s+/i, "");
  }
  topic = topic.replace(/[.!?]+$/, "").trim();
  return topic.length > 0 ? topic : prompt.trim();
}

export function extractVisualKeywords(text: string, fallback = "cinematic city"): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)];
  if (unique.length === 0) return fallback;
  return unique.slice(0, 3).join(" ");
}

export function detectCategory(prompt: string): Category {
  const haystack = prompt.toLowerCase();
  let best = DEFAULT_CATEGORY;
  let bestScore = 0;
  let bestHit = -1;
  for (const category of CATEGORIES) {
    let score = 0;
    let lastHit = -1;
    for (const word of category.words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
      const match = pattern.exec(haystack);
      if (match) {
        score += word.split(" ").length;
        lastHit = Math.max(lastHit, match.index);
      }
    }
    if (score > bestScore || (score === bestScore && score > 0 && lastHit > bestHit)) {
      best = category;
      bestScore = score;
      bestHit = lastHit;
    }
  }
  return best;
}

function sceneCountFor(duration: number, workflow: Workflow): number {
  const divisor = workflow === "shorts" ? 7 : workflow === "documentary" ? 11 : 9;
  return Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(duration / divisor)));
}

function beatSequence(count: number): string[] {
  if (count <= 3) return ["hook", "craft", "cta"];
  if (count === 4) return ["hook", "problem", "craft", "cta"];
  if (count === 5) return ["hook", "problem", "craft", "payoff", "cta"];
  const base = ["hook", "problem", "craft", "payoff", "proof", "cta"];
  const out = [...base];
  while (out.length < count) {
    out.splice(out.length - 1, 0, out.length % 2 === 0 ? "craft" : "payoff");
  }
  return out.slice(0, count);
}

function buildWorkflowNarration(
  beat: string,
  topic: string,
  category: Category,
  workflow: Workflow,
  tone: Tone,
  index: number,
): string {
  const topicStart = sentenceCase(topic);

  if (workflow === "commercial") {
    switch (beat) {
      case "hook":
        return tone === "energetic"
          ? `Meet ${topic} — built to change the way you experience every day.`
          : `There is a quieter, sharper standard for ${topic}.`;
      case "problem":
        return `${category.painPoint}. It was time for something genuinely better.`;
      case "craft":
        return `${category.craft}.`;
      case "payoff":
        return `${category.payoff}.`;
      case "proof":
        return `${category.proof}.`;
      case "cta":
      default:
        return category.ctaCommercial;
    }
  }

  if (workflow === "shorts") {
    switch (beat) {
      case "hook":
        return `Stop scrolling — here is what nobody tells you about ${topic}.`;
      case "problem":
        return `${category.painPoint}.`;
      case "craft":
        return `Here is the shift: ${category.craft.charAt(0).toLowerCase()}${category.craft.slice(1)}.`;
      case "payoff":
        return `The payoff? ${category.payoff}.`;
      case "proof":
        return `${category.proof}.`;
      case "cta":
      default:
        return `Save this for later and try it with ${topic} today.`;
    }
  }

  if (workflow === "documentary") {
    switch (beat) {
      case "hook":
        return `Look closely at ${topic}, and a much larger story comes into focus.`;
      case "problem":
        return `${category.painPoint}. For years, almost everyone accepted that as normal.`;
      case "craft":
        return `Beneath the surface, the approach is shifting. ${category.craft}.`;
      case "payoff":
        return `Over time, those quiet choices compound: ${category.payoff.charAt(0).toLowerCase()}${category.payoff.slice(1)}.`;
      case "proof":
        return `${category.proof}.`;
      case "cta":
      default:
        return `${topicStart} is no longer a distant idea — it is already unfolding around us.`;
    }
  }

  // Default: YouTube Explainer
  switch (beat) {
    case "hook":
      return tone === "energetic"
        ? `Let us unpack ${topic} — and why it matters right now.`
        : `Here is a clear, practical breakdown of ${topic}.`;
    case "problem":
      return `${category.painPoint}. That is why the old playbook keeps stalling.`;
    case "craft":
      return `What actually works is straightforward: ${category.craft.charAt(0).toLowerCase()}${category.craft.slice(1)}.`;
    case "payoff":
      return `Once that clicks, the difference is immediate: ${category.payoff.charAt(0).toLowerCase()}${category.payoff.slice(1)}.`;
    case "proof":
      return `${category.proof}.`;
    case "cta":
    default:
      return index > 0 ? category.ctaExplainer : category.ctaCommercial;
  }
}

function buildBeatCaption(beat: string, topic: string): string {
  const shortTitle = titleCase(topic.split(" ").slice(0, 4).join(" "));
  switch (beat) {
    case "hook":
      return shortTitle;
    case "problem":
      return "The Bottleneck";
    case "craft":
      return "How It Works";
    case "payoff":
      return "The Payoff";
    case "proof":
      return "Why It Works";
    case "cta":
      return "Take the Next Step";
    default:
      return shortTitle;
  }
}

function sceneFromAsset(
  base: Omit<
    Scene,
    "mediaId" | "mediaType" | "mediaUrl" | "mediaThumb" | "mediaTitle" | "mediaCreator" | "mediaProvider"
  >,
  matched: StockAsset | null,
): Scene {
  return hydrateSceneMedia({
    ...base,
    mediaId: matched?.id ?? null,
    mediaType: "video",
    mediaUrl: matched ? previewUrlForAsset(matched) : null,
    mediaThumb: matched?.thumb ?? null,
    mediaTitle: matched?.title ?? null,
    mediaCreator: matched?.creator ?? null,
    mediaProvider: matched?.provider ?? "pexels",
  });
}

export type GenerateScriptOptions = {
  prompt: string;
  duration: number;
  tone: Tone;
  language: string;
  workflow?: Workflow;
  musicTrack?: MusicTrackId;
  musicVolume?: number;
  captionMode?: CaptionMode;
  peopleRepresentation?: PeopleRepresentation;
  title?: string;
  visualMode?: VisualMode;
  aiStyle?: AiStyleId;
  stickTheme?: StickTheme;
  progressBar?: boolean;
  punchZoom?: boolean;
  sceneSfx?: boolean;
};

/**
 * Script-to-Video mode: splits the user's pasted script verbatim into scenes,
 * infers visual search keywords per paragraph, and matches moving stock clips.
 */
async function scriptToVideoGenerate(
  options: GenerateScriptOptions,
): Promise<VideoScript> {
  const raw = options.prompt.trim();
  // Split on blank lines first; if single paragraph, split into 2-sentence groups
  let blocks = raw
    .split(/\n\s*\n+/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (blocks.length === 1) {
    const lineBlocks = raw
      .split(/\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (lineBlocks.length >= 2) {
      blocks = lineBlocks;
    } else {
      const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [raw];
      blocks = [];
      for (let i = 0; i < sentences.length; i += 2) {
        const pair = sentences.slice(i, i + 2).join(" ").trim();
        if (pair) blocks.push(pair);
      }
    }
  }

  blocks = blocks.slice(0, MAX_SCENES);
  const peopleRepresentation = options.peopleRepresentation ?? "all";
  const topicContext = extractVisualKeywords(raw, "office people");
  const usedAssets: string[] = [];
  const usedDemographics: PeopleRepresentation[] = [];
  const scenes: Scene[] = [];

  for (let idx = 0; idx < blocks.length; idx += 1) {
    const narration = blocks[idx];
    const headlineWords = narration
      .replace(/[.!?,;:]+/g, "")
      .split(/\s+/)
      .slice(0, 5)
      .join(" ");
    const caption = titleCase(headlineWords || `Scene ${idx + 1}`);
    const { asset: matched, mediaQuery } = await matchVideoForNarration({
      narration,
      caption,
      topicContext,
      excludeIds: usedAssets,
      peopleRepresentation,
      usedDemographics,
    });
    if (matched) {
      usedAssets.push(matched.id);
      if (matched.demographics?.length) {
        usedDemographics.push(...matched.demographics);
      }
    }

    scenes.push(
      sceneFromAsset(
        {
          id: randomUUID(),
          narration,
          caption,
          mediaQuery,
          duration: null,
          transition: idx === 0 ? "fade" : "none",
        },
        matched,
      ),
    );
  }

  const firstTitle =
    options.title?.trim() ||
    titleCase(extractVisualKeywords(blocks[0] ?? raw, "Custom Script Video"));

  return {
    title: firstTitle.slice(0, 90),
    summary: `${scenes.length} scenes · script-to-video · ${options.tone} tone`,
    scenes,
    options: {
      workflow: "script",
      musicTrack: options.musicTrack ?? defaultMusicForTone(options.tone),
      musicVolume: options.musicVolume ?? 0.16,
      captionMode: options.captionMode ?? "word-highlight",
      peopleRepresentation,
    },
  };
}

async function localGenerate(options: GenerateScriptOptions): Promise<VideoScript> {
  const workflow = options.workflow ?? "explainer";
  if (workflow === "script") {
    return scriptToVideoGenerate(options);
  }

  const peopleRepresentation = options.peopleRepresentation ?? "all";
  const topic = cleanTopic(options.prompt);
  const category = detectCategory(options.prompt);
  const count = sceneCountFor(options.duration, workflow);
  const beats = beatSequence(count);
  const usedAssets: string[] = [];
  const usedDemographics: PeopleRepresentation[] = [];
  const scenes: Scene[] = [];

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    const narration = buildWorkflowNarration(
      beat,
      topic,
      category,
      workflow,
      options.tone,
      index,
    );
    const caption = buildBeatCaption(beat, topic);

    // Match each scene's real-world footage directly to its spoken narration + race option
    const { asset: matched, mediaQuery } = await matchVideoForNarration({
      narration,
      caption,
      topicContext: topic,
      excludeIds: usedAssets,
      peopleRepresentation,
      usedDemographics,
    });
    if (matched) {
      usedAssets.push(matched.id);
      if (matched.demographics?.length) {
        usedDemographics.push(...matched.demographics);
      }
    }

    scenes.push(
      sceneFromAsset(
        {
          id: randomUUID(),
          narration,
          caption,
          mediaQuery,
          duration: null,
          transition: index === 0 || index === beats.length - 1 ? "fade" : "none",
        },
        matched,
      ),
    );
  }

  const wfMeta = WORKFLOWS[workflow];
  const title =
    options.title?.trim() ||
    `${titleCase(topic)} — ${wfMeta.shortLabel}`.slice(0, 90);

  return {
    title,
    summary: `${scenes.length} scenes · ${wfMeta.label} · ${options.tone} tone`,
    scenes,
    options: {
      workflow,
      musicTrack: options.musicTrack ?? wfMeta.defaultMusic ?? defaultMusicForTone(options.tone),
      musicVolume: options.musicVolume ?? 0.16,
      captionMode: options.captionMode ?? wfMeta.defaultCaptionMode,
      peopleRepresentation,
    },
  };
}

async function llmGenerate(options: GenerateScriptOptions): Promise<VideoScript | null> {
  const workflow = options.workflow ?? "explainer";
  if (workflow === "script" || textProvider() === "none") return null;

  const count = sceneCountFor(options.duration, workflow);
  const wfMeta = WORKFLOWS[workflow];
  try {
    const reply = await chatJSON<{
      title?: string;
      summary?: string;
      scenes?: { narration?: string; caption?: string; mediaQuery?: string; visualPrompt?: string }[];
    }>([
      {
        role: "system",
        content:
          "You are a veteran video director and scriptwriter. Write natural, vivid, spoken narration (no clichés, no robotic intros). Reply with ONLY a JSON object.",
      },
      {
        role: "user",
        content: `Write a ${count}-scene ${wfMeta.label} video script in language "${options.language}" about: "${options.prompt}". Tone: ${options.tone}. Target total duration: ${options.duration}s. Cast / people representation: "${getPeopleRepresentation(options.peopleRepresentation).label}". Each scene narration should be 1-2 natural spoken sentences. Each scene needs: a concise caption (max 5 words); a concrete real-world stock-video search query (2-4 filmable keywords showing real people or real places, never abstract or motion-graphic animation); and a visualPrompt: one vivid sentence describing a single striking still image for a text-to-image model (subject, setting, light, camera angle; no text in the image). Return JSON: {"title": string, "summary": string, "scenes": [{"narration": string, "caption": string, "mediaQuery": string, "visualPrompt": string}]}`,
      },
    ]);
    if (!reply) return null;
    const parsed = reply.data;
    if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) return null;

    const peopleRepresentation = options.peopleRepresentation ?? "all";
    const topic = cleanTopic(options.prompt);
    const usedAssets: string[] = [];
    const usedDemographics: PeopleRepresentation[] = [];
    const scenes: Scene[] = [];
    for (let idx = 0; idx < parsed.scenes.length; idx += 1) {
      const scene = parsed.scenes[idx];
      const narration = scene.narration ?? "";
      const caption = scene.caption ?? "";
      const { asset: matched, mediaQuery } = await matchVideoForNarration({
        narration: `${scene.mediaQuery ?? ""} ${narration}`.trim(),
        caption,
        topicContext: topic,
        excludeIds: usedAssets,
        peopleRepresentation,
        usedDemographics,
      });
      if (matched) {
        usedAssets.push(matched.id);
        if (matched.demographics?.length) {
          usedDemographics.push(...matched.demographics);
        }
      }
      scenes.push(
        sceneFromAsset(
          {
            id: randomUUID(),
            narration,
            caption,
            mediaQuery: mediaQuery || scene.mediaQuery?.trim() || topic,
            aiPrompt: scene.visualPrompt?.trim() || null,
            duration: null,
            transition: idx === 0 ? "fade" : "none",
          },
          matched,
        ),
      );
    }

    return {
      title: parsed.title ?? titleCase(cleanTopic(options.prompt)),
      summary: parsed.summary ?? `${scenes.length} scenes · ${wfMeta.label}`,
      scenes,
      options: {
        workflow,
        musicTrack: options.musicTrack ?? wfMeta.defaultMusic ?? defaultMusicForTone(options.tone),
        musicVolume: options.musicVolume ?? 0.16,
        captionMode: options.captionMode ?? wfMeta.defaultCaptionMode,
        peopleRepresentation,
        scriptEngine: reply.provider,
      },
    };
  } catch {
    return null;
  }
}

/** Fallback image prompt when the AI writer did not supply one. */
export function defaultVisualPrompt(scene: Pick<Scene, "narration" | "caption" | "mediaQuery">, topic: string): string {
  const subject = (scene.mediaQuery || scene.caption || topic).trim();
  const line = scene.narration.replace(/\s+/g, " ").trim().slice(0, 220);
  return `${subject}, illustrating: ${line}`;
}

export async function generateScript(
  options: GenerateScriptOptions,
): Promise<VideoScript> {
  const script = (await llmGenerate(options)) ?? (await localGenerate(options));
  const topic = cleanTopic(options.prompt);
  const visualMode = options.visualMode ?? script.options?.visualMode ?? "stock";
  const stickTheme = options.stickTheme ?? "whiteboard";
  return {
    ...script,
    scenes: script.scenes.map((scene, index) => {
      const withPrompt = {
        ...scene,
        aiPrompt: scene.aiPrompt?.trim() || defaultVisualPrompt(scene, topic),
      };
      if (visualMode !== "stickman") return withPrompt;
      // Built-in stick-figure animation: free, offline, lip-synced at render.
      return {
        ...withPrompt,
        mediaSource: "stickman" as const,
        mediaType: "video" as const,
        mediaUrl: null,
        mediaThumb: stickThumbDataUrl(scene.narration, index, stickTheme),
        mediaId: `stickman-${index + 1}`,
        mediaTitle: "Stickman animation",
        mediaCreator: "Built-in animation engine",
        mediaProvider: "stickman",
        mediaLocked: true,
      };
    }),
    options: {
      ...script.options,
      visualMode,
      aiStyle: options.aiStyle ?? script.options?.aiStyle ?? "cinematic",
      scriptEngine: script.options?.scriptEngine ?? "built-in",
      stickTheme,
      progressBar: options.progressBar ?? true,
      punchZoom: options.punchZoom ?? true,
      sceneSfx: options.sceneSfx ?? true,
    },
  };
}

type RegenerateOptions = {
  prompt: string;
  tone: Tone;
  peopleRepresentation?: PeopleRepresentation;
  /** Optional free-form direction, e.g. "make it funnier" or "mention the price". */
  instruction?: string;
};

/**
 * Rewrite one scene with the best available LLM, using its neighbours as
 * context. Returns null when no AI provider answers.
 */
async function rewriteSceneWithAI(
  script: VideoScript,
  sceneIndex: number,
  options: RegenerateOptions,
): Promise<{ scene: Scene; engine: string } | null> {
  if (textProvider() === "none") return null;
  const scene = script.scenes[sceneIndex];
  const previous = script.scenes[sceneIndex - 1]?.narration ?? "(this is the opening scene)";
  const next = script.scenes[sceneIndex + 1]?.narration ?? "(this is the closing scene)";
  const direction = options.instruction?.trim()
    ? `Follow this direction from the editor: "${options.instruction.trim().slice(0, 300)}".`
    : "Make it fresher and more vivid than the current version.";
  const reply = await chatJSON<{
    narration?: string;
    caption?: string;
    mediaQuery?: string;
    visualPrompt?: string;
  }>(
    [
      {
        role: "system",
        content:
          "You are a veteran video scriptwriter editing one scene of an existing video. Keep continuity with the surrounding scenes. Reply with ONLY a JSON object.",
      },
      {
        role: "user",
        content: `Video topic: "${options.prompt}". Tone: ${options.tone}.
Previous scene narration: "${previous}"
CURRENT scene narration: "${scene.narration}"
Next scene narration: "${next}"
Rewrite the CURRENT scene. ${direction} Narration: 1-2 natural spoken sentences. Caption: max 5 words. mediaQuery: 2-4 filmable real-world stock-video keywords. visualPrompt: one vivid sentence describing a single still image for a text-to-image model (no text in the image).
Return JSON: {"narration": string, "caption": string, "mediaQuery": string, "visualPrompt": string}`,
      },
    ],
    { timeoutMs: 30_000 },
  );
  const narration = reply?.data.narration?.trim();
  if (!reply || !narration) return null;

  const caption = reply.data.caption?.trim() || scene.caption;
  const aiPrompt = reply.data.visualPrompt?.trim() || scene.aiPrompt || null;
  const mediaQueryHint = reply.data.mediaQuery?.trim() || scene.mediaQuery;

  // AI-generated visuals stay; only the words (and image prompt) change.
  if (scene.mediaSource === "ai" || scene.mediaLocked) {
    return {
      scene: { ...scene, narration, caption, aiPrompt, mediaQuery: mediaQueryHint },
      engine: reply.provider,
    };
  }

  const peopleRepresentation =
    options.peopleRepresentation ?? script.options?.peopleRepresentation ?? "all";
  const excludeIds = script.scenes
    .filter((_, i) => i !== sceneIndex)
    .map((item) => item.mediaId)
    .filter((id): id is string => Boolean(id));
  const { asset: liveMatch, mediaQuery } = await matchVideoForNarration({
    narration: `${mediaQueryHint} ${narration}`.trim(),
    caption,
    topicContext: cleanTopic(options.prompt),
    excludeIds,
    peopleRepresentation,
  });
  const matched =
    liveMatch ?? matchLocalAsset(mediaQuery || mediaQueryHint, "video", excludeIds, peopleRepresentation);
  return {
    scene: sceneFromAsset(
      { ...scene, narration, caption, aiPrompt, mediaQuery: mediaQuery || mediaQueryHint, mediaLocked: false },
      matched,
    ),
    engine: reply.provider,
  };
}

export async function regenerateScene(
  script: VideoScript,
  sceneIndex: number,
  options: RegenerateOptions,
): Promise<Scene> {
  return (await regenerateSceneDetailed(script, sceneIndex, options)).scene;
}

export async function regenerateSceneDetailed(
  script: VideoScript,
  sceneIndex: number,
  options: RegenerateOptions,
): Promise<{ scene: Scene; engine: string }> {
  const ai = await rewriteSceneWithAI(script, sceneIndex, options).catch(() => null);
  if (ai) return ai;
  return { scene: await regenerateSceneBuiltIn(script, sceneIndex, options), engine: "built-in" };
}

async function regenerateSceneBuiltIn(
  script: VideoScript,
  sceneIndex: number,
  options: RegenerateOptions,
): Promise<Scene> {
  const scene = script.scenes[sceneIndex];
  const workflow = script.options?.workflow ?? "explainer";
  const peopleRepresentation =
    options.peopleRepresentation ?? script.options?.peopleRepresentation ?? "all";
  const category = detectCategory(options.prompt);
  const topic = cleanTopic(options.prompt);
  const beats = beatSequence(Math.max(MIN_SCENES, script.scenes.length));
  const beat = beats[sceneIndex] ?? "craft";
  const variant = Math.floor(Math.random() * 10) + sceneIndex + 1;
  const narration = buildWorkflowNarration(
    beat,
    topic,
    category,
    workflow === "script" ? "explainer" : workflow,
    options.tone,
    variant,
  );
  const caption = buildBeatCaption(beat, topic);
  if (scene.mediaSource === "ai") {
    return { ...scene, narration, caption };
  }
  const excludeIds = script.scenes
    .map((item) => item.mediaId)
    .filter((id): id is string => Boolean(id));
  const { asset: liveMatch, mediaQuery } = await matchVideoForNarration({
    narration,
    caption,
    topicContext: topic,
    excludeIds,
    peopleRepresentation,
  });
  const matched =
    liveMatch ?? matchLocalAsset(mediaQuery, "video", excludeIds, peopleRepresentation);

  return sceneFromAsset(
    {
      ...scene,
      narration,
      caption,
      mediaQuery,
      mediaLocked: false,
    },
    matched,
  );
}
