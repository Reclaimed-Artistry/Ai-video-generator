import type { AspectRatio } from "@/lib/types";

/**
 * Timing helpers live in `@/lib/timecode` — re-exported here so existing
 * imports keep resolving.
 */
export {
  countWords,
  estimateSceneSeconds,
  formatClock,
  formatDuration,
  formatSeconds,
  formatSmpte,
} from "@/lib/timecode";

type MarkProps = { className?: string };

/**
 * Studio mark — a violet "play + spark" glyph that reads as both a play button
 * and a generative spark, matching the indigo/violet product palette.
 */
export function BrandMark({ className = "h-6 w-6" }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ra-mark" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D4AFF" />
          <stop offset="0.5" stopColor="#A855F7" />
          <stop offset="1" stopColor="#F0568F" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#ra-mark)" />
      <path d="M13 10.4l9 5.6-9 5.6V10.4z" fill="#fff" />
      <path
        d="M22.4 7.2l.62 1.62 1.62.62-1.62.62-.62 1.62-.62-1.62-1.62-.62 1.62-.62.62-1.62z"
        fill="#fff"
        fillOpacity="0.92"
      />
    </svg>
  );
}

/** Small outline glyphs for the 16:9 / 9:16 / 1:1 frame gate selector. */
export function AspectGlyph({
  aspect,
  className = "h-3.5 w-3.5",
}: {
  aspect: AspectRatio;
  className?: string;
}) {
  const box =
    aspect === "16:9"
      ? { x: 1.5, y: 5, w: 21, h: 12 }
      : aspect === "9:16"
        ? { x: 7.5, y: 1.5, w: 9, h: 21 }
        : { x: 4, y: 4, w: 16, h: 16 };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** Animated equaliser used next to "recording / generating" states. */
export function AudioMeter({ active, className = "h-3 w-3" }: { active?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full bg-amber-cue ${active ? "eq-bar" : "opacity-40"}`}
          style={{ height: active ? "100%" : "40%" }}
        />
      ))}
    </span>
  );
}
