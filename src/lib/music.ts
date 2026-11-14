import type { MusicTrackId, Tone } from "./types";

export type MusicTrack = {
  id: MusicTrackId;
  name: string;
  mood: string;
  bpm: string;
  description: string;
  url: string | null;
  source: string;
};

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "uplifting",
    name: "Driving Ambition",
    mood: "Upbeat / Momentum",
    bpm: "118 BPM",
    description: "Forward-moving electronic pulse for promos, reels, and launches.",
    url: "https://assets.mixkit.co/music/32/32.mp3",
    source: "Mixkit",
  },
  {
    id: "cinematic",
    name: "Silent Descent",
    mood: "Cinematic / Dramatic",
    bpm: "86 BPM",
    description: "Deep atmospheric strings and sub-bass for storytelling and trailers.",
    url: "https://assets.mixkit.co/music/614/614.mp3",
    source: "Mixkit",
  },
  {
    id: "ambient",
    name: "Vastness",
    mood: "Ambient / Minimal",
    bpm: "74 BPM",
    description: "Warm, airy ambient pad that sits cleanly underneath voiceover.",
    url: "https://assets.mixkit.co/music/184/184.mp3",
    source: "Mixkit",
  },
  {
    id: "warm",
    name: "Tears of Joy",
    mood: "Warm / Friendly",
    bpm: "96 BPM",
    description: "Acoustic piano and soft underscore for lifestyle and human stories.",
    url: "https://assets.mixkit.co/music/839/839.mp3",
    source: "Mixkit",
  },
  {
    id: "corporate",
    name: "Deep Urban",
    mood: "Corporate / Tech",
    bpm: "104 BPM",
    description: "Clean modern groove tailored for explainers and B2B walkthroughs.",
    url: "https://assets.mixkit.co/music/623/623.mp3",
    source: "Mixkit",
  },
  {
    id: "none",
    name: "No Music",
    mood: "Dry Voiceover",
    bpm: "—",
    description: "Voiceover only, no background score.",
    url: null,
    source: "—",
  },
];

export function getMusicTrack(id?: MusicTrackId | string | null): MusicTrack {
  return (
    MUSIC_TRACKS.find((track) => track.id === id) ?? MUSIC_TRACKS[0]
  );
}

export function defaultMusicForTone(tone: Tone): MusicTrackId {
  switch (tone) {
    case "energetic":
      return "uplifting";
    case "cinematic":
      return "cinematic";
    case "friendly":
      return "warm";
    case "minimal":
      return "ambient";
    case "professional":
    default:
      return "corporate";
  }
}
