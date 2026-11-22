import type { StickAction, StickTheme } from "./stickman";
export type MediaType = "video" | "photo";
export type Resolution = "240p" | "360p" | "1080p";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Tone = "energetic" | "professional" | "friendly" | "cinematic" | "minimal";
export type Style = "modern" | "minimal" | "cinematic" | "energetic" | "corporate";
export type Workflow = "explainer" | "shorts" | "commercial" | "documentary" | "script";
export type CaptionMode = "word-highlight" | "subtitle" | "headline" | "off";
export type MusicTrackId =
  | "none"
  | "uplifting"
  | "cinematic"
  | "ambient"
  | "warm"
  | "corporate";
export type StockProvider =
  | "all"
  | "pexels"
  | "mixkit"
  | "wikimedia"
  | "nasa"
  | "pixabay";

export type MediaFilter = "none" | "warm" | "cool" | "vivid" | "noir";
export type CaptionPosition = "bottom" | "center" | "top";

export type PeopleRepresentation =
  | "all"
  | "african-american"
  | "african"
  | "hispanic"
  | "east-asian"
  | "south-asian"
  | "middle-eastern"
  | "caucasian";

export const PEOPLE_REPRESENTATIONS: {
  id: PeopleRepresentation;
  label: string;
  shortLabel: string;
  description: string;
  searchPrefix: string;
  slugPrefixes: string[];
}[] = [
  {
    id: "all",
    label: "All Races (Diverse)",
    shortLabel: "All Races",
    description: "Diverse multiracial people & global real-world footage",
    searchPrefix: "",
    slugPrefixes: [],
  },
  {
    id: "african-american",
    label: "African American",
    shortLabel: "African American",
    description: "African American / Black American cast across scenes",
    searchPrefix: "african american",
    slugPrefixes: ["african-american", "black"],
  },
  {
    id: "african",
    label: "African Only",
    shortLabel: "African Only",
    description: "African people, entrepreneurs & settings across Africa",
    searchPrefix: "african",
    slugPrefixes: ["african", "africa"],
  },
  {
    id: "hispanic",
    label: "Hispanic / Latino",
    shortLabel: "Hispanic",
    description: "Hispanic & Latino cast across scenes",
    searchPrefix: "hispanic latino",
    slugPrefixes: ["hispanic", "latino"],
  },
  {
    id: "east-asian",
    label: "East Asian",
    shortLabel: "East Asian",
    description: "East Asian cast across scenes",
    searchPrefix: "east asian",
    slugPrefixes: ["asian", "east-asian"],
  },
  {
    id: "south-asian",
    label: "South Asian",
    shortLabel: "South Asian",
    description: "South Asian / Indian cast across scenes",
    searchPrefix: "indian south asian",
    slugPrefixes: ["indian", "south-asian"],
  },
  {
    id: "middle-eastern",
    label: "Middle Eastern",
    shortLabel: "Middle Eastern",
    description: "Middle Eastern / Arab cast across scenes",
    searchPrefix: "middle eastern arab",
    slugPrefixes: ["arab", "middle-eastern"],
  },
  {
    id: "caucasian",
    label: "White / Caucasian",
    shortLabel: "Caucasian",
    description: "White / European / Caucasian cast across scenes",
    searchPrefix: "caucasian",
    slugPrefixes: ["caucasian", "european"],
  },
];

export function getPeopleRepresentation(
  id?: string | null,
): (typeof PEOPLE_REPRESENTATIONS)[number] {
  return (
    PEOPLE_REPRESENTATIONS.find((item) => item.id === id) ??
    PEOPLE_REPRESENTATIONS[0]
  );
}

export const MEDIA_FILTERS: { id: MediaFilter; label: string; css: string }[] = [
  { id: "none", label: "Natural", css: "none" },
  { id: "warm", label: "Cinema Warm", css: "sepia(0.18) saturate(1.18) contrast(1.06)" },
  { id: "cool", label: "Cool Tech", css: "hue-rotate(-10deg) saturate(1.12) contrast(1.08)" },
  { id: "vivid", label: "High Contrast", css: "contrast(1.22) saturate(1.25)" },
  { id: "noir", label: "Noir B&W", css: "grayscale(1) contrast(1.25)" },
];

export const MEDIA_SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export const CAPTION_POSITIONS: { id: CaptionPosition; label: string }[] = [
  { id: "bottom", label: "Bottom" },
  { id: "center", label: "Center" },
  { id: "top", label: "Top" },
];

export type Scene = {
  id: string;
  narration: string;
  caption: string;
  mediaQuery: string;
  mediaId: string | null;
  mediaType: MediaType | null;
  mediaUrl?: string | null;
  mediaThumb?: string | null;
  mediaTitle?: string | null;
  mediaCreator?: string | null;
  mediaProvider?: string | null;
  /** Original stock page and licence, retained for attribution and reuse checks. */
  mediaPageUrl?: string | null;
  mediaLicense?: string | null;
  mediaStart?: number | null; // Clip trim in-point (seconds)
  mediaSpeed?: number | null; // 0.75x .. 1.5x
  mediaFilter?: MediaFilter | null;
  mediaLocked?: boolean;
  /** "ai" = generated image/video; "stickman" = built-in stick-figure animation. */
  mediaSource?: "stock" | "ai" | "stickman" | null;
  /** Stickman performance for this scene (auto-picked from the narration when unset). */
  stickAction?: StickAction | null;
  /** True for audio-driven talking-character clips (never time-stretched). */
  aiLipsync?: boolean | null;
  /** Text-to-image prompt for this scene (written by the AI script writer). */
  aiPrompt?: string | null;
  aiStyle?: AiStyleId | null;
  aiMotion?: AiMotion | null;
  aiSeed?: number | null;
  duration: number | null;
  transition: "fade" | "none";
};

export type ProductionOptions = {
  workflow?: Workflow;
  musicTrack?: MusicTrackId;
  musicVolume?: number; // 0 to 0.5
  captionMode?: CaptionMode;
  captionPosition?: CaptionPosition;
  voiceRateOffset?: number; // -20 to +25 (%)
  autoMatchMedia?: boolean;
  peopleRepresentation?: PeopleRepresentation;
  /** Where scene visuals come from: licensed stock video or generated images. */
  visualMode?: VisualMode;
  aiStyle?: AiStyleId;
  /** Which engine wrote the script (shown in the studio for transparency). */
  scriptEngine?: string;
  stickTheme?: StickTheme;
  /** Story-style segmented progress bar across the top (retention). */
  progressBar?: boolean;
  /** Slow punch-in zoom on stock / AI video shots. */
  punchZoom?: boolean;
  /** Whoosh sound effect on every scene change. */
  sceneSfx?: boolean;
  /** One-sentence visual bible from the AI director (palette, light, recurring character). */
  visualStyle?: string;
  /** 0-100 repetition/quality score of the script, with short notes. */
  qualityScore?: number;
  qualityNotes?: string[];
};

export type VideoScript = {
  title: string;
  summary: string;
  scenes: Scene[];
  options?: ProductionOptions;
};

export type StockSource = {
  url: string;
  width: number;
  height?: number;
  fps?: number;
  bytes?: number;
};

export type StockAsset = {
  id: string;
  provider: string;
  type: MediaType;
  title: string;
  tags: string[];
  creator: string;
  pageUrl: string;
  thumb: string;
  duration?: number;
  portrait?: boolean;
  hasPeople?: boolean;
  demographics?: PeopleRepresentation[];
  /** Per-item licence information, where the provider supplies it. */
  license?: string;
  licenseUrl?: string;
  sources: StockSource[];
};

export type ProjectStatus =
  | "draft"
  | "scripting"
  | "ready"
  | "rendering"
  | "done"
  | "error";

export type Project = {
  id: string;
  title: string;
  prompt: string;
  status: ProjectStatus;
  progress: number;
  stage: string;
  error: string | null;
  voice: string;
  resolution: Resolution;
  aspect: AspectRatio;
  tone: Tone;
  style: Style;
  language: string;
  duration: number;
  script: VideoScript;
  outputPath: string | null;
  posterPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export const RESOLUTIONS: Record<
  Resolution,
  {
    label: string;
    role: string;
    width: number;
    height: number;
    note: string;
    spec: string;
    estMbps: number;
  }
> = {
  "240p": {
    label: "240p",
    role: "Proxy",
    width: 426,
    height: 240,
    note: "Fast timing & script check",
    spec: "426×240 · H.264",
    estMbps: 0.45,
  },
  "360p": {
    label: "360p",
    role: "Web",
    width: 640,
    height: 360,
    note: "Review & lightweight social",
    spec: "640×360 · H.264",
    estMbps: 0.85,
  },
  "1080p": {
    label: "1080p",
    role: "Full HD",
    width: 1920,
    height: 1080,
    note: "Broadcast & YouTube master",
    spec: "1920×1080 · H.264 High",
    estMbps: 4.5,
  },
};

export const RESOLUTION_ORDER: Resolution[] = ["240p", "360p", "1080p"];

export const ASPECTS: Record<
  AspectRatio,
  { label: string; shortLabel: string; ratio: number }
> = {
  "16:9": { label: "Landscape 16:9", shortLabel: "16:9 Wide", ratio: 16 / 9 },
  "9:16": { label: "Vertical 9:16", shortLabel: "9:16 Reel", ratio: 9 / 16 },
  "1:1": { label: "Square 1:1", shortLabel: "1:1 Square", ratio: 1 },
};

export const ASPECT_ORDER: AspectRatio[] = ["16:9", "9:16", "1:1"];

export const WORKFLOWS: Record<
  Workflow,
  {
    label: string;
    shortLabel: string;
    description: string;
    defaultAspect: AspectRatio;
    defaultDuration: number;
    defaultTone: Tone;
    defaultCaptionMode: CaptionMode;
    defaultMusic: MusicTrackId;
  }
> = {
  explainer: {
    label: "YouTube Explainer",
    shortLabel: "Explainer",
    description: "Structured breakdown with synced captions and B-roll cuts.",
    defaultAspect: "16:9",
    defaultDuration: 30,
    defaultTone: "professional",
    defaultCaptionMode: "word-highlight",
    defaultMusic: "corporate",
  },
  shorts: {
    label: "Shorts & Reels",
    shortLabel: "Shorts / Reel",
    description: "Fast-paced 9:16 vertical cut with punchy word-by-word captions.",
    defaultAspect: "9:16",
    defaultDuration: 30,
    defaultTone: "energetic",
    defaultCaptionMode: "word-highlight",
    defaultMusic: "uplifting",
  },
  commercial: {
    label: "Product Promo / Ad",
    shortLabel: "Promo / Ad",
    description: "Hook, product story, proof, and call-to-action commercial cut.",
    defaultAspect: "16:9",
    defaultDuration: 30,
    defaultTone: "cinematic",
    defaultCaptionMode: "word-highlight",
    defaultMusic: "cinematic",
  },
  documentary: {
    label: "Editorial / Mini-Doc",
    shortLabel: "Documentary",
    description: "Measured cinematic narration with atmospheric music and clean subs.",
    defaultAspect: "16:9",
    defaultDuration: 45,
    defaultTone: "cinematic",
    defaultCaptionMode: "subtitle",
    defaultMusic: "ambient",
  },
  script: {
    label: "Script to Video",
    shortLabel: "My Script",
    description: "Paste your own script (one paragraph per scene) — we voice & cut it.",
    defaultAspect: "16:9",
    defaultDuration: 45,
    defaultTone: "professional",
    defaultCaptionMode: "word-highlight",
    defaultMusic: "warm",
  },
};

export const WORKFLOW_ORDER: Workflow[] = [
  "explainer",
  "shorts",
  "commercial",
  "documentary",
  "script",
];

export const CAPTION_MODES: { id: CaptionMode; label: string; note: string }[] = [
  {
    id: "word-highlight",
    label: "Synced Word Highlight",
    note: "Dynamic phrases with active spoken word highlight (InVideo style)",
  },
  {
    id: "subtitle",
    label: "Clean Subtitles",
    note: "Broadcast timed subtitle lines synced to voiceover",
  },
  {
    id: "headline",
    label: "Scene Lower-Third",
    note: "Static scene headline card per cue",
  },
  {
    id: "off",
    label: "No Captions",
    note: "Clean video with voiceover and music only",
  },
];

export const TONES: Tone[] = [
  "energetic",
  "professional",
  "friendly",
  "cinematic",
  "minimal",
];

export const STYLES: Style[] = [
  "modern",
  "minimal",
  "cinematic",
  "energetic",
  "corporate",
];

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "pt", label: "Portuguese" },
  { id: "it", label: "Italian" },
  { id: "nl", label: "Dutch" },
  { id: "pl", label: "Polish" },
  { id: "tr", label: "Turkish" },
  { id: "ru", label: "Russian" },
];

export const MAX_SCENES = 12;
export const MIN_SCENES = 3;

// ─── Generative AI ─────────────────────────────────────────────────────────

/** "ai" is the legacy value from before AI video existed (= AI images). */
export type VisualMode = "stock" | "ai-video" | "ai-image" | "stickman" | "ai";
export type AiKind = "video" | "image";

export function aiKindForMode(mode: VisualMode | undefined): AiKind | null {
  if (mode === "ai-video") return "video";
  if (mode === "ai-image" || mode === "ai") return "image";
  return null;
}
export type AiMotion = "push-in" | "pull-out" | "pan-left" | "pan-right";
export type AiStyleId =
  | "cinematic"
  | "documentary"
  | "illustration"
  | "3d"
  | "anime"
  | "watercolor"
  | "product"
  | "3d-animation"
  | "stick-figure";

export const AI_STYLES: Record<AiStyleId, { label: string; suffix: string }> = {
  cinematic: {
    label: "Cinematic photo",
    suffix: "cinematic film still, anamorphic lens, natural light, shallow depth of field, rich color grade, highly detailed",
  },
  documentary: {
    label: "Documentary",
    suffix: "documentary photograph, candid, realistic, available light, 35mm, authentic texture",
  },
  illustration: {
    label: "Editorial illustration",
    suffix: "editorial illustration, clean shapes, limited warm palette, subtle grain, modern magazine style",
  },
  "3d": {
    label: "3D render",
    suffix: "stylized 3D render, soft global illumination, clay materials, studio lighting, octane",
  },
  anime: {
    label: "Anime",
    suffix: "anime key visual, detailed background art, soft cel shading, cinematic composition",
  },
  watercolor: {
    label: "Watercolor",
    suffix: "watercolor painting, loose brush strokes, paper texture, soft washes of color",
  },
  "3d-animation": {
    label: "3D animation",
    suffix: "3D animated feature film still, Pixar-style stylized characters with expressive faces, soft global illumination, vibrant colors, cinematic lighting",
  },
  "stick-figure": {
    label: "Stick figure",
    suffix: "simple black stick figure doodle on a clean white background, thick hand-drawn lines, minimal flat explainer style",
  },
  product: {
    label: "Product studio",
    suffix: "premium product photography, seamless studio backdrop, softbox lighting, crisp reflections",
  },
};

export const AI_STYLE_ORDER: AiStyleId[] = [
  "cinematic",
  "3d-animation",
  "stick-figure",
  "documentary",
  "illustration",
  "3d",
  "anime",
  "watercolor",
  "product",
];

export const AI_MOTIONS: Record<AiMotion, string> = {
  "push-in": "Slow push-in",
  "pull-out": "Slow pull-out",
  "pan-left": "Pan left",
  "pan-right": "Pan right",
};
