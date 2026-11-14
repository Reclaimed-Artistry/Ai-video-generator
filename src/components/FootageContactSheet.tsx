"use client";

import { ArrowUpRight, Film } from "lucide-react";
import { useMemo, useState } from "react";
import { formatClock } from "@/components/BrandMark";
import type { AspectRatio, StockAsset } from "@/lib/types";

const SUBJECT_FILTERS: { id: string; label: string; match: string[] }[] = [
  { id: "all", label: "All Rolls", match: [] },
  { id: "city", label: "Urban & Rail", match: ["city", "skyline", "train", "railway", "urban"] },
  { id: "tech", label: "Data & Network", match: ["technology", "network", "data", "digital", "molecule"] },
  { id: "coffee", label: "Coffee & Kitchen", match: ["coffee", "cafe", "food", "barista", "cooking"] },
  { id: "ocean", label: "Ocean & Aerial", match: ["ocean", "waves", "beach", "sea"] },
  { id: "fitness", label: "Training", match: ["fitness", "gym", "running", "treadmill"] },
  { id: "travel", label: "Flight & Coast", match: ["travel", "airplane", "flight", "istanbul"] },
];

function previewSourceUrl(asset: StockAsset): string | null {
  if (!asset.sources.length) return null;
  const sorted = [...asset.sources].sort(
    (a, b) => (a.height ?? 540) - (b.height ?? 540),
  );
  const mid = sorted.find((s) => (s.height ?? 540) >= 360) ?? sorted[0];
  return mid?.url ?? null;
}

function highestRaster(asset: StockAsset): string {
  if (!asset.sources.length) return "HD";
  const top = [...asset.sources].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0),
  )[0];
  if ((top.height ?? 0) >= 2160 || top.width >= 3840) return "4K UHD";
  if ((top.height ?? 0) >= 1080 || top.width >= 1920) return "1080p";
  return `${top.width}w`;
}

export default function FootageContactSheet({
  clips,
}: {
  clips: StockAsset[];
}) {
  const [filter, setFilter] = useState("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const active = SUBJECT_FILTERS.find((item) => item.id === filter);
    if (!active || active.match.length === 0) return clips.slice(0, 12);
    return clips
      .filter((clip) =>
        clip.tags.some((tag) => active.match.includes(tag.toLowerCase())),
      )
      .slice(0, 12);
  }, [clips, filter]);

  function loadClipBrief(clip: StockAsset) {
    const aspect: AspectRatio = clip.portrait ? "9:16" : "16:9";
    const subject = clip.tags.slice(0, 3).join(", ");
    const prompt = `A 30 second editorial video featuring ${clip.title.toLowerCase()} (${subject})`;
    window.dispatchEvent(
      new CustomEvent("cutline:use-brief", { detail: { prompt, aspect } }),
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1">
          {SUBJECT_FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-[2px] px-2.5 py-1 font-tech text-[11px] uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? "bg-amber-cue text-[#14110A] font-semibold"
                    : "border border-transparent text-stone-ink hover:border-line hover:text-paper"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="font-tech text-[11px] text-ash">
          Hover any frame to roll video · 100% moving footage
        </span>
      </div>

      {/* Contact sheet grid */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((clip, index) => {
          const hovered = hoveredId === clip.id;
          const previewUrl = previewSourceUrl(clip);
          return (
            <article
              key={clip.id}
              onMouseEnter={() => setHoveredId(clip.id)}
              onMouseLeave={() => setHoveredId((current) => (current === clip.id ? null : current))}
              className="group console-surface flex flex-col justify-between overflow-hidden rounded-[3px] transition-colors hover:border-line-strong"
            >
              <div>
                {/* Sprocket frame header */}
                <div className="flex items-center justify-between border-b border-line bg-inset px-2.5 py-1.5 font-tech text-[10px] text-ash">
                  <span>
                    ROLL {String(index + 1).padStart(2, "0")} // {clip.id.toUpperCase()}
                  </span>
                  <span className="text-stone-ink">
                    {highestRaster(clip)} · {clip.portrait ? "9:16" : "16:9"}
                  </span>
                </div>

                {/* Video frame */}
                <div className="relative aspect-video w-full overflow-hidden bg-[#060605]">
                  {hovered && previewUrl ? (
                    <video
                      src={previewUrl}
                      poster={clip.thumb}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clip.thumb}
                      alt={clip.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  )}
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-[2px] border border-white/15 bg-black/80 px-1.5 py-0.5 font-tech text-[10px] text-paper">
                    <Film className="h-2.5 w-2.5 text-amber-cue" />
                    {formatClock(clip.duration ?? 10)}
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-[2px] bg-black/80 px-1.5 py-0.5 font-tech text-[9px] uppercase tracking-wider text-stone-ink">
                    {clip.provider}
                  </span>
                </div>

                <div className="p-3">
                  <h3 className="line-clamp-1 text-xs font-medium text-paper">
                    {clip.title}
                  </h3>
                  <p className="mt-0.5 font-tech text-[10px] text-ash">
                    Cam: {clip.creator} · {clip.sources.length} renditions
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line bg-inset/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => loadClipBrief(clip)}
                  className="font-tech text-[10px] font-medium uppercase tracking-[0.1em] text-amber-cue transition-colors hover:text-amber-hover"
                >
                  Draft with clip →
                </button>
                <a
                  href={clip.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Source on Pexels: ${clip.title}`}
                  className="inline-flex items-center gap-0.5 font-tech text-[10px] text-ash transition-colors hover:text-paper"
                >
                  <span>Source</span>
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
