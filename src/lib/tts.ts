import fs from "node:fs";
import path from "node:path";
import { EdgeTTS } from "@andresaya/edge-tts";
import { getVoice, resolveNeuralVoice, type TtsProvider } from "./voices";

export type WordTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

export type Speech = {
  data: Buffer;
  ext: "wav" | "mp3";
  provider: TtsProvider;
  wordTimings: WordTiming[];
  durationSec?: number;
};

function mespeakRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "mespeak");
}

let mespeakModule: typeof import("mespeak") | null = null;
const loadedVoices = new Set<string>();

function loadMespeak() {
  if (mespeakModule) return mespeakModule;
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

/**
 * Fallback word timing estimator when a TTS engine doesn't supply word
 * boundaries. Weights word durations by character length + punctuation pauses.
 */
export function estimateWordTimings(text: string, totalDurationSec: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || totalDurationSec <= 0) return [];
  const weights = words.map((w) => {
    const cleanLen = Math.max(2, w.replace(/[^a-z0-9]/gi, "").length);
    const pause = /[.!?]$/.test(w) ? 4 : /[,;:—-]$/.test(w) ? 2 : 0;
    return cleanLen + pause;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const usableDuration = Math.max(0.4, totalDurationSec - 0.12);
  let cursor = 0.05;
  return words.map((word, idx) => {
    const dur = (weights[idx] / totalWeight) * usableDuration;
    const startSec = cursor;
    cursor += dur;
    return {
      text: word,
      startSec,
      endSec: Math.min(totalDurationSec, cursor),
    };
  });
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

/** Microsoft Edge neural voices — studio quality + exact word timestamps, no API key required. */
async function synthesizeEdge(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
): Promise<{ audio: Buffer; wordTimings: WordTiming[]; durationSec: number }> {
  const tts = new EdgeTTS({ timeout: 22000 });
  const result = await tts.generate(text, voice, {
    rate: `${rate >= 0 ? "+" : ""}${rate}%`,
    pitch: `${pitch >= 0 ? "+" : ""}${pitch}Hz`,
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
  });
  const audio = Buffer.from(result.audio);
  if (audio.length === 0) throw new Error("Neural voice returned no audio");

  // Microsoft Edge wordBoundary ticks are 100-nanosecond units (10,000,000 ticks/sec)
  const wordTimings: WordTiming[] = (result.wordBoundaries ?? [])
    .filter((b) => typeof b.text === "string" && b.text.trim().length > 0)
    .map((b) => {
      const startSec = Math.max(0, b.offset / 10_000_000);
      const endSec = Math.max(startSec + 0.08, (b.offset + b.duration) / 10_000_000);
      return { text: b.text.trim(), startSec, endSec };
    });

  return {
    audio,
    wordTimings,
    durationSec: typeof result.duration === "number" ? result.duration : 0,
  };
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
  rateOffset = 0,
): Promise<Speech> {
  const clean = text.trim();
  if (!clean) throw new Error("Nothing to narrate");
  const voice = getVoice(voiceId);
  const neuralVoice = resolveNeuralVoice(voice, language);
  const clampedOffset = Math.max(-25, Math.min(30, Math.round(rateOffset || 0)));
  const effectiveRate = Math.max(-35, Math.min(45, voice.rate + clampedOffset));

  if (process.env.ELEVENLABS_API_KEY) {
    const data = await synthesizeElevenLabs(clean, neuralVoice);
    return { data, ext: "mp3", provider: "elevenlabs", wordTimings: [] };
  }

  if (process.env.OPENAI_API_KEY) {
    const data = await synthesizeOpenAi(clean, neuralVoice);
    return { data, ext: "mp3", provider: "openai", wordTimings: [] };
  }

  try {
    const { audio, wordTimings, durationSec } = await synthesizeEdge(
      clean,
      neuralVoice,
      effectiveRate,
      voice.pitch,
    );
    return {
      data: audio,
      ext: "mp3",
      provider: "edge",
      wordTimings,
      durationSec,
    };
  } catch (error) {
    console.warn(
      "Neural voice unavailable, using offline engine:",
      error instanceof Error ? error.message : error,
    );
  }

  const data = synthesizeBuiltin(
    clean,
    voice.engineVoice,
    Math.max(110, Math.min(240, effectiveRate + 165)),
    voice.pitch,
  );
  return { data, ext: "wav", provider: "builtin", wordTimings: [] };
}
