"use client";

import { ArrowUpRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatSmpte } from "@/components/BrandMark";
import { resolveMediaUrl } from "@/lib/media-url";
import type { Project, StockAsset } from "@/lib/types";

export default function ReferenceMonitor({
  renderedProjects,
  fallbackClip,
}: {
  renderedProjects: Project[];
  fallbackClip: StockAsset | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const activeProject = renderedProjects[selectedIndex] ?? null;

  const videoSrc = activeProject
    ? resolveMediaUrl(
        activeProject.outputPath,
        `renders/${activeProject.id}/output.mp4`,
      ) ?? ""
    : fallbackClip?.sources[0]?.url ?? "";

  const posterSrc = activeProject?.posterPath
    ? resolveMediaUrl(
        activeProject.posterPath,
        `renders/${activeProject.id}/poster.jpg`,
      ) ?? undefined
    : fallbackClip?.thumb ?? undefined;

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (el.paused) {
      void el.play();
      setPlaying(true);
    }
  }

  function switchProject(index: number) {
    setSelectedIndex(index);
    setCurrentTime(0);
    setPlaying(true);
  }

  return (
    <aside className="console-surface flex flex-col justify-between rounded-[4px]">
      {/* Monitor top bezel */}
      <div>
        <div className="flex items-center justify-between border-b border-line bg-inset px-3.5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-nominal" />
            <span className="font-tech text-[10px] font-medium uppercase tracking-[0.14em] text-stone-ink">
              {activeProject ? "Master Out // H.264" : "Reference Reel // Pexels"}
            </span>
          </div>
          <span className="timecode text-[11px] text-amber-cue">
            {formatSmpte(currentTime)}
          </span>
        </div>

        {/* Video gate */}
        <div className="relative aspect-video w-full overflow-hidden bg-[#050504]">
          {videoSrc ? (
            <video
              key={videoSrc}
              ref={videoRef}
              src={videoSrc}
              poster={posterSrc}
              autoPlay
              loop
              muted={muted}
              playsInline
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) =>
                setTotalDuration(event.currentTarget.duration || 0)
              }
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center font-tech text-xs text-ash">
              NO SIGNAL
            </div>
          )}

          {/* Subtle corner frame-gate reticles */}
          <div className="pointer-events-none absolute inset-3">
            <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-white/25" />
            <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-white/25" />
            <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-white/25" />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-white/25" />
          </div>

          {/* Transport overlay bar */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause monitor" : "Play monitor"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/15 bg-black/70 text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border border-white/15 bg-black/70 px-2 font-tech text-[10px] uppercase tracking-wider text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
              >
                {muted ? (
                  <>
                    <VolumeX className="h-3 w-3 text-stone-ink" />
                    <span>Unmute VO</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3 w-3 text-amber-cue" />
                    <span className="text-amber-cue">-16 LUFS</span>
                  </>
                )}
              </button>
            </div>

            {activeProject ? (
              <span className="rounded-[2px] border border-white/15 bg-black/70 px-2 py-0.5 font-tech text-[10px] uppercase tracking-wider text-stone-ink">
                {activeProject.resolution} · {activeProject.aspect}
              </span>
            ) : null}
          </div>
        </div>

        {/* Scrubber hairline */}
        <div className="h-[2px] w-full bg-line">
          <div
            className="h-full bg-amber-cue transition-[width] duration-150"
            style={{
              width:
                totalDuration > 0
                  ? `${Math.min(100, (currentTime / totalDuration) * 100)}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      {/* Sequence switcher + cue log */}
      <div className="flex flex-1 flex-col justify-between p-4">
        {activeProject ? (
          <>
            <div>
              {renderedProjects.length > 1 ? (
                <div className="mb-3 flex items-center gap-1 border-b border-line pb-2.5">
                  <span className="font-tech mr-1 text-[10px] uppercase tracking-[0.12em] text-ash">
                    Reel:
                  </span>
                  {renderedProjects.slice(0, 3).map((proj, idx) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => switchProject(idx)}
                      className={`rounded-[2px] px-2 py-0.5 font-tech text-[10px] transition-colors ${
                        idx === selectedIndex
                          ? "bg-elevated text-amber-cue shadow-[inset_0_0_0_1px_#3a3832]"
                          : "text-stone-ink hover:text-paper"
                      }`}
                    >
                      0{idx + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold leading-snug text-paper">
                    {activeProject.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-stone-ink">
                    Brief: “{activeProject.prompt}”
                  </p>
                </div>
              </div>

              <div className="mt-3 divide-y divide-line border-y border-line">
                {activeProject.script.scenes.slice(0, 3).map((scene, idx) => (
                  <div
                    key={scene.id}
                    className="grid grid-cols-[44px_1fr_auto] items-baseline gap-2 py-2 text-xs"
                  >
                    <span className="font-tech text-[10px] text-amber-cue">
                      SC 0{idx + 1}
                    </span>
                    <p className="truncate text-stone-ink">{scene.narration}</p>
                    <span className="font-tech text-[10px] text-ash">
                      {scene.mediaId ?? "clip"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-3 pt-1">
              <span className="font-tech text-[10px] uppercase tracking-[0.12em] text-ash">
                Voice: {activeProject.voice.toUpperCase()} · {activeProject.script.scenes.length} cues
              </span>
              <Link
                href={`/studio/${activeProject.id}`}
                className="inline-flex items-center gap-1 font-tech text-[11px] font-medium text-paper underline decoration-amber-cue underline-offset-4 transition-colors hover:text-amber-cue"
              >
                <span>Open in Studio</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <div className="space-y-2 text-xs text-stone-ink">
            <p className="font-medium text-paper">
              {fallbackClip?.title ?? "Verified Pexels Video Feed"}
            </p>
            <p>
              Draft a sequence on the left to cut B-roll, synthesize 24kHz voiceover,
              and mux an H.264 master on the server.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
