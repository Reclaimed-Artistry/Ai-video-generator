import fs from "node:fs";
import path from "node:path";
import type { MusicChoice, Tone } from "./types";

export type MusicTrack = {
  id: Exclude<MusicChoice, "auto" | "none">;
  label: string;
  mood: string;
  title: string;
  artist: string;
  license: string;
  sourceUrl: string;
  file: string;
};

/**
 * Background music bundled with the app (all CC0 / public domain, from
 * Wikimedia Commons), so renders never depend on an external music service.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "energetic",
    label: "Upbeat electronic",
    mood: "Energetic, driving",
    title: "Dance of the electronic fairies",
    artist: "Monplaisir",
    license: "CC0 1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Monplaisir_-_03_-_Dance_of_the_electronic_fairies.ogg",
    file: "energetic.mp3",
  },
  {
    id: "friendly",
    label: "Chill beat",
    mood: "Warm, relaxed",
    title: "Chill Beat",
    artist: "Wikimedia Commons contributor",
    license: "CC0 1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Chill_Beat.ogg",
    file: "friendly.mp3",
  },
  {
    id: "professional",
    label: "Soft ambient",
    mood: "Neutral, corporate",
    title: "Ambient music test, Yamaha CK61",
    artist: "Wilfredo Rafael Rodriguez Hernandez",
    license: "CC0 1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ambient_music_test,_Yamaha_CK61.flac",
    file: "professional.mp3",
  },
  {
    id: "cinematic",
    label: "Orchestral",
    mood: "Grand, cinematic",
    title: "Music for the Royal Fireworks, HWV 351 – I. Overture (Handel)",
    artist: "Paul Ayres",
    license: "CC0 1.0",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Paul_Ayres_-_Handel%27s_Music_for_the_Royal_Fireworks,_HWV_351_-_I._Overture.ogg",
    file: "cinematic.mp3",
  },
  {
    id: "minimal",
    label: "Lo-fi",
    mood: "Calm, minimal",
    title: "Lofi music 001",
    artist: "Luisalvaz",
    license: "CC0 1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Lofi_music_001.wav",
    file: "minimal.mp3",
  },
];

const TONE_TO_TRACK: Record<Tone, MusicTrack["id"]> = {
  energetic: "energetic",
  friendly: "friendly",
  professional: "professional",
  cinematic: "cinematic",
  minimal: "minimal",
};

export function resolveMusicTrack(choice: MusicChoice, tone: Tone): MusicTrack | null {
  if (choice === "none") return null;
  const id = choice === "auto" ? TONE_TO_TRACK[tone] ?? "friendly" : choice;
  return MUSIC_TRACKS.find((track) => track.id === id) ?? null;
}

export function getMusicDir(): string | null {
  const candidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), "src", "assets", "music"),
    "/var/task/src/assets/music",
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ dir)) return dir;
    } catch {
      // keep probing
    }
  }
  return null;
}

export function musicFilePath(track: MusicTrack): string | null {
  const dir = getMusicDir();
  if (!dir) return null;
  const file = path.join(dir, track.file);
  return fs.existsSync(/* turbopackIgnore: true */ file) ? file : null;
}
