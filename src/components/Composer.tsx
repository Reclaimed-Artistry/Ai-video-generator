"use client";

import {
  ArrowRight,
  AudioLines,
  Captions,
  Clock,
  FileText,
  LayoutTemplate,
  Music4,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AspectGlyph } from "@/components/BrandMark";
import TemplateGallery from "@/components/TemplateGallery";
import { Notice, Segmented } from "@/components/ui";
import { readJson, responseError } from "@/lib/http";
import { MUSIC_TRACKS } from "@/lib/music";
import { formatClock } from "@/lib/timecode";
import type { VideoTemplate } from "@/lib/templates";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  LANGUAGES,
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
import { DEFAULT_VOICE_ID, VOICES, type Voice } from "@/lib/voices";

type ClonedVoiceOption = {
  id: string;
  name: string;
  voiceId: string;
  accent: string;
  provider: string;
};

type VoiceCatalog = {
  voices: typeof VOICES;
  clonedVoices: ClonedVoiceOption[];
  provider: string;
};

const EXAMPLE_PROMPTS = [
  "A 30 second launch ad for a smart home air purifier — hook, product reveal, three benefits, call to action",
  "Explain how remote teams cut meeting time in half with async standups",
  "A punchy vertical reel revealing three coffee mistakes almost everyone makes",
  "A short documentary about how coral reefs are being regrown in Indonesia",
];

export default function Composer() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [tab, setTab] = useState<"prompt" | "templates">("prompt");
  const [workflow, setWorkflow] = useState<Workflow>("explainer");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [duration, setDuration] = useState(30);
  const [tone, setTone] = useState<Tone>("professional");
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE_ID);
  const [language, setLanguage] = useState("en");
  const [musicTrack, setMusicTrack] = useState<MusicTrackId>("corporate");
  const [captionMode, setCaptionMode] = useState<CaptionMode>("word-highlight");

  const [template, setTemplate] = useState<VideoTemplate | null>(null);
  const [loading, setLoading] = useState<null | "generate" | "draft">(null);
  const [error, setError] = useState<string | null>(null);
  const [auditioning, setAuditioning] = useState(false);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then((response) =>
        response.ok
          ? readJson<{ voices?: Voice[]; clonedVoices?: ClonedVoiceOption[]; provider?: string }>(
            response,
          )
          : Promise.resolve(null),
      )
      .then((data) => {
        if (!cancelled && data) {
          setCatalog({
            voices: data.voices ?? VOICES,
            clonedVoices: data.clonedVoices ?? [],
            provider: data.provider ?? "edge",
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const allVoices = useMemo(() => {
    const builtin = (catalog?.voices ?? VOICES).map((item) => ({
      id: item.id,
      name: item.name,
      accent: item.accent,
      style: item.style,
      group: "AI presenters",
    }));
    const cloned = (catalog?.clonedVoices ?? []).map((item) => ({
      id: item.voiceId,
      name: item.name,
      accent: item.provider === "elevenlabs" ? "Cloned voice" : "Preset",
      style: item.accent,
      group: "My voices",
    }));
    return [...cloned, ...builtin];
  }, [catalog]);

  const selectedVoice = useMemo(
    () => allVoices.find((item) => item.id === voice) ?? allVoices[0],
    [allVoices, voice],
  );

  const estimatedScenes = useMemo(() => {
    if (workflow === "script") {
      const blocks = prompt.trim().split(/\n\s*\n+/).filter(Boolean).length;
      return Math.max(1, blocks || 3);
    }
    const divisor = workflow === "shorts" ? 7 : workflow === "documentary" ? 11 : 9;
    return Math.max(3, Math.min(12, Math.round(duration / divisor)));
  }, [duration, workflow, prompt]);

  function applyTemplate(next: VideoTemplate) {
    setTemplate(next);
    setWorkflow(next.workflow);
    setPrompt(next.prompt);
    setAspect(next.aspect);
    setTone(next.tone);
    setDuration(next.duration);
    setVoice(next.voice);
    setMusicTrack(next.musicTrack);
    setCaptionMode(next.captionMode);
    setTab("prompt");
    setError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    });
  }

  function selectWorkflow(next: Workflow) {
    const preset = WORKFLOWS[next];
    setWorkflow(next);
    setAspect(preset.defaultAspect);
    setDuration(preset.defaultDuration);
    setTone(preset.defaultTone);
    setCaptionMode(preset.defaultCaptionMode);
    setMusicTrack(preset.defaultMusic);
    setTemplate(null);
  }

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
          : "Hi, I am your AI presenter. Give me a script and I will turn it into a finished video.";
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoice?.id, text: sampleText, language }),
      });
      if (!response.ok) throw new Error("Preview unavailable");
      const blob = await response.blob();
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.onended = () => setAuditioning(false);
      audioRef.current.onerror = () => setAuditioning(false);
      await audioRef.current.play();
    } catch {
      setAuditioning(false);
    }
  }

  async function create(autoRender: boolean) {
    if (!prompt.trim() || loading) return;
    setLoading(autoRender ? "generate" : "draft");
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
          language,
          musicTrack,
          captionMode,
          duration,
        }),
      });
      const data = await readJson<{ project?: { id: string }; error?: string }>(response);
      if (!response.ok) throw new Error(responseError(data, response, "Could not start your video"));

      const projectId = data?.project?.id;
      if (!projectId) throw new Error("The server did not return a project.");
      if (autoRender) {
        // FFmpeg encode runs after the HTTP 202, so we can navigate immediately.
        await fetch(`/api/projects/${projectId}/render`, { method: "POST" }).catch(
          () => undefined,
        );
      }
      router.push(`/studio/${projectId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start your video.");
      setLoading(null);
    }
  }

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;

  return (
    <div className="card overflow-hidden shadow-soft">
      {/* Workflow / mode bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset px-3 py-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "prompt"}
            onClick={() => setTab("prompt")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === "prompt"
                ? "bg-panel text-paper shadow-soft"
                : "text-stone-ink hover:text-paper"
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Prompt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "templates"}
            onClick={() => setTab("templates")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === "templates"
                ? "bg-panel text-paper shadow-soft"
                : "text-stone-ink hover:text-paper"
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Templates
            <span className="rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-amber-hover">
              NEW
            </span>
          </button>
        </div>

        {tab === "prompt" ? (
          <div className="flex items-center gap-2 text-[11px] text-ash">
            <span className="hidden sm:inline">{estimatedScenes} scenes</span>
            <span className="text-line-strong">·</span>
            <button
              type="button"
              onClick={() => setTab("templates")}
              className="font-semibold text-amber-cue hover:text-amber-hover"
            >
              Start from a template
            </button>
          </div>
        ) : null}
      </div>

      {tab === "templates" ? (
        <div className="p-4 sm:p-5">
          <TemplateGallery onPick={applyTemplate} />
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          {/* Workflow chips */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {WORKFLOW_ORDER.map((option) => {
              const active = workflow === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectWorkflow(option)}
                  title={WORKFLOWS[option].description}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "border-transparent bg-amber-cue text-white"
                      : "border-line-strong bg-panel text-stone-ink hover:border-brand-ring hover:text-paper"
                  }`}
                >
                  {WORKFLOWS[option].shortLabel}
                </button>
              );
            })}
          </div>

          {template ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-brand-ring bg-brand-soft px-3 py-2">
              <span className="truncate text-xs text-amber-hover">
                <span className="font-semibold">Template:</span> {template.name}
              </span>
              <button
                type="button"
                onClick={() => setTemplate(null)}
                className="shrink-0 text-[11px] font-semibold text-amber-hover/80 underline hover:text-amber-hover"
              >
                Clear
              </button>
            </div>
          ) : null}

          {/* The prompt box */}
          <label htmlFor="sequence-brief" className="sr-only">
            Describe the video you want
          </label>
          <textarea
            id="sequence-brief"
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void create(true);
              }
            }}
            rows={workflow === "script" ? 5 : 4}
            placeholder={
              workflow === "script"
                ? "Paste your script — separate each scene with a blank line…"
                : "Describe the video you want — topic, audience, visual style, and what viewers should do next…"
            }
            className="field min-h-[104px] resize-y text-sm leading-relaxed"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {!prompt.trim()
                ? EXAMPLE_PROMPTS.slice(0, 2).map((example) => (
                    <button
                      key={example.slice(0, 24)}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="max-w-[260px] truncate rounded-full border border-line bg-inset px-2.5 py-1 text-[11px] text-stone-ink transition-colors hover:border-brand-ring hover:text-paper"
                    >
                      {example.slice(0, 46)}…
                    </button>
                  ))
                : null}
            </div>
            <span className="font-tech text-[11px] text-ash">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          </div>

          {/* Production settings */}
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                <AspectGlyph aspect={aspect} className="h-3 w-3" />
                Format
              </span>
              <Segmented
                size="sm"
                value={aspect}
                onChange={setAspect}
                options={ASPECT_ORDER.map((option) => ({
                  value: option,
                  label: ASPECTS[option].shortLabel,
                }))}
              />
            </div>

            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                <Clock className="h-3 w-3" />
                Length
              </span>
              <Segmented
                size="sm"
                value={String(duration)}
                onChange={(next) => setDuration(Number(next))}
                options={[15, 30, 45, 60, 90].map((seconds) => ({
                  value: String(seconds),
                  label: formatClock(seconds),
                }))}
              />
            </div>

            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                <AudioLines className="h-3 w-3" />
                Voice
              </span>
              <select
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
                className="field"
                aria-label="Narrator voice"
              >
                {["My voices", "AI presenters"].map((group) => {
                  const items = allVoices.filter((item) => item.group === group);
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={group} label={group}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.style}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                <Captions className="h-3 w-3" />
                Subtitles
              </span>
              <select
                value={captionMode}
                onChange={(event) => setCaptionMode(event.target.value as CaptionMode)}
                className="field"
                aria-label="Caption style"
              >
                {CAPTION_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                <Music4 className="h-3 w-3" />
                Music
              </span>
              <select
                value={musicTrack}
                onChange={(event) => setMusicTrack(event.target.value as MusicTrackId)}
                className="field"
                aria-label="Background music"
              >
                {MUSIC_TRACKS.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} — {track.mood}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                Tone
              </span>
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
                className="field capitalize"
                aria-label="Narration tone"
              >
                {TONES.map((option) => (
                  <option key={option} value={option} className="capitalize">
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                Language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="field"
                aria-label="Language"
              >
                {LANGUAGES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
                Quality
              </span>
              <Segmented
                size="sm"
                value={resolution}
                onChange={setResolution}
                options={RESOLUTION_ORDER.map((option) => ({
                  value: option,
                  label: RESOLUTIONS[option].label,
                }))}
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleAudition()}
                className="btn btn-secondary"
                title="Hear this voice"
              >
                {auditioning ? (
                  <>
                    <Square className="h-3 w-3 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <AudioLines className="h-3.5 w-3.5" />
                    Test voice
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void create(false)}
                disabled={Boolean(loading) || !prompt.trim()}
                className="btn btn-secondary"
              >
                <FileText className="h-3.5 w-3.5" />
                Script only
              </button>
            </div>

            <button
              type="button"
              onClick={() => void create(true)}
              disabled={Boolean(loading) || !prompt.trim()}
              className="btn btn-primary px-6 py-3 text-sm sm:min-w-[260px]"
            >
              {loading === "generate" ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Generating your video…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate video
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
