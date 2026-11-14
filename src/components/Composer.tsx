"use client";

import { ArrowRight, FileText, Loader2, Music, Play, Square, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AspectGlyph, AudioMeter } from "@/components/BrandMark";
import { saveLocalProject } from "@/lib/client-store";
import { MUSIC_TRACKS } from "@/lib/music";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  TONES,
  WORKFLOW_ORDER,
  WORKFLOWS,
  type AspectRatio,
  type CaptionMode,
  type MusicTrackId,
  type Resolution,
  type Tone,
  type Workflow,
} from "@/lib/types";
import { VOICES } from "@/lib/voices";

const SAMPLE_BRIEFS: {
  code: string;
  label: string;
  workflow: Workflow;
  prompt: string;
  aspect: AspectRatio;
  tone: Tone;
  duration: number;
}[] = [
  {
    code: "01",
    label: "Roastery promo",
    workflow: "commercial",
    prompt:
      "A 30 second launch commercial for a small-batch mountain coffee roastery sourcing single-origin beans",
    aspect: "16:9",
    tone: "cinematic",
    duration: 30,
  },
  {
    code: "02",
    label: "AI support explainer",
    workflow: "explainer",
    prompt:
      "How small engineering teams use AI triage agents to cut customer support wait times in half",
    aspect: "16:9",
    tone: "professional",
    duration: 30,
  },
  {
    code: "03",
    label: "Lisbon reel (9:16)",
    workflow: "shorts",
    prompt:
      "Punchy vertical reel for a neighborhood espresso bar opening at sunrise in Lisbon",
    aspect: "9:16",
    tone: "energetic",
    duration: 30,
  },
  {
    code: "04",
    label: "Paste own script",
    workflow: "script",
    prompt:
      "Every morning begins before the city wakes up, with warm light spilling across empty streets.\n\nInside the roastery, single-origin beans tumble in small batches until the aroma fills the room.\n\nSlow down for five minutes today and taste craft made without shortcuts.",
    aspect: "16:9",
    tone: "cinematic",
    duration: 30,
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

  const [workflow, setWorkflow] = useState<Workflow>("explainer");
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<Resolution>("360p");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [tone, setTone] = useState<Tone>("professional");
  const [voice, setVoice] = useState<string>("ava");
  const [musicTrack, setMusicTrack] = useState<MusicTrackId>("corporate");
  const [captionMode, setCaptionMode] = useState<CaptionMode>("word-highlight");
  const [duration, setDuration] = useState<number>(30);
  const [loadingMode, setLoadingMode] = useState<"render" | "draft" | null>(null);
  const [auditioning, setAuditioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleBrief(event: Event) {
      const detail = (
        event as CustomEvent<{ prompt?: string; aspect?: AspectRatio }>
      ).detail;
      if (!detail?.prompt) return;
      setWorkflow("commercial");
      setPrompt(detail.prompt);
      if (detail.aspect) setAspect(detail.aspect);
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => textareaRef.current?.focus(), 250);
    }
    window.addEventListener("reclaimed-artistry:use-brief", handleBrief);
    return () =>
      window.removeEventListener("reclaimed-artistry:use-brief", handleBrief);
  }, []);

  function selectWorkflow(next: Workflow) {
    const preset = WORKFLOWS[next];
    setWorkflow(next);
    setAspect(preset.defaultAspect);
    setDuration(preset.defaultDuration);
    setTone(preset.defaultTone);
    setCaptionMode(preset.defaultCaptionMode);
    setMusicTrack(preset.defaultMusic);
  }

  const raster = useMemo(() => computeRaster(resolution, aspect), [resolution, aspect]);
  const estimatedScenes = useMemo(() => {
    if (workflow === "script") {
      const blocks = prompt
        .trim()
        .split(/\n\s*\n+/)
        .filter(Boolean).length;
      return Math.max(1, blocks || 3);
    }
    const divisor = workflow === "shorts" ? 7 : workflow === "documentary" ? 11 : 9;
    return Math.max(3, Math.min(12, Math.round(duration / divisor)));
  }, [duration, workflow, prompt]);

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
          ? prompt.trim().slice(0, 180)
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

  async function createProject(autoRender: boolean) {
    if (!prompt.trim() || loadingMode) return;
    setLoadingMode(autoRender ? "render" : "draft");
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          workflow,
          resolution,
          aspect,
          tone,
          voice,
          musicTrack,
          captionMode,
          duration,
        }),
      });
      const raw = await response.text();
      let data: { project?: { id: string }; error?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        data = {};
      }
      if (!response.ok || !data.project?.id) {
        throw new Error(
          data.error ?? `Failed to draft sequence (HTTP ${response.status})`,
        );
      }

      saveLocalProject(data.project as import("@/lib/types").Project);
      const projectId: string = data.project.id;
      router.push(autoRender ? `/studio/${projectId}?autorun=1` : `/studio/${projectId}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not initialize sequence.",
      );
      setLoadingMode(null);
    }
  }

  return (
    <div className="console-surface rounded-[4px]">
      {/* Top Workflow Bar (InVideo AI style) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Video workflow">
          {WORKFLOW_ORDER.map((wf) => {
            const active = workflow === wf;
            return (
              <button
                key={wf}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectWorkflow(wf)}
                className={`rounded-[2px] px-2.5 py-1 font-tech text-[10px] uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? "bg-amber-cue font-semibold text-[#14110A]"
                    : "text-stone-ink hover:bg-elevated hover:text-paper"
                }`}
              >
                {WORKFLOWS[wf].shortLabel}
              </button>
            );
          })}
        </div>

        <div className="font-tech hidden items-center gap-2 text-[10px] text-stone-ink sm:flex">
          <span>{raster}px</span>
          <span className="text-line-strong">/</span>
          <span>~{estimatedScenes} cues</span>
          <span className="text-ash">· ⌘↵</span>
        </div>
      </div>

      {/* Prompt / Script input */}
      <div className="p-4 sm:p-5">
        <label
          htmlFor="sequence-brief"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-stone-ink"
        >
          <span>
            {workflow === "script"
              ? "Paste your script (separate scenes with a blank line)"
              : WORKFLOWS[workflow].description}
          </span>
          <span className="font-tech text-[11px] text-ash">
            {prompt.trim() ? `${prompt.trim().split(/\s+/).length} words` : "Ready"}
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
              void createProject(true);
            }
          }}
          rows={workflow === "script" ? 5 : 3}
          placeholder={
            workflow === "script"
              ? "Scene 1 narration paragraph...\n\nScene 2 narration paragraph...\n\nScene 3 call-to-action..."
              : "Describe the video you want — topic, audience, visual vibe, and call to action…"
          }
          className="w-full resize-none rounded-[3px] border border-line bg-canvas px-3.5 py-3 text-[15px] leading-relaxed text-paper outline-none transition-colors placeholder:text-ash focus:border-amber-cue"
        />

        {/* Sample preset strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line pb-3.5 text-xs">
          <span className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
            Try sample:
          </span>
          {SAMPLE_BRIEFS.map((sample) => (
            <button
              key={sample.code}
              type="button"
              onClick={() => {
                selectWorkflow(sample.workflow);
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

        {/* Row 1: Resolution + Frame Gate + Target Runtime */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Export Quality
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
                    disabled={workflow === "script"}
                    onClick={() => setDuration(sec)}
                    className={`flex flex-col items-center justify-center rounded-[2px] py-1.5 transition-colors disabled:opacity-40 ${
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

        {/* Row 2: Voice + Music + Subtitles + Tone */}
        <div className="mt-3 grid gap-2.5 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <span className="font-tech mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-ash">
              <span>Neural Voice (24kHz)</span>
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
                className="min-w-0 flex-1 rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-paper outline-none transition-colors focus:border-amber-cue"
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

          <label className="block sm:col-span-3">
            <span className="font-tech mb-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-ash">
              <Music className="h-2.5 w-2.5" />
              <span>Music Score</span>
            </span>
            <select
              value={musicTrack}
              onChange={(event) => setMusicTrack(event.target.value as MusicTrackId)}
              className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-paper outline-none transition-colors focus:border-amber-cue"
            >
              {MUSIC_TRACKS.map((track) => (
                <option key={track.id} value={track.id} className="bg-panel text-paper">
                  {track.name} ({track.mood})
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="font-tech mb-1 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Subtitles
            </span>
            <select
              value={captionMode}
              onChange={(event) => setCaptionMode(event.target.value as CaptionMode)}
              className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-paper outline-none transition-colors focus:border-amber-cue"
            >
              {CAPTION_MODES.map((mode) => (
                <option key={mode.id} value={mode.id} className="bg-panel text-paper">
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="font-tech mb-1 block text-[10px] uppercase tracking-[0.14em] text-ash">
              Tone
            </span>
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value as Tone)}
              className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium capitalize text-paper outline-none transition-colors focus:border-amber-cue"
            >
              {TONES.map((opt) => (
                <option key={opt} value={opt} className="bg-panel capitalize text-paper">
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Action row: Primary 1-Click Generate Video + Secondary Edit Script First */}
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void createProject(false)}
            disabled={Boolean(loadingMode) || !prompt.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-line bg-inset px-3.5 py-2.5 font-tech text-[11px] uppercase tracking-[0.08em] text-stone-ink transition-colors hover:border-line-strong hover:text-paper disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loadingMode === "draft" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-cue" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span>Draft Script First</span>
          </button>

          <button
            type="button"
            onClick={() => void createProject(true)}
            disabled={Boolean(loadingMode) || !prompt.trim()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-amber-cue px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:bg-elevated disabled:text-ash sm:flex-initial"
          >
            {loadingMode === "render" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Generating {resolution} Video…</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Generate {resolution} Video</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
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
