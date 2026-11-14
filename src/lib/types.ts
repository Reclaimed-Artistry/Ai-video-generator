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
  /** In-point (seconds) inside the source clip where playback starts. */
  mediaStart?: number | null;
  /** User picked this clip by hand: never auto-replace it. */
  mediaLocked?: boolean;
  /** Fingerprint of the narration the current clip was matched to. */
  mediaMatchedFor?: string | null;
  duration: number | null;
  transition: "fade" | "none";
};

export type ProductionOptions = {
  workflow?: Workflow;
  musicTrack?: MusicTrackId;
  musicVolume?: number; // 0 to 0.5
  captionMode?: CaptionMode;
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
