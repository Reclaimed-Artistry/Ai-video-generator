"use client";

import {
  ArrowLeft,
  Captions,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Globe2,
  ImagePlus,
  Layers,
  Loader2,
  Music4,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AspectGlyph } from "@/components/BrandMark";
import DesignPanel from "@/components/studio/DesignPanel";
import MediaPanel from "@/components/studio/MediaPanel";
import VoicePanel from "@/components/studio/VoicePanel";
import { Badge, Notice, ProgressBar, Segmented, Slider } from "@/components/ui";
import { readJson, readJsonObject, responseError } from "@/lib/http";
import { MUSIC_TRACKS } from "@/lib/music";
import { resolveMediaUrl } from "@/lib/media-url";
import { countWords, estimateSceneSeconds, formatClock } from "@/lib/timecode";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  MAX_SCENES,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  type AspectRatio,
  type CaptionMode,
  type MusicTrackId,
  type Project,
  type Resolution,
  type Scene,
  type Style,
} from "@/lib/types";

type RightTab = "design" | "media" | "voice" | "output";

const TABS: { id: RightTab; label: string; icon: typeof Palette }[] = [
  { id: "design", label: "Brand", icon: Palette },
  { id: "media", label: "Media", icon: ImagePlus },
  { id: "voice", label: "Voice", icon: Globe2 },
  { id: "output", label: "Output", icon: Layers },
];

const SUGGESTIONS = [
  "Make it more upbeat",
  "Switch to 9:16 vertical",
  "Change the voice to a British male",
  "Replace scene 2 with ocean waves",
  "Add uplifting music",
  "Shorten the script",
];

const CAPTION_PREVIEW_STYLES: Record<Style, string> = {
  modern: "bg-night/70 text-white",
  minimal: "bg-transparent text-white/90",
  cinematic: "bg-night/50 text-[#E8DCC4]",
  energetic: "bg-amber-cue text-night",
  corporate: "bg-night/85 text-white",
};

export default function Studio({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState<Project>(initialProject);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<RightTab>("design");

  // `useState` only reads its argument on the first mount. If this component
  // is ever re-rendered with a *different* project (client-side navigation
  // between /studio/:id routes, or a router cache restoring the shell), the
  // editor would keep editing the previous one. Re-sync during render —
  // React discards the first pass and re-renders immediately, which is the
  // documented pattern for adjusting state when a prop changes.
  const [loadedId, setLoadedId] = useState(initialProject.id);
  if (loadedId !== initialProject.id) {
    setLoadedId(initialProject.id);
    setProject(initialProject);
    setActiveIndex(0);
    setTab("design");
  }

  // Live telemetry only advances while an encode is running. Outside of a
  // render the project row itself is the source of truth, so there is no
  // mirrored state to keep in sync.
  const [live, setLive] = useState({
    progress: initialProject.progress,
    stage: initialProject.stage,
    error: initialProject.error,
  });
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [commandFeedback, setCommandFeedback] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenes = useMemo(() => project.script.scenes ?? [], [project.script.scenes]);
  const activeScene: Scene | null = scenes[activeIndex] ?? null;
  const isRendering = project.status === "rendering";
  const progress = isRendering ? live.progress : project.progress;
  const stage = isRendering ? live.stage : project.stage;
  const renderError = project.error ?? live.error;

  const totalSeconds = useMemo(
    () => scenes.reduce((acc, scene) => acc + estimateSceneSeconds(scene.narration, scene.duration), 0),
    [scenes],
  );
  const totalWords = useMemo(
    () => scenes.reduce((acc, scene) => acc + countWords(scene.narration), 0),
    [scenes],
  );

  const videoSrc = resolveMediaUrl(
    project.outputPath,
    `renders/${project.id}/output.mp4`,
    project.updatedAt,
  );
  const posterSrc = resolveMediaUrl(
    project.posterPath,
    `renders/${project.id}/poster.jpg`,
    project.updatedAt,
  );

  /* ---------------------------------------------------------- persistence */

  const patchProject = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson<{ project?: Project; error?: string }>(response);
      if (!response.ok) throw new Error(responseError(data, response, "Could not save"));
      if (!data?.project) throw new Error("The server did not return the project.");
      setProject(data.project);
      return data.project;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save");
      return null;
    } finally {
      setSaving(false);
    }
  }, [project.id]);

  const patchScene = useCallback(
    (index: number, patch: Partial<Scene>) => {
      const target = scenes[index];
      if (!target) return;
      const nextScenes = scenes.map((scene, idx) =>
        idx === index ? { ...scene, ...patch, id: scene.id } : scene,
      );
      setProject((prev) => ({
        ...prev,
        script: { ...prev.script, scenes: nextScenes },
        status: prev.status === "rendering" ? prev.status : "ready",
      }));

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void fetch(`/api/projects/${project.id}/scenes/${target.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => undefined);
      }, 650);
    },
    [project.id, scenes],
  );

  /* -------------------------------------------------------------- rendering */

  /** Re-reads the project from the server so the UI reflects server-side edits. */
  const refreshProject = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}`).catch(() => null);
    if (!response?.ok) return;
    const payload = await readJson<{ project?: Project }>(response);
    if (payload?.project) setProject(payload.project);
  }, [project.id]);

  const pollRender = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.id}/render`).catch(() => null);
    if (!response?.ok) return;
    const data = await readJsonObject<{ progress?: number; stage?: string; error?: string | null; status?: string }>(
      response,
    );
    setLive({
      progress: data.progress ?? 0,
      stage: data.stage ?? "",
      error: data.error ?? null,
    });
    if (data.status === "done" || data.status === "error") {
      await refreshProject();
    }
  }, [project.id, refreshProject]);

  useEffect(() => {
    if (project.status !== "rendering") return;
    const timer = setInterval(() => void pollRender(), 2500);
    return () => clearInterval(timer);
  }, [project.status, pollRender]);

  async function startRender() {
    setBusyAction("render");
    setNotice(null);
    const response = await fetch(`/api/projects/${project.id}/render`, { method: "POST" });
    const data = await readJsonObject<{ error?: string }>(response);
    if (!response.ok) {
      setNotice(responseError(data, response, "Could not start the render"));
    } else {
      setLive({ progress: 2, stage: "Starting FFmpeg pipeline", error: null });
      setProject((prev) => ({ ...prev, status: "rendering" }));
    }
    setBusyAction(null);
  }

  /* ------------------------------------------------------------ scene ops */

  async function addScene() {
    if (scenes.length >= MAX_SCENES) {
      setNotice(`A video can hold up to ${MAX_SCENES} scenes.`);
      return;
    }
    setBusyAction("add");
    try {
      const response = await fetch(`/api/projects/${project.id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: `add a scene about ${project.prompt.slice(0, 60)}` }),
      });
      const data = await readJson<{ project?: Project; error?: string }>(response);
      if (!response.ok) throw new Error(responseError(data, response, "Could not add a scene"));
      if (!data?.project) throw new Error("The server did not return the project.");
      setProject(data.project);
      setActiveIndex(data.project.script.scenes.length - 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add a scene");
    } finally {
      setBusyAction(null);
    }
  }

  async function removeScene(index: number) {
    if (scenes.length <= 1) {
      setNotice("A video needs at least one scene.");
      return;
    }
    const nextScenes = scenes.filter((_, idx) => idx !== index);
    setActiveIndex(Math.max(0, Math.min(index, nextScenes.length - 1)));
    await patchProject({ script: { ...project.script, scenes: nextScenes } });
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const nextScenes = [...scenes];
    [nextScenes[index], nextScenes[target]] = [nextScenes[target], nextScenes[index]];
    setActiveIndex(target);
    void patchProject({ script: { ...project.script, scenes: nextScenes } });
  }

  /* -------------------------------------------------------------- command */

  async function submitCommand(raw?: string) {
    const text = (raw ?? command).trim();
    if (!text || busyAction) return;
    setBusyAction("command");
    setCommandFeedback(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      const data = await readJson<{ project?: Project; changes?: string[]; error?: string }>(response);
      if (!response.ok) throw new Error(responseError(data, response, "Could not apply that command"));
      if (!data?.project) throw new Error("The server did not return the project.");
      setProject(data.project);
      setCommand("");
      setCommandFeedback({ tone: "success", text: (data.changes ?? []).join(" · ") });
    } catch (error) {
      setCommandFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Could not apply that command",
      });
    } finally {
      setBusyAction(null);
    }
  }

  /* -------------------------------------------------------------- derived */

  const musicTrackId: MusicTrackId = project.script.options?.musicTrack ?? "corporate";
  const musicVolume = project.script.options?.musicVolume ?? 0.16;
  const captionMode: CaptionMode = project.script.options?.captionMode ?? "word-highlight";

  const statusBadge = () => {
    if (isRendering) return <Badge tone="brand">Rendering {progress}%</Badge>;
    if (project.status === "error") return <Badge tone="danger">Render failed</Badge>;
    if (project.status === "done") return <Badge tone="success">Ready</Badge>;
    return <Badge tone="warn">Edits pending</Badge>;
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-paper">
      {/* Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-stone-ink transition-colors hover:bg-inset hover:text-paper"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">My videos</span>
          </Link>

          <div className="min-w-0 flex-1">
            <input
              value={project.title}
              onChange={(event) =>
                setProject((prev) => ({ ...prev, title: event.target.value }))
              }
              onBlur={() => void patchProject({ title: project.title })}
              className="w-full truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-paper outline-none transition-colors hover:border-line focus:border-amber-cue focus:bg-panel"
              aria-label="Project title"
            />
          </div>

          <div className="flex items-center gap-2">
            {saving ? (
              <span className="hidden items-center gap-1 text-[11px] text-ash sm:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </span>
            ) : null}
            {statusBadge()}

            {project.outputPath ? (
              <a href={videoSrc ?? "#"} download className="btn btn-secondary">
                <Download className="h-3.5 w-3.5" />
                MP4
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => void startRender()}
              disabled={isRendering || Boolean(busyAction)}
              className="btn btn-primary"
            >
              {isRendering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rendering…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {project.outputPath ? "Re-render" : "Export video"}
                </>
              )}
            </button>
          </div>
        </div>

        {isRendering ? (
          <div className="px-4 pb-2.5 sm:px-5">
            <ProgressBar value={progress} />
            <p className="mt-1.5 truncate text-[11px] text-stone-ink">{stage}</p>
          </div>
        ) : null}
      </header>

      {/* Body ------------------------------------------------------------ */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left: scenes */}
        <aside className="w-full shrink-0 border-b border-line bg-panel lg:w-[330px] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="eyebrow">
              Scenes · {scenes.length}
              <span className="ml-2 font-normal normal-case tracking-normal text-ash">
                {formatClock(totalSeconds)} · {totalWords} words
              </span>
            </p>
            <button
              type="button"
              onClick={() => void addScene()}
              disabled={Boolean(busyAction)}
              className="btn btn-ghost px-2 py-1 text-[11px]"
            >
              {busyAction === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>

          <div className="scroll-thin max-h-[46vh] overflow-y-auto p-3 lg:max-h-[calc(100vh-140px)]">
            <div className="space-y-2">
              {scenes.map((scene, index) => {
                const active = index === activeIndex;
                const seconds = estimateSceneSeconds(scene.narration, scene.duration);
                return (
                  <div
                    key={scene.id}
                    onClick={() => setActiveIndex(index)}
                    className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${
                      active
                        ? "border-amber-cue bg-brand-soft/45"
                        : "border-line bg-panel hover:border-brand-ring"
                    }`}
                  >
                    <div className="flex gap-2.5">
                      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-night">
                        {scene.mediaThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={scene.mediaThumb}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center">
                            <Video className="h-4 w-4 text-white/35" />
                          </div>
                        )}
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-night/75 px-1 font-tech text-[9px] text-white">
                          {index + 1}
                        </span>
                        {scene.mediaOrigin === "generated" ? (
                          <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded bg-amber-cue text-white">
                            <Sparkles className="h-2.5 w-2.5" />
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <textarea
                          value={scene.narration}
                          onChange={(event) =>
                            patchScene(index, { narration: event.target.value })
                          }
                          rows={3}
                          className="w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs leading-relaxed text-paper outline-none transition-colors hover:border-line focus:border-amber-cue focus:bg-panel"
                          aria-label={`Scene ${index + 1} narration`}
                        />
                        <div className="mt-1 flex items-center justify-between gap-2 px-1.5">
                          <span className="font-tech text-[10px] text-ash">
                            ~{seconds.toFixed(1)}s · {scene.mediaProvider ?? "clip"}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveScene(index, -1);
                              }}
                              disabled={index === 0}
                              className="rounded p-0.5 text-ash hover:bg-inset hover:text-paper disabled:opacity-30"
                              aria-label="Move scene up"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                moveScene(index, 1);
                              }}
                              disabled={index === scenes.length - 1}
                              className="rounded p-0.5 text-ash hover:bg-inset hover:text-paper disabled:opacity-30"
                              aria-label="Move scene down"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void removeScene(index);
                              }}
                              className="rounded p-0.5 text-ash hover:bg-inset hover:text-tally"
                              aria-label="Delete scene"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center: preview */}
        <section className="min-w-0 flex-1 border-b border-line p-4 lg:border-b-0 lg:border-r">
          <div className="mx-auto max-w-[820px]">
            <div
              className="relative overflow-hidden rounded-2xl bg-night shadow-soft"
              style={{ aspectRatio: ASPECTS[project.aspect].ratio }}
            >
              {project.outputPath && videoSrc ? (
                <video
                  key={videoSrc}
                  src={videoSrc}
                  poster={posterSrc ?? undefined}
                  controls
                  playsInline
                  className="h-full w-full bg-black object-contain"
                />
              ) : (
                <>
                  {activeScene?.mediaThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeScene.mediaThumb}
                      alt=""
                      className="h-full w-full object-cover opacity-90"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-white/40">
                      <Video className="h-8 w-8" />
                    </div>
                  )}

                  {captionMode !== "off" && activeScene ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-6">
                      <span
                        className={`max-w-[85%] rounded-lg px-3 py-1.5 text-center text-sm font-bold leading-snug ${
                          CAPTION_PREVIEW_STYLES[project.style as Style] ??
                          CAPTION_PREVIEW_STYLES.modern
                        }`}
                        style={{ fontSize: "clamp(12px, 3.4vw, 22px)" }}
                      >
                        {activeScene.caption || activeScene.narration}
                      </span>
                    </div>
                  ) : null}

                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-cue" />
                    Storyboard preview
                  </div>
                </>
              )}
            </div>

            {/* Timeline */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-ash">
                <span className="inline-flex items-center gap-1.5">
                  <AspectGlyph aspect={project.aspect} className="h-3 w-3" />
                  {ASPECTS[project.aspect].label} · {RESOLUTIONS[project.resolution].label}
                </span>
                <span className="font-tech">{formatClock(totalSeconds)} total</span>
              </div>
              <div className="flex h-9 gap-0.5 overflow-hidden rounded-lg bg-inset p-1">
                {scenes.map((scene, index) => {
                  const seconds = estimateSceneSeconds(scene.narration, scene.duration);
                  const share = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 100 / scenes.length;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      title={`Scene ${index + 1} · ${seconds.toFixed(1)}s`}
                      className={`relative shrink-0 overflow-hidden rounded-md transition-colors ${
                        index === activeIndex
                          ? "bg-amber-cue"
                          : "bg-line-strong hover:bg-brand-ring"
                      }`}
                      style={{ width: `${share}%` }}
                    >
                      {scene.mediaThumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scene.mediaThumb}
                          alt=""
                          className="h-full w-full object-cover opacity-70"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI command bar */}
            <div className="mt-3 rounded-2xl border border-line bg-panel p-3 shadow-soft">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-cue" />
                <input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitCommand();
                  }}
                  placeholder="Ask for an edit — “make it more upbeat”, “switch to 9:16”, “change scene 2 to ocean waves”…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-ash"
                  aria-label="Edit command"
                />
                <button
                  type="button"
                  onClick={() => void submitCommand()}
                  disabled={!command.trim() || Boolean(busyAction)}
                  className="btn btn-primary px-3 py-1.5"
                >
                  {busyAction === "command" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void submitCommand(suggestion)}
                    disabled={Boolean(busyAction)}
                    className="rounded-full border border-line bg-inset px-2.5 py-1 text-[11px] text-stone-ink transition-colors hover:border-brand-ring hover:text-paper"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {commandFeedback ? (
                <div className="mt-2.5">
                  <Notice tone={commandFeedback.tone}>{commandFeedback.text}</Notice>
                </div>
              ) : null}
            </div>

            {notice ? (
              <div className="mt-3">
                <Notice tone="danger">{notice}</Notice>
              </div>
            ) : null}
          </div>
        </section>

        {/* Right: inspector */}
        <aside className="w-full shrink-0 bg-panel lg:w-[320px]">
          <div className="border-b border-line p-2">
            <Segmented
              size="sm"
              value={tab}
              onChange={setTab}
              options={TABS.map((item) => ({
                value: item.id,
                label: (
                  <span className="inline-flex items-center justify-center gap-1">
                    <item.icon className="h-3 w-3" />
                    {item.label}
                  </span>
                ),
              }))}
            />
          </div>

          <div className="scroll-thin max-h-[calc(100vh-140px)] overflow-y-auto p-4">
            {tab === "design" ? (
              <DesignPanel
                projectId={project.id}
                brandKitId={project.brandKitId ?? null}
                onAssigned={(kitId) =>
                  setProject((prev) => ({ ...prev, brandKitId: kitId }))
                }
              />
            ) : null}

            {tab === "media" ? (
              <MediaPanel
                scene={activeScene}
                projectId={project.id}
                aspect={project.aspect}
                resolution={project.resolution}
                primaryColor={project.brandKit?.primaryColor}
                onApply={(patch) => patchScene(activeIndex, patch)}
              />
            ) : null}

            {tab === "voice" ? (
              <VoicePanel
                projectId={project.id}
                voice={project.voice}
                language={project.language}
                onVoiceChange={(voiceId) => void patchProject({ voice: voiceId })}
                onDubbed={() => void refreshProject()}
              />
            ) : null}

            {tab === "output" ? (
              <div className="space-y-5">
                <div>
                  <p className="eyebrow mb-2">Format</p>
                  <Segmented
                    size="sm"
                    value={project.aspect}
                    onChange={(aspect: AspectRatio) => void patchProject({ aspect })}
                    options={ASPECT_ORDER.map((option) => ({
                      value: option,
                      label: ASPECTS[option].shortLabel,
                    }))}
                  />
                </div>

                <div>
                  <p className="eyebrow mb-2">Quality</p>
                  <Segmented
                    size="sm"
                    value={project.resolution}
                    onChange={(resolution: Resolution) => void patchProject({ resolution })}
                    options={RESOLUTION_ORDER.map((option) => ({
                      value: option,
                      label: RESOLUTIONS[option].label,
                      sub: RESOLUTIONS[option].role,
                    }))}
                  />
                  <p className="mt-1.5 text-[11px] text-ash">
                    {RESOLUTIONS[project.resolution].note}
                  </p>
                </div>

                <div>
                  <p className="eyebrow mb-2">Subtitles</p>
                  <select
                    value={captionMode}
                    onChange={(event) =>
                      void patchProject({
                        script: {
                          ...project.script,
                          options: {
                            ...project.script.options,
                            captionMode: event.target.value as CaptionMode,
                          },
                        },
                      })
                    }
                    className="field"
                    aria-label="Caption mode"
                  >
                    {CAPTION_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="eyebrow mb-2">
                    <Music4 className="mr-1 inline h-3 w-3" />
                    Music
                  </p>
                  <select
                    value={musicTrackId}
                    onChange={(event) =>
                      void patchProject({
                        script: {
                          ...project.script,
                          options: {
                            ...project.script.options,
                            musicTrack: event.target.value as MusicTrackId,
                          },
                        },
                      })
                    }
                    className="field"
                    aria-label="Music track"
                  >
                    {MUSIC_TRACKS.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name} — {track.mood}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-ash">
                      <span>Music level</span>
                      <span className="font-tech">{Math.round(musicVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={musicVolume}
                      min={0}
                      max={0.45}
                      step={0.01}
                      onChange={(next) =>
                        void patchProject({
                          script: {
                            ...project.script,
                            options: { ...project.script.options, musicVolume: next },
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => void startRender()}
                    disabled={isRendering || Boolean(busyAction)}
                    className="btn btn-primary w-full"
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Rendering {progress}%
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        {project.outputPath ? "Re-render master" : "Export MP4"}
                      </>
                    )}
                  </button>
                  {project.outputPath ? (
                    <a href={videoSrc ?? "#"} download className="btn btn-secondary mt-2 w-full">
                      <Download className="h-3.5 w-3.5" />
                      Download MP4
                    </a>
                  ) : null}
                  {renderError ? (
                    <div className="mt-2.5">
                      <Notice tone="danger">{renderError}</Notice>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-line pt-4">
                  <p className="eyebrow mb-2">Script</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setBusyAction("script");
                        const response = await fetch(
                          `/api/projects/${project.id}/script`,
                          { method: "POST" },
                        );
                        const data = await readJson<{ project?: Project }>(response);
                        if (response.ok && data?.project) setProject(data.project);
                        setBusyAction(null);
                      }}
                      className="btn btn-secondary flex-1"
                    >
                      {busyAction === "script" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      Rewrite script
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("voice")}
                      className="btn btn-secondary"
                      title="Dub into another language"
                    >
                      <Globe2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("design")}
                    className="btn btn-ghost mt-2 w-full"
                  >
                    <Captions className="h-3.5 w-3.5" />
                    Caption colours come from your brand kit
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
