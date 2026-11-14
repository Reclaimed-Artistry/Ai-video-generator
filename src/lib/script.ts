import { randomUUID } from "node:crypto";
import type { Scene, Tone, VideoScript } from "./types";
import { MAX_SCENES, MIN_SCENES } from "./types";
import { hydrateSceneMedia, matchLocalAsset, previewUrlForAsset, searchLocalCatalog } from "./stock";
import { llmJson } from "./llm";

type Category = {
  key: string;
  words: string[];
  tags: string[];
  steps: string[];
  benefits: string[];
  proof: string[];
};

const CATEGORIES: Category[] = [
  {
    key: "technology",
    words: [
      "ai", "artificial intelligence", "tech", "technology", "software", "app",
      "saas", "data", "digital", "computer", "code", "robot", "machine learning",
      "cybersecurity", "crypto", "blockchain", "internet", "cloud", "developer",
      "automation", "chatbot", "generative", "agent", "agents", "llm",
      "copilot", "prompt", "prompts", "machine-learning",
    ],
    tags: ["technology", "network", "abstract", "digital", "animation", "future"],
    steps: [
      "audit where the bottleneck actually is",
      "automate the repetitive part first",
      "measure the result every single week",
    ],
    benefits: [
      "you ship faster with far less busywork",
      "the output becomes repeatable instead of random",
      "your team gets hours back every week",
    ],
    proof: ["cut build time by more than half", "report double the output", "never miss a deadline"],
  },
  {
    key: "business",
    words: [
      "business", "startup", "marketing", "sales", "entrepreneur", "company",
      "leadership", "revenue", "growth", "product", "customer", "seo", "brand",
      "agency", "finance", "money", "invest", "strategy", "remote work", "client",
    ],
    tags: ["team", "office", "meeting", "business", "collaboration", "presentation"],
    steps: [
      "pick one channel and go all in",
      "ship a weekly cadence you can sustain",
      "double down on whatever actually converts",
    ],
    benefits: [
      "the pipeline finally feels predictable",
      "you stop guessing where the next deal comes from",
      "growth becomes a system, not a lucky month",
    ],
    proof: ["grew revenue every month for a year", "closed twice the deals", "doubled their audience"],
  },
  {
    key: "nature",
    words: [
      "nature", "environment", "climate", "forest", "ocean", "mountain",
      "wildlife", "sustainability", "green", "earth", "weather", "renewable",
      "conservation", "eco",
    ],
    tags: ["nature", "forest", "mountain", "ocean", "green", "landscape"],
    steps: [
      "cut the waste you actually control",
      "restore the piece of habitat nearby",
      "publish the numbers so others follow",
    ],
    benefits: [
      "the local ecosystem starts to recover",
      "the footprint of the brand shrinks for good",
      "the story becomes proof, not a promise",
    ],
    proof: ["restored four hectares of wetland", "cut emissions by a third", "replaced every single plastic item"],
  },
  {
    key: "travel",
    words: [
      "travel", "trip", "vacation", "tour", "hotel", "flight", "beach",
      "destination", "adventure", "itinerary", "holiday", "airport", "road trip",
    ],
    tags: ["travel", "airplane", "beach", "holiday", "summer", "ocean"],
    steps: [
      "choose the region before the hotel",
      "book the one anchor experience",
      "leave room for the unexpected detour",
    ],
    benefits: [
      "the trip finally matches the photos",
      "you spend less time planning and more time living",
      "every day has a highlight worth remembering",
    ],
    proof: ["covered nine countries in a month", "found the town that is now their favourite", "planned in half the time"],
  },
  {
    key: "food",
    words: [
      "food", "restaurant", "coffee", "recipe", "cooking", "cafe", "meal",
      "chef", "baking", "drink", "smoothie", "kitchen", "espresso", "dinner",
      "roastery", "roaster", "beans", "brew", "barista", "brunch", "restaurant",
    ],
    tags: ["food", "coffee", "cafe", "recipe", "cooking", "drink"],
    steps: [
      "source the ingredients properly",
      "master one signature dish",
      "serve it while it is still hot",
    ],
    benefits: [
      "the flavour lands the same way every time",
      "you spend less money for a better plate",
      "guests remember the dish, not the venue",
    ],
    proof: ["sold out in under an hour", "earned a five star review", "tripled weekend covers"],
  },
  {
    key: "fitness",
    words: [
      "fitness", "workout", "gym", "health", "training", "yoga", "run",
      "muscle", "wellness", "nutrition", "exercise", "marathon", "mobility",
    ],
    tags: ["fitness", "gym", "workout", "health", "training"],
    steps: [
      "fix the basics before adding anything",
      "add progressive overload every week",
      "treat recovery as part of the training",
    ],
    benefits: [
      "the gains show up and then they stay",
      "you train hard without burning out",
      "energy holds steady through the afternoon",
    ],
    proof: ["finished their first marathon", "doubled their strength in a year", "showed up every single day for 200 days"],
  },
  {
    key: "city",
    words: [
      "city", "urban", "skyline", "downtown", "architecture", "street",
      "metro", "real estate", "apartment", "neighbourhood", "neighborhood",
    ],
    tags: ["city", "skyline", "aerial", "urban", "architecture", "sunset"],
    steps: [
      "know the neighbourhood on foot",
      "learn where the locals actually eat",
      "watch how the light moves through the day",
    ],
    benefits: [
      "the city finally feels like somewhere you belong",
      "you stop paying tourist prices",
      "every corner gives you a better shot",
    ],
    proof: ["shot a full series on one block", "found the rooftop everyone misses", "captured the city in twelve mornings"],
  },
  {
    key: "marketing",
    words: [
      "marketing", "social media", "instagram", "tiktok", "youtube", "promo",
      "advertisement", "campaign", "subscribe", "creator", "influencer",
      "newsletter", "brand awareness",
    ],
    tags: ["marketing", "social", "neon", "subscribe", "cta", "animation"],
    steps: [
      "hook the viewer in the first three seconds",
      "show the payoff before the explanation",
      "give one clear next action",
    ],
    benefits: [
      "people stay until the last frame",
      "the message lands instead of scrolling past",
      "the video sells without feeling like an ad",
    ],
    proof: ["doubled the watch time", "sold out the launch in a day", "crossed a hundred thousand views"],
  },
  {
    key: "education",
    words: [
      "course", "learn", "teach", "lesson", "tutorial", "class", "student",
      "workshop", "skill", "course", "training", "bootcamp",
    ],
    tags: ["workspace", "laptop", "team", "office", "study", "desk"],
    steps: [
      "learn the fundamentals properly",
      "build one small real project",
      "teach it to somebody else",
    ],
    benefits: [
      "the knowledge sticks because you used it",
      "the skill opens doors you did not know about",
      "you can explain it in your own words",
    ],
    proof: ["landed the first paid project", "taught it to forty students", "passed the certification on the first try"],
  },
  {
    key: "lifestyle",
    words: [
      "life", "habit", "routine", "morning", "productivity", "mindset",
      "self improvement", "motivation", "focus", "balance", "wellbeing",
    ],
    tags: ["lifestyle", "morning", "nature", "workspace", "calm"],
    steps: [
      "fix the first hour of the day",
      "remove one daily friction point",
      "repeat it until it is automatic",
    ],
    benefits: [
      "the day starts on your terms",
      "the stress level drops without trying",
      "progress becomes the default, not the exception",
    ],
    proof: ["kept the habit for a full year", "went from scattered to focused", "quietly changed everything"],
  },
];

const DEFAULT_CATEGORY = CATEGORIES[CATEGORIES.length - 1];

const TONE_OPENERS: Record<Tone, string[]> = {
  energetic: ["Ready?", "Watch this.", "Here is the thing."],
  professional: ["Let us break it down.", "Here is the approach.", "Consider this."],
  friendly: ["Let us look at this together.", "Here is what works.", "Let me show you."],
  cinematic: ["Imagine this.", "Every shift starts somewhere.", "Picture it."],
  minimal: ["Simply this:", "In short:", "One idea:"],
};

const TONE_HOOKS: Record<Tone, string[]> = {
  energetic: [
    "{opener} {topic} is way simpler than people think — {promise}.",
    "Most people get {topic} wrong. Here is the fast fix.",
    "Stop scrolling. {topicStart} can be this easy.",
  ],
  professional: [
    "{opener} A practical look at {topic}, and why it matters now.",
    "{topicStart} deserves a clear framework. Here is one.",
    "A short, structured guide to {topic} that you can apply today.",
  ],
  friendly: [
    "{opener} Here is the friendly version of {topic}.",
    "If {topic} has felt confusing, this walkthrough is for you.",
    "{opener} We will make {topic} feel simple.",
  ],
  cinematic: [
    "{opener} Every breakthrough in {topic} started with a single decision.",
    "Before the noise, there was {topic}. This is the story.",
    "{topicStart} is not a trend. It is a shift.",
  ],
  minimal: [
    "{opener} {topicStart}, explained in one minute.",
    "{opener} {topic} without the fluff.",
    "{topicStart}: what matters, what does not.",
  ],
};

const PROMISES = [
  "it is simpler than you think",
  "there is a repeatable system underneath",
  "small changes compound fast",
  "you can start today, not someday",
];

const REASONS = [
  "it quietly decides the rest of the outcome",
  "it separates the teams that win from the ones that guess",
  "it is where almost all of the wasted effort hides",
  "it compounds faster than any other lever",
];

const TIPS = [
  "keep the first version embarrassingly simple",
  "batch the work into focused blocks",
  "review the numbers every single week",
  "talk to one real customer before you build more",
  "write the caption before you record a word",
];

const CAPTION_TEMPLATES: Record<string, string> = {
  hook: "Why {topic}",
  context: "The bigger picture",
  how: "Step by step",
  benefit: "What you gain",
  proof: "Real results",
  tip: "One small tip",
  cta: "Start today",
};

const SMALL_WORDS = new Set(["a", "an", "the", "for", "of", "and", "to", "in", "on"]);

const ACRONYMS = new Set([
  "ai", "api", "seo", "roi", "kpi", "hr", "saas", "ux", "ui", "vr", "ar",
  "diy", "b2b", "b2c", "ceo", "cfo", "cto", "faq", "pdf", "uk", "us", "ml",
  "gpu", "cpu", "iot", "crm", "erp", "nft", "usdt", "3d", "2d", "ai-powered",
]);

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function cleanTopic(prompt: string): string {
  let topic = prompt.trim().replace(/\s+/g, " ");
  const question =
    /^(?:how|why|what|when|where|who)\b\s*(?:do|does|did|can|could|should|would|will|is|are|was|were|to)?\s*(?:\w+\s+){0,3}?(?:use|using|utilise|utilizing|leverage|leveraging|build|building|make|making|run|running|transform|transforms|change|changes|automate|automates|handle|handles|improve|improves|revolutionize|revolutionizes|work|works)\s+(.+)$/i.exec(
      topic,
    );
  const structured =
    /^(?:a|an|the)?\s*(?:\d+\s*[- ]?(?:second|sec|s|minute|min)s?\s+)?(?:[\w'’-]+\s+){0,4}?(?:video|clip|reel|ad|advert|advertisement|promo|explainer|film|post|piece|showcase|spot|reel)\b\s+(?:about|on|for|explaining|that\s+explains|covering|highlighting|showcasing)\s+(.+)$/i.exec(
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
  topic = topic.replace(/[.!?]+$/, "");
  return topic.length > 0 ? topic : prompt.trim();
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
    // Ties are broken by the keyword that appears latest in the prompt, since
    // the subject of the video usually sits at the end of the sentence.
    if (score > bestScore || (score === bestScore && score > 0 && lastHit > bestHit)) {
      best = category;
      bestScore = score;
      bestHit = lastHit;
    }
  }
  return best;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function beatSequence(count: number): string[] {
  const beats = ["hook", "context", "how", "benefit", "proof", "tip", "cta"];
  if (count <= beats.length) {
    if (count === 3) return ["hook", "how", "cta"];
    if (count === 4) return ["hook", "how", "benefit", "cta"];
    if (count === 5) return ["hook", "context", "how", "benefit", "cta"];
    return beats.slice(0, count);
  }
  const out: string[] = [];
  while (out.length < count) {
    for (const beat of beats) {
      if (out.length >= count) break;
      if (beat === "hook" && out.length > 0) continue;
      out.push(beat);
    }
  }
  return out;
}

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function buildNarration(
  beat: string,
  topic: string,
  category: Category,
  tone: Tone,
  index: number,
): string {
  const opener = pick(TONE_OPENERS[tone], index);
  const topicStart = sentenceCase(topic);
  const promise = pick(PROMISES, index);
  const reason = pick(REASONS, index);
  const step1 = category.steps[0];
  const step2 = category.steps[1];
  const step3 = category.steps[2];
  const benefit = pick(category.benefits, index);
  const proof = pick(category.proof, index);
  const tip = pick(TIPS, index);

  switch (beat) {
    case "hook":
      return pick(TONE_HOOKS[tone], index)
        .replace("{opener}", opener)
        .replace("{topicStart}", topicStart)
        .replace("{topic}", topic)
        .replace("{promise}", promise);
    case "context":
      return `Most teams treat ${topicStart} as a side task. It is not. ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;
    case "how":
      return `Here is the simple version. Start with ${step1}. Then ${step2}. Finally ${step3}.`;
    case "benefit":
      return `The result is obvious once it clicks: ${benefit}. No more guesswork, no more wasted motion.`;
    case "proof":
      return `It is not theory. Teams that run this play ${proof}, and the difference shows up within weeks.`;
    case "tip":
      return `One more thing that changes everything: ${tip}. That single habit keeps ${topic} compounding.`;
    case "cta":
      return `Try it on your next project, and subscribe for more practical breakdowns like this one.`;
    default:
      return `${topic}, explained clearly and quickly.`;
  }
}

function buildCaption(beat: string, topic: string): string {
  const template = CAPTION_TEMPLATES[beat] ?? "{topic}";
  return template.replace("{topic}", titleCase(topic));
}

function buildMediaQuery(beat: string, category: Category, index: number): string {
  const tags = [...category.tags];
  const rotated = [...tags.slice(index % tags.length), ...tags.slice(0, index % tags.length)];
  const extra: Record<string, string> = {
    hook: rotated.slice(0, 3).join(" "),
    context: rotated.slice(1, 4).join(" "),
    how: rotated.slice(0, 2).join(" "),
    benefit: rotated.slice(2, 4).join(" "),
    proof: "team office meeting business",
    tip: rotated.slice(1, 3).join(" "),
    cta: rotated.slice(0, 2).join(" "),
  };
  return extra[beat] ?? rotated.slice(0, 3).join(" ");
}

function sceneCountFor(duration: number): number {
  return Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(duration / 9)));
}

export type GenerateScriptOptions = {
  prompt: string;
  duration: number;
  tone: Tone;
  language: string;
  title?: string;
};

function localGenerate(options: GenerateScriptOptions): VideoScript {
  const topic = cleanTopic(options.prompt);
  const category = detectCategory(options.prompt);
  const count = sceneCountFor(options.duration);
  const beats = beatSequence(count);
  const usedAssets: string[] = [];

  const scenes: Scene[] = beats.map((beat, index) => {
    const mediaQuery = buildMediaQuery(beat, category, index);
    const matched = matchLocalAsset(mediaQuery, "video", usedAssets);
    if (matched) usedAssets.push(matched.id);
    return hydrateSceneMedia({
      id: randomUUID(),
      narration: buildNarration(beat, topic, category, options.tone, index),
      caption: buildCaption(beat, topic),
      mediaQuery,
      mediaId: matched?.id ?? null,
      mediaType: "video",
      mediaUrl: matched ? previewUrlForAsset(matched) : null,
      mediaThumb: matched?.thumb ?? null,
      mediaTitle: matched?.title ?? null,
      mediaCreator: matched?.creator ?? null,
      mediaProvider: matched?.provider ?? "pexels",
      duration: null,
      transition: beat === "hook" ? "fade" : "none",
    });
  });

  const title =
    options.title?.trim() ||
    `${titleCase(topic)} — ${titleCase(options.tone)} Explainer`.slice(0, 90);

  return {
    title,
    summary: `${sceneCountFor(options.duration)} scenes · ${category.key} topic · ${options.tone} tone`,
    scenes,
  };
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish", ru: "Russian",
};

type AiScene = { narration?: string; caption?: string; mediaQuery?: string };
type AiScript = { title?: string; summary?: string; scenes?: AiScene[] };

/** Turn AI scene text into a full Scene with a matched (unused) stock clip. */
export function sceneFromText(
  scene: AiScene,
  fallbackQuery: string,
  usedAssets: string[],
  id: string = randomUUID(),
): Scene {
  const mediaQuery = (scene.mediaQuery ?? "").replace(/\s+/g, " ").trim() || fallbackQuery;
  // Prefer clips matching the scene's own keywords, then the video's topic,
  // and only then any unused clip (never an unrelated alphabetical default).
  const pick = (query: string) =>
    searchLocalCatalog(query, { type: "video", limit: 24 }).find((asset) => !usedAssets.includes(asset.id));
  const matched =
    pick(mediaQuery) ??
    pick(`${scene.narration ?? ""} ${scene.caption ?? ""}`) ??
    pick(fallbackQuery) ??
    matchLocalAsset(mediaQuery, "video", usedAssets);
  if (matched) usedAssets.push(matched.id);
  return hydrateSceneMedia({
    id,
    narration: (scene.narration ?? "").trim(),
    caption: (scene.caption ?? "").trim().slice(0, 60),
    mediaQuery,
    mediaId: matched?.id ?? null,
    mediaType: "video",
    mediaUrl: matched ? previewUrlForAsset(matched) : null,
    mediaThumb: matched?.thumb ?? null,
    mediaTitle: matched?.title ?? null,
    mediaCreator: matched?.creator ?? null,
    mediaProvider: matched?.provider ?? "pexels",
    duration: null,
    transition: "fade",
  });
}

export function scriptWritingRules(options: { tone: Tone; language: string; duration: number }): string {
  const language = LANGUAGE_NAMES[options.language] ?? "English";
  const words = Math.round(options.duration * 2.5);
  return [
    `Write in ${language}.`,
    `Tone: ${options.tone}.`,
    `The whole narration should be about ${words} words in total (≈${options.duration} seconds spoken).`,
    "Each scene: narration of 1-2 natural spoken sentences that move the story forward (no filler, no 'in this video').",
    "Open with a strong hook, end with a clear takeaway or call to action.",
    "caption: a punchy on-screen title, max 6 words.",
    "mediaQuery: 2-4 concrete, filmable English stock-footage keywords describing what is visible (e.g. 'woman jogging park sunrise'), never abstract ideas.",
  ].join(" ");
}

async function llmGenerate(options: GenerateScriptOptions): Promise<VideoScript | null> {
  const count = sceneCountFor(options.duration);
  const parsed = await llmJson<AiScript>([
    {
      role: "system",
      content: "You are an award-winning short-form video scriptwriter. Reply with a single JSON object only.",
    },
    {
      role: "user",
      content: `Create a ${count}-scene video script for: "${options.prompt}". ${scriptWritingRules(options)} JSON shape: {"title": string, "summary": string, "scenes": [{"narration": string, "caption": string, "mediaQuery": string}]}`,
    },
  ]);
  const scenes = (parsed?.scenes ?? []).filter((scene) => scene?.narration?.trim());
  if (!parsed || scenes.length === 0) return null;

  const used: string[] = [];
  const category = detectCategory(options.prompt);
  return {
    title: (parsed.title ?? cleanTopic(options.prompt)).slice(0, 90),
    summary: parsed.summary ?? `${scenes.length} scenes · ${options.tone} tone`,
    scenes: scenes.slice(0, MAX_SCENES).map((scene, index) =>
      sceneFromText(scene, `${options.prompt} ${buildMediaQuery("context", category, index)}`, used),
    ),
  };
}

export async function generateScript(
  options: GenerateScriptOptions,
): Promise<VideoScript> {
  const llm = await llmGenerate(options);
  if (llm) return llm;
  return localGenerate(options);
}

export function regenerateScene(
  script: VideoScript,
  sceneIndex: number,
  options: { prompt: string; tone: Tone },
): Scene {
  const scene = script.scenes[sceneIndex];
  const category = detectCategory(options.prompt);
  const topic = cleanTopic(options.prompt);
  const beats = beatSequence(Math.max(MIN_SCENES, script.scenes.length));
  const beat = beats[sceneIndex] ?? "context";
  const variant = Math.floor(Math.random() * 12) + sceneIndex + 1;
  const narration = buildNarration(beat, topic, category, options.tone, variant);
  const caption = buildCaption(beat, topic);
  const mediaQuery = buildMediaQuery(beat, category, variant);
  const excludeIds = script.scenes
    .map((item) => item.mediaId)
    .filter((id): id is string => Boolean(id));
  const matched = matchLocalAsset(mediaQuery, "video", excludeIds);
  return hydrateSceneMedia({
    ...scene,
    narration,
    caption,
    mediaQuery,
    mediaId: matched?.id ?? scene.mediaId,
    mediaType: "video",
    mediaUrl: matched ? previewUrlForAsset(matched) : scene.mediaUrl,
    mediaThumb: matched?.thumb ?? scene.mediaThumb,
    mediaTitle: matched?.title ?? scene.mediaTitle,
    mediaCreator: matched?.creator ?? scene.mediaCreator,
    mediaProvider: matched?.provider ?? scene.mediaProvider,
  });
}

/** Rewrite one scene with the LLM, keeping the story around it coherent. */
export async function regenerateSceneAi(
  script: VideoScript,
  sceneIndex: number,
  options: { prompt: string; tone: Tone; language: string; duration: number },
): Promise<Scene> {
  const scene = script.scenes[sceneIndex];
  const outline = script.scenes
    .map((item, index) => `${index + 1}. ${item.narration}`)
    .join("\n");
  const parsed = await llmJson<AiScene>(
    [
      { role: "system", content: "You are a video scriptwriter. Reply with a single JSON object only." },
      {
        role: "user",
        content: `Video topic: "${options.prompt}". Current script:\n${outline}\n\nRewrite scene ${sceneIndex + 1} so it is fresher and more engaging while fitting between its neighbours. ${scriptWritingRules({ ...options, duration: Math.max(4, Math.round(options.duration / Math.max(1, script.scenes.length))) })} JSON: {"narration": string, "caption": string, "mediaQuery": string}`,
      },
    ],
    { timeoutMs: 35_000 },
  );
  if (!parsed?.narration?.trim()) {
    return regenerateScene(script, sceneIndex, options);
  }
  const used = script.scenes
    .filter((_, index) => index !== sceneIndex)
    .map((item) => item.mediaId)
    .filter((id): id is string => Boolean(id));
  const next = sceneFromText(parsed, scene.mediaQuery, used, scene.id);
  return { ...next, duration: scene.duration };
}
