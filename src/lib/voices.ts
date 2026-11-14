export type VoiceGender = "male" | "female";

export type Voice = {
  id: string;
  name: string;
  gender: VoiceGender;
  accent: string;
  style: string;
  description: string;
  /** Neural (Edge) voice identifier, e.g. en-US-AriaNeural. */
  neuralVoice: string;
  /** Speaking rate applied on top of the voice, in percent. */
  rate: number;
  /** Pitch offset applied on top of the voice, in hertz. */
  pitch: number;
  /** Fallback identifier for the offline engine. */
  engineVoice: string;
  previewText: string;
};

const preview =
  "Hi, I am your AI presenter. Give me a script and I will turn it into a full video.";

export const VOICES: Voice[] = [
  {
    id: "ava",
    name: "Ava",
    gender: "female",
    accent: "American",
    style: "Warm & natural",
    description: "Balanced, friendly narrator that suits almost any explainer.",
    neuralVoice: "en-US-AriaNeural",
    rate: 0,
    pitch: 0,
    engineVoice: "en-us+f3",
    previewText: preview,
  },
  {
    id: "mia",
    name: "Mia",
    gender: "female",
    accent: "American",
    style: "Bright & upbeat",
    description: "High energy delivery for social and product launches.",
    neuralVoice: "en-US-JennyNeural",
    rate: 12,
    pitch: 6,
    engineVoice: "en-us+f5",
    previewText: preview,
  },
  {
    id: "zoe",
    name: "Zoe",
    gender: "female",
    accent: "American",
    style: "Calm & clear",
    description: "Measured pace, great for explainers and documentation.",
    neuralVoice: "en-US-MichelleNeural",
    rate: -6,
    pitch: -2,
    engineVoice: "en-us+f2",
    previewText: preview,
  },
  {
    id: "iris",
    name: "Iris",
    gender: "female",
    accent: "American",
    style: "Documentary",
    description: "Cinematic, textured narration for storytelling formats.",
    neuralVoice: "en-US-SaraNeural",
    rate: -8,
    pitch: -4,
    engineVoice: "en-us+f4",
    previewText: preview,
  },
  {
    id: "nova",
    name: "Nova",
    gender: "female",
    accent: "American",
    style: "Youthful",
    description: "Bright and youthful tone for short-form vertical clips.",
    neuralVoice: "en-US-AnaNeural",
    rate: 10,
    pitch: 10,
    engineVoice: "en-us+f1",
    previewText: preview,
  },
  {
    id: "noah",
    name: "Noah",
    gender: "male",
    accent: "American",
    style: "Deep & confident",
    description: "Authoritative low register for brand and corporate videos.",
    neuralVoice: "en-US-GuyNeural",
    rate: -4,
    pitch: -8,
    engineVoice: "en-us+m3",
    previewText: preview,
  },
  {
    id: "liam",
    name: "Liam",
    gender: "male",
    accent: "American",
    style: "Friendly",
    description: "Conversational male voice for vlogs and walkthroughs.",
    neuralVoice: "en-US-EricNeural",
    rate: 4,
    pitch: 0,
    engineVoice: "en-us+m1",
    previewText: preview,
  },
  {
    id: "ethan",
    name: "Ethan",
    gender: "male",
    accent: "American",
    style: "Corporate",
    description: "Polished, neutral delivery for B2B and promo content.",
    neuralVoice: "en-US-DavisNeural",
    rate: 0,
    pitch: -2,
    engineVoice: "en-us+m4",
    previewText: preview,
  },
  {
    id: "kai",
    name: "Kai",
    gender: "male",
    accent: "American",
    style: "Young & punchy",
    description: "Fast, modern delivery for reels and shorts.",
    neuralVoice: "en-US-JasonNeural",
    rate: 16,
    pitch: 6,
    engineVoice: "en-us+m7",
    previewText: preview,
  },
  {
    id: "omar",
    name: "Omar",
    gender: "male",
    accent: "American",
    style: "Warm storyteller",
    description: "Storyteller tone that keeps long scripts engaging.",
    neuralVoice: "en-US-TonyNeural",
    rate: -2,
    pitch: -4,
    engineVoice: "en-us+m5",
    previewText: preview,
  },
  {
    id: "pip",
    name: "Pip",
    gender: "female",
    accent: "British",
    style: "Refined",
    description: "Polished British delivery for premium brand films.",
    neuralVoice: "en-GB-SoniaNeural",
    rate: 0,
    pitch: 0,
    engineVoice: "en-rp+f3",
    previewText: preview,
  },
  {
    id: "tom",
    name: "Tom",
    gender: "male",
    accent: "British",
    style: "Documentary",
    description: "Classic British narrator voice for explainers.",
    neuralVoice: "en-GB-RyanNeural",
    rate: -4,
    pitch: -3,
    engineVoice: "en-rp+m3",
    previewText: preview,
  },
  {
    id: "sam",
    name: "Sam",
    gender: "male",
    accent: "Australian",
    style: "Relaxed",
    description: "Laid-back Australian tone for travel and lifestyle.",
    neuralVoice: "en-AU-WilliamNeural",
    rate: 2,
    pitch: -2,
    engineVoice: "en-sc+m3",
    previewText: preview,
  },
  {
    id: "harper",
    name: "Harper",
    gender: "female",
    accent: "Australian",
    style: "Friendly & bright",
    description: "Bright Australian delivery for lifestyle content.",
    neuralVoice: "en-AU-NatashaNeural",
    rate: 8,
    pitch: 4,
    engineVoice: "en-sc+f4",
    previewText: preview,
  },
];

/** Locale-aware voice used when a project is rendered in another language. */
const LOCALE_VOICES: Record<
  string,
  { female: string; male: string }
> = {
  en: { female: "en-US-AriaNeural", male: "en-US-GuyNeural" },
  es: { female: "es-ES-ElviraNeural", male: "es-ES-AlvaroNeural" },
  fr: { female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" },
  de: { female: "de-DE-KatjaNeural", male: "de-DE-ConradNeural" },
  pt: { female: "pt-BR-FranciscaNeural", male: "pt-BR-AntonioNeural" },
  it: { female: "it-IT-ElsaNeural", male: "it-IT-DiegoNeural" },
  nl: { female: "nl-NL-ColetteNeural", male: "nl-NL-DirkNeural" },
  pl: { female: "pl-PL-ZofiaNeural", male: "pl-PL-MarekNeural" },
  tr: { female: "tr-TR-EmelNeural", male: "tr-TR-AhmetNeural" },
  ru: { female: "ru-RU-SvetlanaNeural", male: "ru-RU-DmitryNeural" },
};

export const DEFAULT_VOICE_ID = "ava";

export function getVoice(id: string): Voice {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0];
}

/**
 * Resolve the neural voice for a persona in the project language. English
 * keeps the accent personality, other languages use a native locale voice.
 */
export function resolveNeuralVoice(voice: Voice, language: string): string {
  if (!language || language === "en") return voice.neuralVoice;
  const locale = LOCALE_VOICES[language];
  if (!locale) return voice.neuralVoice;
  return voice.gender === "female" ? locale.female : locale.male;
}

export type TtsProvider =
  | "elevenlabs"
  | "openai"
  | "edge"
  | "builtin";

export function activeTtsProvider(): TtsProvider {
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "edge";
}
