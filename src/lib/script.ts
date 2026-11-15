import { randomUUID } from "node:crypto";

import { geminiAuthHeaders } from "./gemini";
import { defaultMusicForTone } from "./music";
import {
  hydrateSceneMedia,
  matchBestStockVideo,
  matchLocalAsset,
  previewUrlForAsset,
} from "./stock";
import type {
  CaptionMode,
  MusicTrackId,
  Scene,
  StockAsset,
  Tone,
  VideoScript,
  Workflow,
} from "./types";
import { MAX_SCENES, MIN_SCENES, WORKFLOWS } from "./types";

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
      "technology data network",
      "software developer laptop coding",
      "futuristic digital connections",
      "modern tech office team",
      "glowing neural network animation",
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
    key: "nature",
    words: [
      "nature", "environment", "climate", "forest", "ocean", "mountain",
      "wildlife", "sustainability", "sustainable", "green", "earth", "weather",
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
      "vibrant neon light trails",
      "creative studio production desk",
      "dynamic abstract motion lights",
      "social creator filming camera",
      "modern workspace editing laptop",
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

/**
 * Resolves a workflow id defensively. Callers may pass anything (URL params,
 * LLM output, older client builds), so an unknown id silently falls back to
 * "explainer" instead of crashing script generation.
 */
function asWorkflow(workflow: string | undefined): Workflow {
  return (workflow && workflow in WORKFLOWS ? workflow : "explainer") as Workflow;
}

function workflowMeta(workflow: string | undefined) {
  return WORKFLOWS[asWorkflow(workflow)];
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
  title?: string;
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
  const category = detectCategory(raw);
  const usedAssets: string[] = [];
  const scenes: Scene[] = [];

  for (let idx = 0; idx < blocks.length; idx += 1) {
    const narration = blocks[idx];
    const keywords = extractVisualKeywords(
      narration,
      category.visuals[idx % category.visuals.length],
    );
    const matched = await matchBestStockVideo(keywords, usedAssets);
    if (matched) usedAssets.push(matched.id);

    const headlineWords = narration
      .replace(/[.!?,;:]+/g, "")
      .split(/\s+/)
      .slice(0, 5)
      .join(" ");

    scenes.push(
      sceneFromAsset(
        {
          id: randomUUID(),
          narration,
          caption: titleCase(headlineWords || `Scene ${idx + 1}`),
          mediaQuery: keywords,
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
    },
  };
}

async function localGenerate(options: GenerateScriptOptions): Promise<VideoScript> {
  const workflow = asWorkflow(options.workflow);
  if (workflow === "script") {
    return scriptToVideoGenerate(options);
  }

  const topic = cleanTopic(options.prompt);
  const category = detectCategory(options.prompt);
  const count = sceneCountFor(options.duration, workflow);
  const beats = beatSequence(count);
  const topicKeywords = extractVisualKeywords(topic, category.visuals[0]);
  const usedAssets: string[] = [];
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

    // Combine concrete topic nouns on lead scenes with curated category visuals
    const mediaQuery =
      index === 0
        ? topicKeywords
        : index === 1
          ? `${topicKeywords.split(" ")[0]} ${category.visuals[0].split(" ").slice(0, 2).join(" ")}`.trim()
          : category.visuals[index % category.visuals.length];

    const matched = await matchBestStockVideo(mediaQuery, usedAssets);
    if (matched) usedAssets.push(matched.id);

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


const wfMeta = workflowMeta(workflow);
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
    },
  };
}

/**
 * Resolves which OpenAI-compatible Chat Completions endpoint to use.
 *
 * Gemini and Groq are listed ahead of nothing because both offer a standing
 * free tier with no credit card, so script drafting does not require payment.
 * Both speak the OpenAI wire format, so only the base URL, key and model
 * differ. Model names churn on both providers, so each default is overridable
 * via `<PROVIDER>_TEXT_MODEL` — check the provider console if a name stops
 * resolving.
 */
type LlmConfig = {
  /** Short provider name used in diagnostics. */
  label: string;
  baseUrl: string;
  key: string;
  model: string;
  /** Auth headers. Gemini may need `x-goog-api-key` rather than `Bearer`. */
  authHeaders: Record<string, string>;
  /** Provider-specific request fields that the others do not accept. */
  extras: Record<string, unknown>;
};

function llmConfig(): LlmConfig | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      label: "OpenAI",
      // LLM_BASE_URL lets you point any provider at a proxy, gateway or
      // self-hosted endpoint (OpenRouter, LiteLLM, a corporate egress proxy).
      baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      authHeaders: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      extras: {},
    };
  }

  // Free tier is roughly 15 RPM / 500 RPD. Note the `/openai` segment: the
  // native Gemini endpoint has a different request shape.
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gemini) {
    return {
      label: "Gemini",
      baseUrl:
        process.env.LLM_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta/openai",
      key: gemini,
      model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
      // `AQ.` keys are rejected as bearer tokens; they need x-goog-api-key.
      authHeaders: geminiAuthHeaders(gemini),
      // Deliberately empty by default. Gemini's Flash models think before
      // answering and those tokens come out of the same output budget, but
      // Google only documents `reasoning_effort` for the Gemini 3.x models —
      // for 2.5 it is inconsistent (some clients reject it as an unsupported
      // param), and a rejected param is a 400 that kills script generation.
      // A generous token budget handles the overhead instead. Opt in with
      // GEMINI_REASONING_EFFORT=low|medium|high|none if you run a 3.x model.
      extras: process.env.GEMINI_REASONING_EFFORT
        ? { reasoning_effort: process.env.GEMINI_REASONING_EFFORT }
        : {},
    };
  }

  // Free tier is 30 RPM / 1,000 RPD / 200K tokens a day per model. Do not use
  // the old `llama-3.3-70b-versatile` quickstart default — Groq retired it
  // from free and developer tiers in August 2026.
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
    return {
      label: "Groq",
      baseUrl: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
      key: process.env.GROQ_API_KEY,
      model,
      authHeaders: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      // `reasoning_effort` is only understood by the gpt-oss reasoning models;
      // sending it to a plain chat model on Groq is rejected.
      extras: model.includes("gpt-oss") ? { reasoning_effort: "low" } : {},
    };
  }

  return null;
}

/**
 * Output-token budget for a script request.
 *
 * This matters more than it looks. Reasoning models (Groq's gpt-oss, Gemini's
 * thinking) spend part of the output budget on reasoning, and with the
 * provider default the JSON comes back truncated mid-object — which then
 * parses as nothing and silently drops the user to the offline beat engine.
 * Budget per scene so long scripts still finish. Override with LLM_MAX_TOKENS.
 */
function llmTokenBudget(sceneCount: number): number {
  const override = Number(process.env.LLM_MAX_TOKENS);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return Math.min(8192, 1500 + sceneCount * 600);
}

/**
 * Not every model honours `response_format: json_object` — some wrap the JSON
 * in a ```json fence or add a chatty preamble. Recover the object anyway so a
 * formatting quirk does not silently drop us to the offline beat engine.
 */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}

/**
 * Builds the Chat Completions request body. Shared with `llmProbe()` so the
 * diagnostic exercises exactly the bytes production sends — a hand-copied
 * probe drifts and stops testing what it claims to.
 */
function llmBody(
  llm: LlmConfig,
  count: number,
  options: {
    prompt: string;
    language?: string;
    tone?: string;
    duration: number;
  },
  workflowLabel: string,
): Record<string, unknown> {
  return {
    model: llm.model,
    temperature: 0.75,
    // Most OpenAI-compatible providers honour `json_object`, but not all
    // free-tier models do. Set LLM_JSON_MODE=off to omit it and rely on
    // parseJsonLoose() instead of dropping to the offline beat engine.
    ...(process.env.LLM_JSON_MODE === "off"
      ? {}
      : { response_format: { type: "json_object" } }),
    max_completion_tokens: llmTokenBudget(count),
    ...llm.extras,
    messages: [
      {
        role: "system",
        content:
          "You are a veteran video director & scriptwriter like InVideo AI. Write natural, vivid, spoken narration (no clich\u00e9s, no robotic intros). Return strict JSON only.",
      },
      {
        role: "user",
        content: `Write a ${count}-scene ${workflowLabel} video script in language "${options.language ?? "English"}" about: "${options.prompt}". Tone: ${options.tone ?? "neutral"}. Target total duration: ${options.duration}s. Each scene narration should be 1-2 natural spoken sentences. Each scene needs a concise caption (max 5 words) and a concrete stock-video search query (2-3 visual keywords). Return JSON: {"title": string, "summary": string, "scenes": [{"narration": string, "caption": string, "mediaQuery": string}]}`,
      },
    ],
  };
}

async function llmGenerate(options: GenerateScriptOptions): Promise<VideoScript | null> {
  const llm = llmConfig();
  const workflow = asWorkflow(options.workflow);
  if (!llm || workflow === "script") return null;

  const count = sceneCountFor(options.duration, workflow);
  const wfMeta = workflowMeta(workflow);
  try {
    const response = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...llm.authHeaders },
      body: JSON.stringify(llmBody(llm, count, options, wfMeta.label)),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[script] ${llm.label} returned ${response.status} for model "${llm.model}": ${detail.slice(0, 300)}`,
      );
      return null;
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn(`[script] ${llm.label} (${llm.model}) returned an empty message body.`);
      return null;
    }
    let parsed: {
      title?: string;
      summary?: string;
      scenes?: { narration?: string; caption?: string; mediaQuery?: string }[];
    };
    try {
      parsed = parseJsonLoose(content) as typeof parsed;
    } catch {
      // Almost always a truncated reply: the output budget ran out mid-JSON
      // because reasoning consumed it. Raise LLM_MAX_TOKENS if this recurs.
      console.warn(
        `[script] ${llm.label} (${llm.model}) returned text that is not JSON ` +
          `(finish_reason=${data.choices?.[0]?.finish_reason ?? "?"}, ` +
          `${content.length} chars). Likely truncated — try a bigger LLM_MAX_TOKENS. ` +
          `First 200 chars: ${content.slice(0, 200)}`,
      );
      return null;
    }
    if (!parsed.scenes?.length) {
      console.warn(
        `[script] ${llm.label} (${llm.model}) returned JSON with no scenes; using the beat engine.`,
      );
      return null;
    }

    const usedAssets: string[] = [];
    const scenes: Scene[] = [];
    for (let idx = 0; idx < parsed.scenes.length; idx += 1) {
      const scene = parsed.scenes[idx];
      const mediaQuery = scene.mediaQuery?.trim() || extractVisualKeywords(scene.narration || options.prompt);
      const matched = await matchBestStockVideo(mediaQuery, usedAssets);
      if (matched) usedAssets.push(matched.id);
      scenes.push(
        sceneFromAsset(
          {
            id: randomUUID(),
            narration: scene.narration ?? "",
            caption: scene.caption ?? "",
            mediaQuery,
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
      },
    };
  } catch (error) {
    // Never surface this to the caller — the beat engine is a fine fallback —
    // but a silent catch made LLM failures impossible to diagnose.
    console.warn(
      `[script] ${llm.label} (${llm.model}) script generation failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function generateScript(
  options: GenerateScriptOptions,
): Promise<VideoScript> {
  const llm = await llmGenerate(options);
  if (llm) return llm;
  return localGenerate(options);
}

export async function regenerateScene(
  script: VideoScript,
  sceneIndex: number,
  options: { prompt: string; tone: Tone },
): Promise<Scene> {
  const scene = script.scenes[sceneIndex];
  const workflow = asWorkflow(script.options?.workflow);
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
  const mediaQuery = category.visuals[variant % category.visuals.length];
  const excludeIds = script.scenes
    .map((item) => item.mediaId)
    .filter((id): id is string => Boolean(id));
  const matched =
    (await matchBestStockVideo(mediaQuery, excludeIds)) ??
    matchLocalAsset(mediaQuery, "video", excludeIds);

  return sceneFromAsset(
    {
      ...scene,
      narration,
      caption,
      mediaQuery,
    },
    matched,
  );
}

/**
 * Live end-to-end check of the configured LLM.
 *
 * Sends one real script request through the exact production body and reports
 * what came back, so a broken key, a retired model name or truncated JSON is
 * visible instead of silently degrading to the beat engine.
 */
export async function llmProbe(): Promise<Record<string, unknown>> {
  const llm = llmConfig();
  if (!llm) {
    return { configured: false, reason: "No LLM key set (OPENAI / GEMINI / GROQ)." };
  }

  const options = {
    prompt: "a calm ocean sunrise",
    language: "English",
    tone: "calm",
    duration: 15,
  };
  const count = sceneCountFor(options.duration, asWorkflow("storyboard"));
  const report: Record<string, unknown> = {
    configured: true,
    provider: llm.label,
    model: llm.model,
    baseUrl: llm.baseUrl,
    jsonMode: process.env.LLM_JSON_MODE !== "off",
    tokenBudget: llmTokenBudget(count),
    url: `${llm.baseUrl}/chat/completions`,
  };

  const started = Date.now();
  try {
    const response = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...llm.authHeaders },
      body: JSON.stringify(llmBody(llm, count, options, workflowMeta("storyboard").label)),
    });
    report.httpStatus = response.status;
    report.elapsedMs = Date.now() - started;

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      report.ok = false;
      report.error = detail.slice(0, 600);
      return report;
    }

    const data = (await response.json()) as {
      choices?: {
        message?: { content?: string };
        finish_reason?: string;
      }[];
      usage?: Record<string, unknown>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    report.finishReason = data.choices?.[0]?.finish_reason ?? null;
    report.usage = data.usage ?? null;
    report.replyChars = content.length;

    try {
      const parsed = parseJsonLoose(content) as {
        title?: string;
        scenes?: { narration?: string; caption?: string; mediaQuery?: string }[];
      };
      report.ok = Boolean(parsed.scenes?.length);
      report.sceneCount = parsed.scenes?.length ?? 0;
      report.title = parsed.title ?? null;
      report.firstNarration = parsed.scenes?.[0]?.narration ?? null;
      if (report.finishReason === "length") {
        report.warning =
          "Reply hit the token limit (finish_reason=length) — raise LLM_MAX_TOKENS.";
      }
    } catch {
      report.ok = false;
      report.error = `Reply was not JSON (first 400 chars): ${content.slice(0, 400)}`;
    }
    return report;
  } catch (error) {
    report.ok = false;
    report.elapsedMs = Date.now() - started;
    report.error = error instanceof Error ? error.message : String(error);
    return report;
  }
}
