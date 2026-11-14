export type MediaType = "video" | "photo";
export type Resolution = "240p" | "360p" | "1080p";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Tone = "energetic" | "professional" | "friendly" | "cinematic" | "minimal";
export type Style = "modern" | "minimal" | "cinematic" | "energetic" | "corporate";

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
  duration: number | null;
  transition: "fade" | "none";
};

export type VideoScript = {
  title: string;
  summary: string;
  scenes: Scene[];
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
  { label: string; role: string; width: number; height: number; note: string; spec: string }
> = {
  "240p": {
    label: "240p",
    role: "Proxy",
    width: 426,
    height: 240,
    note: "Fast timing check",
    spec: "426×240 · H.264",
  },
  "360p": {
    label: "360p",
    role: "Web",
    width: 640,
    height: 360,
    note: "Review & lightweight embed",
    spec: "640×360 · H.264",
  },
  "1080p": {
    label: "1080p",
    role: "Master",
    width: 1920,
    height: 1080,
    note: "Full HD broadcast master",
    spec: "1920×1080 · H.264 High",
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
