import type { AspectRatio } from "@/lib/types";

export function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Outer machined frame gate */}
      <rect
        x="1.5"
        y="3.5"
        width="21"
        height="17"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Sprocket ticks */}
      <line x1="5.5" y1="3.5" x2="5.5" y2="20.5" stroke="currentColor" strokeWidth="1.25" />
      <line x1="18.5" y1="3.5" x2="18.5" y2="20.5" stroke="currentColor" strokeWidth="1.25" />
      {/* Diagonal splice cut in tungsten amber */}
      <path
        d="M9.25 16.5L14.75 7.5"
        stroke="#E5A93C"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
      <circle cx="3.5" cy="7.5" r="0.85" fill="currentColor" />
      <circle cx="3.5" cy="12" r="0.85" fill="currentColor" />
      <circle cx="3.5" cy="16.5" r="0.85" fill="currentColor" />
      <circle cx="20.5" cy="7.5" r="0.85" fill="currentColor" />
      <circle cx="20.5" cy="12" r="0.85" fill="currentColor" />
      <circle cx="20.5" cy="16.5" r="0.85" fill="currentColor" />
    </svg>
  );
}

export function AspectGlyph({
  aspect,
  className = "h-3.5 w-3.5",
}: {
  aspect: AspectRatio;
  className?: string;
}) {
  if (aspect === "9:16") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
        <rect
          x="4.25"
          y="1.75"
          width="7.5"
          height="12.5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.35"
        />
      </svg>
    );
  }
  if (aspect === "1:1") {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
        <rect
          x="2.75"
          y="2.75"
          width="10.5"
          height="10.5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.35"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect
        x="1.5"
        y="3.75"
        width="13"
        height="8.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.35"
      />
    </svg>
  );
}

export function AudioMeter({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`w-[2px] bg-amber-cue ${active ? "eq-bar h-3" : "h-1 opacity-40"}`}
        />
      ))}
    </span>
  );
}

export function formatSmpte(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * 30);
  return `00:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function estimateSceneSeconds(narration: string, minDuration?: number | null): number {
  const words = countWords(narration);
  const spoken = words > 0 ? words / 2.6 + 0.55 : 3.2;
  return Math.max(2.6, spoken, minDuration ?? 0);
}
