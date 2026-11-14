import fs from "node:fs";
import path from "node:path";
import { EdgeTTS } from "@andresaya/edge-tts";
import { getVoice, resolveNeuralVoice, type TtsProvider } from "./voices";

export type Speech = {
  data: Buffer;
  ext: "wav" | "mp3";
  provider: TtsProvider;
};

function mespeakRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "mespeak");
}

let mespeakModule: typeof import("mespeak") | null = null;
const loadedVoices = new Set<string>();

function loadMespeak() {
  if (mespeakModule) return mespeakModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("mespeak") as typeof import("mespeak");
  const configPath = path.join(mespeakRoot(), "src", "mespeak_config.json");
  const config = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ configPath, "utf8"));
  mod.loadConfig(config);
  mespeakModule = mod;
  return mod;
}

function mespeakVoiceFile(engineVoice: string): string | null {
  const base = engineVoice.split("+")[0];
  const root = mespeakRoot();
  const candidates = [
    path.join(root, "voices", "en", `${base}.json`),
    path.join(root, "voices", `${base}.json`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  }
  return null;
}

/** Offline, dependency-free speech synthesis (espeak based) — last resort. */
function synthesizeBuiltin(text: string, engineVoice: string, rate: number, pitch: number) {
  const mespeak = loadMespeak();
  const file = mespeakVoiceFile(engineVoice);
  if (file && !loadedVoices.has(file)) {
    mespeak.loadVoice(JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8")));
    loadedVoices.add(file);
  }
  const buffer = mespeak.speak(text, {
    v: engineVoice,
    s: rate,
    p: pitch,
    rawdata: "buffer",
  });
  if (!buffer || buffer.length === 0) {
    throw new Error("Offline speech synthesis produced no audio");
  }
  return Buffer.from(buffer);
}

/** Microsoft Edge neural voices — studio quality, no API key required. */
async function synthesizeEdge(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
): Promise<Buffer> {
  const tts = new EdgeTTS({ timeout: 20000 });
  const result = await tts.generate(text, voice, {
    rate: `${rate >= 0 ? "+" : ""}${rate}%`,
    pitch: `${pitch >= 0 ? "+" : ""}${pitch}Hz`,
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
  });
  const audio = Buffer.from(result.audio);
  if (audio.length === 0) throw new Error("Neural voice returned no audio");
  return audio;
}

async function synthesizeElevenLabs(text: string, voice: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY as string;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || voice;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8 },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed with ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeOpenAi(text: string, voice: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY as string;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI TTS failed with ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  language = "en",
): Promise<Speech> {
  const clean = text.trim();
  if (!clean) throw new Error("Nothing to narrate");
  const voice = getVoice(voiceId);
  const neuralVoice = resolveNeuralVoice(voice, language);

  if (process.env.ELEVENLABS_API_KEY) {
    const data = await synthesizeElevenLabs(clean, neuralVoice);
    return { data, ext: "mp3", provider: "elevenlabs" };
  }

  if (process.env.OPENAI_API_KEY) {
    const data = await synthesizeOpenAi(clean, neuralVoice);
    return { data, ext: "mp3", provider: "openai" };
  }

  try {
    const data = await synthesizeEdge(clean, neuralVoice, voice.rate, voice.pitch);
    return { data, ext: "mp3", provider: "edge" };
  } catch (error) {
    console.warn(
      "Neural voice unavailable, using offline engine:",
      error instanceof Error ? error.message : error,
    );
  }

  const data = synthesizeBuiltin(clean, voice.engineVoice, voice.rate + 165, voice.pitch);
  return { data, ext: "wav", provider: "builtin" };
}
