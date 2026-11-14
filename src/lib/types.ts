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
  /** `stock` = licensed clip, `generated` = AI image/video, `upload` = user file. */
  mediaOrigin?: MediaOrigin;
  /** Set when `mediaOrigin === "generated"`. */
  generated?: GeneratedMediaMeta;
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
  brandKitId?: string | null;
  /** Hydrated by the Studio/API layer when branding matters for rendering. */
  brandKit?: BrandKit | null;
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



export const MAX_SCENES = 12;
export const MIN_SCENES = 3;

/* ------------------------------------------------------------------ media */

/** Where a scene's visual came from. */
export type MediaOrigin = "stock" | "generated" | "upload";

export type GeneratedMediaMeta = {
  /** Prompt actually sent to the image model. */
  prompt: string;
  /** Which backend produced it: `openai` | `stability` | `replicate` | `gemini` | `procedural`. */
  provider: string;
  /** True when no image API was configured and we composed the frame locally. */
  fallback?: boolean;
};

/* ---------------------------------------------------------------- branding */

export type BrandFontId =
  | "dejavu"
  | "inter"
  | "georgia"
  | "impact"
  | "courier";

export const BRAND_FONTS: { id: BrandFontId; label: string; assName: string }[] = [
  { id: "dejavu", label: "DejaVu Sans", assName: "DejaVu Sans" },
  { id: "inter", label: "Grotesk (sans)", assName: "DejaVu Sans" },
  { id: "georgia", label: "Editorial (serif)", assName: "DejaVu Serif" },
  { id: "impact", label: "Poster (heavy)", assName: "DejaVu Sans" },
  { id: "courier", label: "Terminal (mono)", assName: "DejaVu Sans Mono" },
];

export type BrandKit = {
  id: string;
  name: string;
  logoPath: string | null;
  /** Resolved, browser-reachable logo URL (populated by the API layer). */
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  font: BrandFontId;
  introTitle: string | null;
  introSubtitle: string | null;
  outroText: string | null;
  website: string | null;
  showLogo: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const BRAND_FONT_ASS_NAME: Record<BrandFontId, string> = {
  dejavu: "DejaVu Sans",
  inter: "DejaVu Sans",
  georgia: "DejaVu Serif",
  impact: "DejaVu Sans",
  courier: "DejaVu Sans Mono",
};

/* ------------------------------------------------------------------ voices */

export type ClonedVoice = {
  id: string;
  name: string;
  provider: "elevenlabs" | "custom";
  providerVoiceId: string;
  gender: "male" | "female" | "neutral";
  accent: string;
  description: string | null;
  sampleCount: number;
  createdAt?: string;
};

/* --------------------------------------------------------------- languages */

export type LanguageMeta = {
  id: string;
  label: string;
  native: string;
  /** Neural (Edge) voice used when dubbing into this language. */
  neuralFemale: string;
  neuralMale: string;
};

export const LANGUAGES: LanguageMeta[] = [
  { id: "en", label: "English", native: "English", neuralFemale: "en-US-AriaNeural", neuralMale: "en-US-GuyNeural" },
  { id: "es", label: "Spanish", native: "Español", neuralFemale: "es-ES-ElviraNeural", neuralMale: "es-ES-AlvaroNeural" },
  { id: "fr", label: "French", native: "Français", neuralFemale: "fr-FR-DeniseNeural", neuralMale: "fr-FR-HenriNeural" },
  { id: "de", label: "German", native: "Deutsch", neuralFemale: "de-DE-KatjaNeural", neuralMale: "de-DE-ConradNeural" },
  { id: "pt", label: "Portuguese", native: "Português", neuralFemale: "pt-BR-FranciscaNeural", neuralMale: "pt-BR-AntonioNeural" },
  { id: "it", label: "Italian", native: "Italiano", neuralFemale: "it-IT-ElsaNeural", neuralMale: "it-IT-DiegoNeural" },
  { id: "nl", label: "Dutch", native: "Nederlands", neuralFemale: "nl-NL-ColetteNeural", neuralMale: "nl-NL-DirkNeural" },
  { id: "pl", label: "Polish", native: "Polski", neuralFemale: "pl-PL-ZofiaNeural", neuralMale: "pl-PL-MarekNeural" },
  { id: "tr", label: "Turkish", native: "Türkçe", neuralFemale: "tr-TR-EmelNeural", neuralMale: "tr-TR-AhmetNeural" },
  { id: "ru", label: "Russian", native: "Русский", neuralFemale: "ru-RU-SvetlanaNeural", neuralMale: "ru-RU-DmitryNeural" },
  { id: "hi", label: "Hindi", native: "हिन्दी", neuralFemale: "hi-IN-SwaraNeural", neuralMale: "hi-IN-MadhurNeural" },
  { id: "ja", label: "Japanese", native: "日本語", neuralFemale: "ja-JP-NanamiNeural", neuralMale: "ja-JP-KeitaNeural" },
  { id: "ko", label: "Korean", native: "한국어", neuralFemale: "ko-KR-SunHiNeural", neuralMale: "ko-KR-InJoonNeural" },
  { id: "zh", label: "Chinese", native: "中文", neuralFemale: "zh-CN-XiaoxiaoNeural", neuralMale: "zh-CN-YunxiNeural" },
  { id: "ar", label: "Arabic", native: "العربية", neuralFemale: "ar-EG-SalmaNeural", neuralMale: "ar-EG-ShakirNeural" },
];

export function getLanguage(id: string): LanguageMeta {
  return LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0];
}

