"use client";

import { ArrowRight, FileText, Loader2, Music, Play, Sparkles, Square, Users, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AspectGlyph, AudioMeter } from "@/components/BrandMark";
import { saveLocalProject } from "@/lib/client-store";
import { STICK_THEMES, type StickTheme } from "@/lib/stickman";
import { MUSIC_TRACKS } from "@/lib/music";
import { formatClock } from "@/lib/timecode";
import type { VideoTemplate } from "@/lib/templates";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  PEOPLE_REPRESENTATIONS,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  TONES,
  WORKFLOW_ORDER,
  WORKFLOWS,
  type AspectRatio,
  type CaptionMode,
  type MusicTrackId,
  type PeopleRepresentation,
  type Resolution,
  type Tone,
  type Workflow,
  AI_STYLE_ORDER,
  AI_STYLES,
  type AiStyleId,
  type VisualMode,
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
  const [peopleRepresentation, setPeopleRepresentation] =
    useState<PeopleRepresentation>("all");
  const [visualMode, setVisualMode] = useState<VisualMode>("stock");
  const [aiStyle, setAiStyle] = useState<AiStyleId>("cinematic");
  const [stickTheme, setStickTheme] = useState<StickTheme>("whiteboard");
  const [duration, setDuration] = useState<number>(30);
  const [loadingMode, setLoadingMode] = useState<"render" | "draft" | null>(null);
  const [auditioning, setAuditioning] = useState(false);
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
          peopleRepresentation,
          duration,
          visualMode,
          aiStyle,
          stickTheme,
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

        {/* Row 3: Visual source — licensed stock video or AI-generated images */}
        <div className="mt-3 rounded-[3px] border border-line bg-inset/60 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="font-tech inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-stone-ink">
              <Sparkles className="h-3 w-3 text-amber-cue" />
              <span>Visuals</span>
            </span>
            <span className="font-tech text-[10px] text-ash">
              {visualMode === "ai-video"
                ? "A text-to-video clip generated for every scene"
                : visualMode === "stickman"
                  ? "Free animated stick figure, lip-synced to the voiceover"
                  : visualMode === "ai-image"
                  ? "AI images for every scene, animated with camera moves"
                  : "Real stock video matched to every line"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div role="radiogroup" aria-label="Visual source" className="inline-flex rounded-[3px] border border-line bg-canvas p-0.5">
              {(
                [
                  ["stock", "Stock video"],
                  ["ai-video", "AI video"],
                  ["ai-image", "AI images"],
                  ["stickman", "Stickman"],
                ] as const
              ).map(([id, label]) => {
                const active = visualMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVisualMode(id)}
                    className={`rounded-[2px] px-2.5 py-1 font-tech text-[10px] uppercase tracking-[0.06em] transition-colors ${
                      active
                        ? "bg-amber-cue font-semibold text-[#14110A]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {visualMode === "stickman" ? (
              <select
                aria-label="Stickman theme"
                value={stickTheme}
                onChange={(event) => setStickTheme(event.target.value as StickTheme)}
                className="rounded-[3px] border border-line bg-canvas px-2.5 py-1 text-xs text-paper outline-none focus:border-amber-cue"
              >
                {(Object.keys(STICK_THEMES) as StickTheme[]).map((id) => (
                  <option key={id} value={id} className="bg-panel">
                    {STICK_THEMES[id]}
                  </option>
                ))}
              </select>
            ) : visualMode !== "stock" ? (
              <select
                aria-label="AI art style"
                value={aiStyle}
                onChange={(event) => setAiStyle(event.target.value as AiStyleId)}
                className="rounded-[3px] border border-line bg-canvas px-2.5 py-1 text-xs text-paper outline-none focus:border-amber-cue"
              >
                {AI_STYLE_ORDER.map((id) => (
                  <option key={id} value={id} className="bg-panel">
                    {AI_STYLES[id].label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        {/* Row 4: People / Cast Representation (Real-world footage only) */}
        <div className="mt-3 rounded-[3px] border border-line bg-inset/60 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="font-tech inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-stone-ink">
              <Users className="h-3 w-3 text-amber-cue" />
              <span>People / Cast in Video</span>
            </span>
            <span className="font-tech text-[10px] text-ash">
              Real-world clips only · Zero abstract media · Matched to narration
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="People representation in video"
            className="flex flex-wrap gap-1.5"
          >
            {PEOPLE_REPRESENTATIONS.map((opt) => {
              const active = peopleRepresentation === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPeopleRepresentation(opt.id)}
                  title={opt.description}
                  className={`rounded-[2px] border px-2.5 py-1 font-tech text-[10px] uppercase tracking-[0.06em] transition-colors ${
                    active
                      ? "border-amber-cue bg-amber-cue font-semibold text-[#14110A]"
                      : "border-line bg-canvas text-stone-ink hover:border-line-strong hover:text-paper"
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
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
