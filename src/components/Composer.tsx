"use client";

import { ArrowRight, Loader2, Play, Square, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AspectGlyph, AudioMeter } from "@/components/BrandMark";
import {
  ASPECT_ORDER,
  ASPECTS,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  TONES,
  type AspectRatio,
  type Resolution,
  type Tone,
} from "@/lib/types";
import { VOICES } from "@/lib/voices";

const SAMPLE_BRIEFS: { code: string; label: string; prompt: string; aspect: AspectRatio; tone: Tone; duration: number }[] = [
  {
    code: "01",
    label: "Roastery launch",
    prompt: "A 30 second launch film for a small-batch mountain coffee roastery sourcing single-origin beans",
    aspect: "16:9",
    tone: "cinematic",
    duration: 30,
  },
  {
    code: "02",
    label: "Product teardown",
    prompt: "How small engineering teams use AI triage agents to cut support ticket backlog in half",
    aspect: "16:9",
    tone: "professional",
    duration: 45,
  },
  {
    code: "03",
    label: "Vertical social cut",
    prompt: "A punchy vertical reel for a neighborhood espresso bar opening at sunrise in Lisbon",
    aspect: "9:16",
    tone: "energetic",
    duration: 30,
  },
  {
    code: "04",
    label: "Editorial essay",
    prompt: "Why urban rail corridors are transforming downtown architecture and daily commutes",
    aspect: "16:9",
    tone: "minimal",
    duration: 45,
  },
];

function computeRaster(resolution: Resolution, aspect: AspectRatio): string {
  const base = RESOLUTIONS[resolution];
  const ratio = ASPECTS[aspect].ratio;
  const short = Math.min(base.width, base.height);
  let width = short;
  let height = short;
  if (ratio >= 1) {
    height = short;
    width = Math.round((short * ratio) / 2) * 2;
  } else {
    width = short;
    height = Math.round(short / ratio / 2) * 2;
  }
  return `${width}×${height}`;
}

export default function Composer() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [tone, setTone] = useState<Tone>("cinematic");
  const [voice, setVoice] = useState<string>("ava");
  const [duration, setDuration] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [auditioning, setAuditioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleBrief(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: string; aspect?: AspectRatio }>).detail;
      if (!detail?.prompt) return;
      setPrompt(detail.prompt);
      if (detail.aspect) setAspect(detail.aspect);
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => textareaRef.current?.focus(), 250);
    }
    window.addEventListener("reclaimed-artistry:use-brief", handleBrief);
    return () => window.removeEventListener("reclaimed-artistry:use-brief", handleBrief);
  }, []);

  const raster = useMemo(() => computeRaster(resolution, aspect), [resolution, aspect]);
  const estimatedScenes = useMemo(
    () => Math.max(3, Math.min(12, Math.round(duration / 9))),
    [duration],
  );
  const selectedVoice = useMemo(
    () => VOICES.find((item) => item.id === voice) ?? VOICES[0],
    [voice],
  );

  async function toggleAudition() {
    if (auditioning && audioRef.current) {
      audioRef.current.pause();
      setAuditioning(false);
      return;
    }
    try {
      setAuditioning(true);
      const sampleText =
        prompt.trim().length > 16
          ? prompt.trim().slice(0, 200)
          : selectedVoice.previewText;
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoice.id, text: sampleText }),
      });
      if (!response.ok) throw new Error("Voice preview unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => setAuditioning(false);
      audioRef.current.onerror = () => setAuditioning(false);
      await audioRef.current.play();
    } catch {
      setAuditioning(false);
    }
  }

  async function submitBrief() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          resolution,
          aspect,
          tone,
          voice,
          duration,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to draft sequence");
      router.push(`/studio/${data.project.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not initialize sequence.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="console-surface rounded-[4px]">
      {/* Top slate bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-amber-cue" />
          <span className="font-tech text-[11px] font-medium uppercase tracking-[0.14em] text-paper">
            Sequence Slate
          </span>
        </div>
        <div className="font-tech flex flex-wrap items-center gap-3 text-[11px] text-stone-ink">
          <span>{raster}px</span>
          <span className="text-line-strong">/</span>
          <span>30.00 fps</span>
          <span className="text-line-strong">/</span>
          <span>~{estimatedScenes} cues</span>
          <span className="hidden text-ash sm:inline">· ⌘↵ to draft</span>
        </div>
      </div>

      {/* Prompt brief input */}
      <div className="p-4 sm:p-5">
        <label
          htmlFor="sequence-brief"
          className="mb-2 flex items-center justify-between text-xs font-medium text-stone-ink"
        >
          <span>Production brief or rough script notes</span>
          <span className="font-tech text-[11px] text-ash">
            {prompt.trim() ? `${prompt.trim().split(/\s+/).length} words` : "Plain English"}
          </span>
        </label>
        <textarea
          id="sequence-brief"
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submitBrief();
            }
          }}
          rows={3}
          placeholder="Describe what the cut needs to say, who it is for, and the visual mood — e.g. '30-second product reel introducing our field recorder, shot on moody urban transit and studio close-ups'…"
          className="w-full resize-none rounded-[3px] border border-line bg-canvas px-3.5 py-3 text-[15px] leading-relaxed text-paper outline-none transition-colors placeholder:text-ash focus:border-amber-cue"
        />

        {/* Sample preset log strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line pb-3.5 text-xs">
          <span className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
            Load sample:
          </span>
          {SAMPLE_BRIEFS.map((sample) => (
            <button
              key={sample.code}
              type="button"
              onClick={() => {
                setPrompt(sample.prompt);
                setAspect(sample.aspect);
                setTone(sample.tone);
                setDuration(sample.duration);
              }}
              className="group inline-flex items-center gap-1.5 text-left text-stone-ink transition-colors hover:text-paper"
            >
              <span className="font-tech text-[10px] text-amber-cue/80 group-hover:text-amber-cue">
                [{sample.code}]
              </span>
              <span className="underline decoration-line-strong underline-offset-4 group-hover:decoration-amber-cue">
                {sample.label}
              </span>
            </button>
          ))}
        </div>

        {/* Tactile hardware spec controls */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Deliverable resolution */}
          <div className="lg:col-span-4">
            <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Master Raster
            </span>
            <div className="grid grid-cols-3 rounded-[3px] border border-line bg-canvas p-0.5">
              {RESOLUTION_ORDER.map((opt) => {
                const active = resolution === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setResolution(opt)}
                    className={`rounded-[2px] px-2 py-1.5 text-center transition-colors ${
                      active
                        ? "bg-elevated text-paper shadow-[inset_0_0_0_1px_#3a3832]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    <span className="font-tech block text-xs font-medium">{opt}</span>
                    <span className="block text-[10px] text-ash">
                      {RESOLUTIONS[opt].role}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aspect Gate */}
          <div className="lg:col-span-4">
            <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Frame Gate
            </span>
            <div className="grid grid-cols-3 rounded-[3px] border border-line bg-canvas p-0.5">
              {ASPECT_ORDER.map((opt) => {
                const active = aspect === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAspect(opt)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-[2px] px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-elevated text-paper shadow-[inset_0_0_0_1px_#3a3832]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1 font-tech text-xs font-medium">
                      <AspectGlyph aspect={opt} className="h-3 w-3" />
                      {opt}
                    </span>
                    <span className="text-[10px] text-ash">
                      {opt === "16:9" ? "Wide" : opt === "9:16" ? "Vertical" : "Square"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Runtime */}
          <div className="lg:col-span-4">
            <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Target Runtime
            </span>
            <div className="grid grid-cols-5 rounded-[3px] border border-line bg-canvas p-0.5">
              {[15, 30, 45, 60, 90].map((sec) => {
                const active = duration === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDuration(sec)}
                    className={`flex flex-col items-center justify-center rounded-[2px] py-1.5 transition-colors ${
                      active
                        ? "bg-elevated text-paper shadow-[inset_0_0_0_1px_#3a3832]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    <span className="font-tech text-xs font-medium">{sec}s</span>
                    <span className="text-[10px] text-ash">
                      {Math.max(3, Math.round(sec / 9))}sc
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Voice booth + Editorial Tone + Submit row */}
        <div className="mt-3 grid gap-3 border-t border-line pt-3.5 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-5">
            <span className="font-tech mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-ash">
              <span>Neural Narrator (24kHz)</span>
              <span>{selectedVoice.accent}</span>
            </span>
            <div className="flex items-stretch gap-1.5">
              <select
                aria-label="Narrator voice"
                value={voice}
                onChange={(event) => {
                  if (auditioning && audioRef.current) {
                    audioRef.current.pause();
                    setAuditioning(false);
                  }
                  setVoice(event.target.value);
                }}
                className="min-w-0 flex-1 rounded-[3px] border border-line bg-canvas px-3 py-2 text-xs font-medium text-paper outline-none transition-colors focus:border-amber-cue"
              >
                {VOICES.map((item) => (
                  <option key={item.id} value={item.id} className="bg-panel text-paper">
                    {item.name} — {item.style} ({item.accent})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void toggleAudition()}
                title="Audition narrator voice"
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-2 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
              >
                {auditioning ? (
                  <>
                    <AudioMeter active />
                    <Square className="h-3 w-3 fill-current text-amber-cue" />
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-amber-cue" />
                    <span>Test</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="sm:col-span-3">
            <label className="block">
              <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                Editorial Pace
              </span>
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
                className="w-full rounded-[3px] border border-line bg-canvas px-3 py-2 text-xs font-medium capitalize text-paper outline-none transition-colors focus:border-amber-cue"
              >
                {TONES.map((opt) => (
                  <option key={opt} value={opt} className="bg-panel capitalize text-paper">
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="sm:col-span-4">
            <button
              type="button"
              onClick={() => void submitBrief()}
              disabled={loading || !prompt.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[3px] bg-amber-cue px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:bg-elevated disabled:text-ash"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Building Rundown…</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  <span>Draft Cut in Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-[3px] border border-tally/50 bg-tally/10 px-3 py-2 font-tech text-xs text-[#f4b4a8]">
            ERR // {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
