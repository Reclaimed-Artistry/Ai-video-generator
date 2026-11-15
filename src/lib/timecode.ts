/** Shared timing helpers used by the script desk, timeline and monitor. */

/** Natural narration pace, in words per second (~150 wpm). */
export const WORDS_PER_SECOND = 2.5;

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Estimated on-screen seconds for a scene: its spoken length at a natural
 * narration pace with a small breath pad, unless a manual duration is pinned.
 */
export function estimateSceneSeconds(
  narration: string | null | undefined,
  manualDuration?: number | null,
  wordsPerSecond: number = WORDS_PER_SECOND,
): number {
  if (typeof manualDuration === "number" && manualDuration > 0) return manualDuration;
  const words = countWords(narration);
  if (words === 0) return 3;
  return Math.max(2.4, words / wordsPerSecond + 0.45);
}

/** `75` → `1:15`. Used wherever a compact runtime is shown. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** `12.4` → `00:00:12:10` at 30fps. Broadcast-style timecode readout. */
export function formatSmpte(seconds: number, fps = 30): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const frames = Math.floor((total % 1) * fps);
  return [hours, minutes, secs, frames]
    .map((value, index) => (index === 3 ? String(value).padStart(2, "0") : String(value).padStart(2, "0")))
    .join(":");
}

/** `12.4` → `12.4s`. Compact, used for scene chips. */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return formatClock(seconds);
}
