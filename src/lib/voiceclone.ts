import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { clonedVoices, type ClonedVoiceRow } from "@/db/schema";
import { getVoice } from "./voices";
import type { ClonedVoice } from "./types";

export const CLONE_PREFIX = "clone:";

export type VoiceCloneSample = {
  name: string;
  data: Buffer;
  contentType: string;
};

export type VoiceCloneStatus = {
  provider: "elevenlabs" | "preset";
  label: string;
  note: string;
  /** True when real neural voice cloning is available. */
  neural: boolean;
  /** Limits surfaced in the UI. */
  maxSamples: number;
  recommendedSeconds: string;
};

export function voiceCloneStatus(): VoiceCloneStatus {
  if (process.env.ELEVENLABS_API_KEY) {
    return {
      provider: "elevenlabs",
      label: "ElevenLabs Instant Voice Clone",
      note: "Upload 1–5 clips of the speaker and we register a real neural clone.",
      neural: true,
      maxSamples: 5,
      recommendedSeconds: "30s – 3 min total, clean speech, minimal music",
    };
  }
  return {
    provider: "preset",
    label: "Voice preset (no API key)",
    note: "No ELEVENLABS_API_KEY set — we save a named voice preset (base persona + speed + pitch) you can reuse across projects.",
    neural: false,
    maxSamples: 0,
    recommendedSeconds: "Not applicable",
  };
}

export function toClonedVoice(row: ClonedVoiceRow): ClonedVoice {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider === "custom" ? "custom" : "elevenlabs",
    providerVoiceId: row.providerVoiceId,
    gender: (row.gender as ClonedVoice["gender"]) ?? "neutral",
    accent: row.accent || "Cloned",
    description: row.description,
    sampleCount: row.sampleCount,
    createdAt: row.createdAt?.toISOString?.(),
  };
}

export async function listClonedVoices(): Promise<ClonedVoice[]> {
  await ensureSchema();
  const rows = await db
    .select()
    .from(clonedVoices)
    .orderBy(desc(clonedVoices.createdAt))
    .limit(50);
  return rows.map(toClonedVoice);
}

export async function getClonedVoice(id: string): Promise<ClonedVoice | null> {
  await ensureSchema();
  const rows = await db.select().from(clonedVoices).where(eq(clonedVoices.id, id)).limit(1);
  return rows[0] ? toClonedVoice(rows[0]) : null;
}

export function isClonedVoiceId(voiceId: string | null | undefined): boolean {
  return typeof voiceId === "string" && voiceId.startsWith(CLONE_PREFIX);
}

export function clonedVoiceIdFrom(voiceId: string): string {
  return voiceId.slice(CLONE_PREFIX.length);
}

export function clonedVoiceRef(voiceId: string): string {
  return `${CLONE_PREFIX}${voiceId}`;
}

/* ---------------------------------------------------------- voice presets */

export type VoicePresetSettings = {
  baseVoice: string;
  rate: number; // percent offset, -50..50
  pitch: number; // hertz offset, -20..20
};

function encodePreset(settings: VoicePresetSettings): string {
  return JSON.stringify({
    baseVoice: settings.baseVoice,
    rate: Math.max(-50, Math.min(50, Math.round(settings.rate))),
    pitch: Math.max(-20, Math.min(20, Math.round(settings.pitch))),
  });
}

export function decodePreset(raw: string): VoicePresetSettings | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VoicePresetSettings>;
    if (!parsed || typeof parsed.baseVoice !== "string") return null;
    return {
      baseVoice: parsed.baseVoice,
      rate: Number(parsed.rate ?? 0) || 0,
      pitch: Number(parsed.pitch ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- creation */

export type CreateCloneInput = {
  name: string;
  description?: string | null;
  gender?: ClonedVoice["gender"];
  samples?: VoiceCloneSample[];
  /** Used when no cloning API is configured. */
  preset?: VoicePresetSettings;
};

async function registerElevenLabsClone(
  name: string,
  description: string,
  samples: VoiceCloneSample[],
): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY as string;
  const form = new FormData();
  form.append("name", name);
  form.append("description", description);
  for (const sample of samples) {
    form.append(
      "files",
      new Blob([new Uint8Array(sample.data)], { type: sample.contentType }),
      sample.name,
    );
  }
  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs voice clone failed (${response.status})${
        detail ? `: ${detail.slice(0, 220)}` : ""
      }`,
    );
  }
  const json = (await response.json()) as { voice_id?: string };
  if (!json.voice_id) throw new Error("ElevenLabs did not return a voice id");
  return json.voice_id;
}

export type CreateCloneResult = {
  voice: ClonedVoice;
  /** True when a real neural clone was registered upstream. */
  neural: boolean;
  warning?: string;
};

export async function createClonedVoice(
  input: CreateCloneInput,
): Promise<CreateCloneResult> {
  await ensureSchema();
  const name = (input.name || "My Voice").trim().slice(0, 60);
  const description = (input.description ?? "").trim().slice(0, 240) || null;
  const gender = input.gender ?? "neutral";
  const samples = (input.samples ?? []).filter((sample) => sample.data.length > 512);
  const status = voiceCloneStatus();

  if (status.neural && samples.length > 0) {
    const voiceId = await registerElevenLabsClone(name, description || name, samples);
    const inserted = await db
      .insert(clonedVoices)
      .values({
        name,
        provider: "elevenlabs",
        providerVoiceId: voiceId,
        gender,
        accent: "Cloned",
        description,
        sampleCount: samples.length,
      })
      .returning();
    return { voice: toClonedVoice(inserted[0]), neural: true };
  }

  // No cloning API (or no usable samples): persist a replayable voice preset.
  const preset = input.preset ?? {
    baseVoice: "ava",
    rate: 0,
    pitch: 0,
  };
  const inserted = await db
    .insert(clonedVoices)
    .values({
      name,
      provider: "custom",
      providerVoiceId: encodePreset(preset),
      gender,
      accent: getVoice(preset.baseVoice).accent,
      description:
        description ??
        `Preset based on ${getVoice(preset.baseVoice).name} · rate ${preset.rate}% · pitch ${preset.pitch}Hz`,
      sampleCount: samples.length,
    })
    .returning();

  return {
    voice: toClonedVoice(inserted[0]),
    neural: false,
    warning: status.neural
      ? "No usable audio was uploaded, so we saved a voice preset instead of a neural clone."
      : "No ELEVENLABS_API_KEY is configured — saved as a reusable voice preset. Add the key to enable real voice cloning.",
  };
}

export async function deleteClonedVoice(id: string): Promise<ClonedVoice | null> {
  await ensureSchema();
  const deleted = await db.delete(clonedVoices).where(eq(clonedVoices.id, id)).returning();
  if (deleted.length === 0) return null;

  // Best-effort upstream cleanup so the account does not leak cloned voices.
  const row = deleted[0];
  if (row.provider === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
    try {
      await fetch(
        `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(row.providerVoiceId)}`,
        {
          method: "DELETE",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY as string },
        },
      );
    } catch {
      // Non-fatal: the local record is already gone.
    }
  }
  return toClonedVoice(row);
}

/* ------------------------------------------------------------- resolution */

export type ResolvedVoice = {
  /** Neural / upstream identifier handed to the TTS engine. */
  neuralVoice: string;
  rate: number;
  pitch: number;
  /** Offline engine voice used by the built-in fallback. */
  engineVoice: string;
  label: string;
  cloned: boolean;
};

/**
 * Turns a project voice id (either a builtin persona like `ava`, or a
 * `clone:<uuid>` reference) into concrete synthesis parameters.
 */
export async function resolveVoiceSelection(
  voiceId: string | null | undefined,
  language = "en",
): Promise<ResolvedVoice> {
  const fallback = getVoice(voiceId ?? "ava");
  const base: ResolvedVoice = {
    neuralVoice: fallback.neuralVoice,
    rate: fallback.rate,
    pitch: fallback.pitch,
    engineVoice: fallback.engineVoice,
    label: fallback.name,
    cloned: false,
  };

  if (!isClonedVoiceId(voiceId)) {
    if (!language || language === "en") return base;
    return base;
  }

  const cloneId = clonedVoiceIdFrom(voiceId as string);
  const clone = await getClonedVoice(cloneId).catch(() => null);
  if (!clone) return base;

  if (clone.provider === "elevenlabs") {
    return {
      ...base,
      neuralVoice: clone.providerVoiceId,
      rate: 0,
      pitch: 0,
      label: clone.name,
      cloned: true,
    };
  }

  const preset = decodePreset(clone.providerVoiceId);
  if (!preset) return base;
  const persona = getVoice(preset.baseVoice);
  return {
    neuralVoice: persona.neuralVoice,
    rate: persona.rate + preset.rate,
    pitch: persona.pitch + preset.pitch,
    engineVoice: persona.engineVoice,
    label: clone.name,
    cloned: true,
  };
}
