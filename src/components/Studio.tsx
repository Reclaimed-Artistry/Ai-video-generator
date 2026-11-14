"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Crosshair,
  Download,
  Film,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AspectGlyph,
  AudioMeter,
  countWords,
  BrandMark,
  estimateSceneSeconds,
  formatClock,
  formatSmpte,
} from "@/components/BrandMark";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  ASPECT_ORDER,
  ASPECTS,
  LANGUAGES,
  MAX_SCENES,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  STYLES,
  TONES,
  type AspectRatio,
  type Project,
  type Resolution,
  type Scene,
  type StockAsset,
  type Style,
  type Tone,
} from "@/lib/types";
import type { Voice } from "@/lib/voices";

type RightTab = "media" | "voices" | "settings";
type MonitorMode = "storyboard" | "master";

type RenderState = {
  status: string;
  progress: number;
  stage: string;
  error: string | null;
};

const QUICK_TOPICS = ["city", "technology", "coffee", "ocean", "fitness", "airplane", "neon"];

function pickPreviewUrl(asset: StockAsset): string | null {
  if (!asset.sources.length) return null;
  const sorted = [...asset.sources].sort(
    (a, b) => (a.height ?? 540) - (b.height ?? 540),
  );
  const mid = sorted.find((source) => (source.height ?? 540) >= 360) ?? sorted[0];
  return mid?.url ?? null;
}

function captionPreviewClasses(style: Style): string {
  switch (style) {
    case "minimal":
      return "self-start text-left bg-transparent px-0 py-0 text-paper drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]";
    case "cinematic":
      return "bg-black/70 px-3.5 py-1.5 tracking-[0.04em] text-paper border border-white/10";
    case "energetic":
      return "bg-black/80 px-3 py-1 font-bold text-[#FFE066]";
    case "corporate":
      return "bg-[#1E3A8A]/90 px-3.5 py-1.5 text-white border-l-2 border-amber-cue";
    default:
      return "bg-black/65 px-3 py-1 text-paper";
  }
}

export default function Studio({
  initialProject,
}: {
  initialProject: Project;
}) {
  const [project, setProject] = useState<Project>(initialProject);
  const [activeSceneId, setActiveSceneId] = useState<string>(
    initialProject.script.scenes[0]?.id ?? "",
  );
  const [tab, setTab] = useState<RightTab>("media");
  const [monitorMode, setMonitorMode] = useState<MonitorMode>(
    initialProject.status === "done" ? "master" : "storyboard",
  );
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [hasUnrenderedEdits, setHasUnrenderedEdits] = useState(false);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceAccentFilter, setVoiceAccentFilter] = useState<string>("all");
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);

  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [mediaSource, setMediaSource] = useState<string>("");
  const [providerFilter, setProviderFilter] = useState<"all" | "pexels" | "pixabay">("all");
  const [search, setSearch] = useState<string>(
    initialProject.script.scenes[0]?.mediaQuery ?? "",
  );
  const [searching, setSearching] = useState(false);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [rewritingAll, setRewritingAll] = useState(false);
  const [rewritingSceneId, setRewritingSceneId] = useState<string | null>(null);
  const [masterTime, setMasterTime] = useState(0);
  const [renderVersion, setRenderVersion] = useState(0);

  const [render, setRender] = useState<RenderState>({
    status: initialProject.status,
    progress: initialProject.progress,
    stage: initialProject.stage,
    error: initialProject.error,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hydrated = useRef(false);
  const saveSeqRef = useRef(0);

  const scenes = project.script.scenes ?? [];
  const activeIndex = useMemo(() => {
    const idx = scenes.findIndex((scene) => scene.id === activeSceneId);
    return idx >= 0 ? idx : 0;
  }, [scenes, activeSceneId]);
  const activeScene: Scene | null = scenes[activeIndex] ?? null;

  const sceneTimings = useMemo(() => {
    let cursor = 0;
    return scenes.map((scene) => {
      const duration = estimateSceneSeconds(scene.narration, scene.duration);
      const start = cursor;
      cursor += duration;
      return { id: scene.id, start, duration, end: cursor };
    });
  }, [scenes]);

  const totalEstimatedSeconds = useMemo(
    () => sceneTimings.reduce((acc, item) => acc + item.duration, 0),
    [sceneTimings],
  );

  const totalWords = useMemo(
    () => scenes.reduce((acc, scene) => acc + countWords(scene.narration), 0),
    [scenes],
  );

  const hasMasterFile = Boolean(project.outputPath) || render.status === "done";

  const searchMedia = useCallback(
    async (query: string, provider: "all" | "pexels" | "pixabay" = providerFilter) => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/media/search?q=${encodeURIComponent(query)}&provider=${provider}&limit=24`,
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setAssets(Array.isArray(data.assets) ? data.assets : []);
          setMediaSource(data.source ?? "");
        }
      } finally {
        setSearching(false);
      }
    },
    [providerFilter],
  );

  useEffect(() => {
    fetch("/api/voices")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.voices)) setVoices(data.voices);
      })
      .catch(() => undefined);

    void searchMedia(initialProject.script.scenes[0]?.mediaQuery ?? "", "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Non-clobbering persistence: sends changes to PostgreSQL without overwriting
   * newer local keystrokes when responses arrive out of order.
   */
  const persistPatch = useCallback(
    async (patch: Record<string, unknown>, marksRenderDirty = true) => {
      const seq = ++saveSeqRef.current;
      setSaving(true);
      if (marksRenderDirty && hasMasterFile) {
        setHasUnrenderedEdits(true);
      }
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (response.ok && seq === saveSeqRef.current) {
          setSavedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          );
        }
      } catch {
        // Next edit will retry
      } finally {
        if (seq === saveSeqRef.current) {
          setSaving(false);
        }
      }
    },
    [project.id, hasMasterFile],
  );

  // Debounced autosave for script & title edits
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void persistPatch({ script: project.script, title: project.title }, true);
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.script, project.title]);

  // Poll FFmpeg render status while active
  useEffect(() => {
    if (render.status !== "rendering") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/projects/${project.id}/render`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const nextStatus = data.status ?? "rendering";
      setRender({
        status: nextStatus,
        progress: data.progress ?? 0,
        stage: data.stage ?? "Encoding…",
        error: data.error ?? null,
      });

      if (nextStatus === "done") {
        const refreshed = await fetch(`/api/projects/${project.id}`)
          .then((r) => r.json())
          .catch(() => null);
        if (refreshed?.project) {
          setProject((curr) => ({
            ...curr,
            status: "done",
            outputPath: refreshed.project.outputPath,
            posterPath: refreshed.project.posterPath,
          }));
        }
        setHasUnrenderedEdits(false);
        setRenderVersion((v) => v + 1);
        setMonitorMode("master");
      }
    }, 1400);
    return () => clearInterval(timer);
  }, [render.status, project.id]);

  function updateProjectSetting<K extends keyof Project>(
    key: K,
    value: Project[K],
  ) {
    setProject((curr) => ({ ...curr, [key]: value }));
    if (key === "aspect" || key === "style") {
      setMonitorMode("storyboard");
    }
    void persistPatch({ [key]: value }, true);
  }

  function updateScene(sceneId: string, patch: Partial<Scene>) {
    setMonitorMode("storyboard");
    setProject((curr) => ({
      ...curr,
      script: {
        ...curr.script,
        scenes: curr.script.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, ...patch } : scene,
        ),
      },
    }));
  }

  function addScene() {
    if (scenes.length >= MAX_SCENES) return;
    const fallbackAsset = assets[0];
    const newScene: Scene = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      narration: "Add spoken narration for this cue.",
      caption: `Cue ${scenes.length + 1}`,
      mediaQuery: fallbackAsset?.tags.slice(0, 2).join(" ") ?? "city aerial",
      mediaId: fallbackAsset?.id ?? null,
      mediaType: "video",
      mediaUrl: fallbackAsset ? pickPreviewUrl(fallbackAsset) : null,
      mediaThumb: fallbackAsset?.thumb ?? null,
      mediaTitle: fallbackAsset?.title ?? null,
      mediaCreator: fallbackAsset?.creator ?? null,
      mediaProvider: fallbackAsset?.provider ?? "pexels",
      duration: null,
      transition: "none",
    };
    setMonitorMode("storyboard");
    setProject((curr) => ({
      ...curr,
      script: {
        ...curr.script,
        scenes: [...curr.script.scenes, newScene],
      },
    }));
    setActiveSceneId(newScene.id);
  }

  function removeScene(sceneId: string) {
    if (scenes.length <= 1) return;
    setMonitorMode("storyboard");
    const remaining = scenes.filter((scene) => scene.id !== sceneId);
    setProject((curr) => ({
      ...curr,
      script: {
        ...curr.script,
        scenes: remaining,
      },
    }));
    if (activeSceneId === sceneId) {
      setActiveSceneId(remaining[0]?.id ?? "");
    }
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    setMonitorMode("storyboard");
    setProject((curr) => {
      const list = [...curr.script.scenes];
      const index = list.findIndex((scene) => scene.id === sceneId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return curr;
      const [item] = list.splice(index, 1);
      list.splice(target, 0, item);
      return { ...curr, script: { ...curr.script, scenes: list } };
    });
  }

  async function regenerateCue(sceneId: string) {
    setRewritingSceneId(sceneId);
    setMonitorMode("storyboard");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/scenes/${sceneId}`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.project) {
        setProject(data.project as Project);
        if (hasMasterFile) setHasUnrenderedEdits(true);
      }
    } finally {
      setRewritingSceneId(null);
    }
  }

  async function rewriteWholeScript() {
    setRewritingAll(true);
    setMonitorMode("storyboard");
    try {
      const response = await fetch(`/api/projects/${project.id}/script`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.project) {
        setProject(data.project as Project);
        setActiveSceneId(data.project.script.scenes?.[0]?.id ?? "");
        if (hasMasterFile) setHasUnrenderedEdits(true);
      }
    } finally {
      setRewritingAll(false);
    }
  }

  function assignMedia(asset: StockAsset) {
    if (!activeScene || asset.type !== "video") return;
    updateScene(activeScene.id, {
      mediaId: asset.id,
      mediaType: "video",
      mediaUrl: pickPreviewUrl(asset),
      mediaThumb: asset.thumb,
      mediaTitle: asset.title,
      mediaCreator: asset.creator,
      mediaProvider: asset.provider,
      mediaQuery: asset.tags.slice(0, 3).join(" "),
    });
  }

  async function playSpeechSample(key: string, voiceId: string, text?: string) {
    if (playingAudioKey === key && audioRef.current) {
      audioRef.current.pause();
      setPlayingAudioKey(null);
      return;
    }
    try {
      if (audioRef.current) audioRef.current.pause();
      setPlayingAudioKey(key);
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId, text }),
      });
      if (!response.ok) throw new Error("TTS failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => setPlayingAudioKey(null);
      audioRef.current.onerror = () => setPlayingAudioKey(null);
      await audioRef.current.play();
    } catch {
      setPlayingAudioKey(null);
    }
  }

  async function startMasterRender() {
    setRender({
      status: "rendering",
      progress: 2,
      stage: "Queueing FFmpeg pipeline…",
      error: null,
    });
    // Flush latest script state before triggering render
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: project.title,
        script: project.script,
        voice: project.voice,
        resolution: project.resolution,
        aspect: project.aspect,
        tone: project.tone,
        style: project.style,
        language: project.language,
        duration: project.duration,
      }),
    }).catch(() => undefined);

    const response = await fetch(`/api/projects/${project.id}/render`, {
      method: "POST",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setRender({
        status: "error",
        progress: 0,
        stage: "Encode aborted",
        error: data.error ?? "Render failed",
      });
    }
  }

  const filteredVoices = useMemo(() => {
    if (voiceAccentFilter === "all") return voices;
    return voices.filter(
      (voice) => voice.accent.toLowerCase() === voiceAccentFilter.toLowerCase(),
    );
  }, [voices, voiceAccentFilter]);

  const selectedVoiceObj = useMemo(
    () => voices.find((v) => v.id === project.voice) ?? null,
    [voices, project.voice],
  );

  const outputUrl =
    resolveMediaUrl(
      project.outputPath,
      `renders/${project.id}/output.mp4`,
      renderVersion,
    ) ?? `/api/files/renders/${project.id}/output.mp4?v=${renderVersion}`;
  const downloadUrl =
    resolveMediaUrl(project.outputPath, `renders/${project.id}/output.mp4`) ??
    `/api/files/renders/${project.id}/output.mp4`;
  const posterUrl =
    resolveMediaUrl(
      project.posterPath,
      `renders/${project.id}/poster.jpg`,
      renderVersion,
    ) ?? undefined;
  const activeTiming = sceneTimings[activeIndex] ?? { start: 0, duration: 5, end: 5 };

  const monitorFrameClass =
    project.aspect === "9:16"
      ? "aspect-[9/16] h-[360px] sm:h-[410px]"
      : project.aspect === "1:1"
        ? "aspect-square h-[340px] sm:h-[390px]"
        : "aspect-video w-full max-h-[410px]";

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-paper">
      {/* Top NLE Transport & Sequence Bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
          {/* Left: Bin navigation + editable sequence title */}
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bin</span>
            </Link>

            <BrandMark className="hidden h-4 w-4 shrink-0 text-stone-ink md:block" />

            <div className="min-w-0">
              <input
                aria-label="Sequence title"
                value={project.title}
                onChange={(event) =>
                  setProject((curr) => ({ ...curr, title: event.target.value }))
                }
                className="w-56 max-w-full truncate rounded-[2px] bg-transparent px-1 py-0.5 text-sm font-semibold text-paper outline-none ring-1 ring-transparent transition focus:bg-inset focus:ring-amber-cue sm:w-80"
              />
              <div className="font-tech flex items-center gap-2 px-1 text-[10px] text-ash">
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      saving ? "bg-amber-cue" : "bg-nominal"
                    }`}
                  />
                  {saving
                    ? "Syncing…"
                    : savedAt
                      ? `Saved ${savedAt}`
                      : "PostgreSQL synced"}
                </span>
                <span>·</span>
                <span>{scenes.length} cues</span>
                <span>·</span>
                <span>~{formatClock(totalEstimatedSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Right: Segmented Raster + Aspect + Redraft + Master Render */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Resolution Switcher */}
            <div
              role="group"
              aria-label="Export resolution"
              className="inline-flex rounded-[3px] border border-line bg-canvas p-0.5"
            >
              {RESOLUTION_ORDER.map((res) => {
                const active = project.resolution === res;
                return (
                  <button
                    key={res}
                    type="button"
                    onClick={() => updateProjectSetting("resolution", res)}
                    className={`rounded-[2px] px-2.5 py-1 font-tech text-[11px] transition-colors ${
                      active
                        ? "bg-elevated font-semibold text-amber-cue shadow-[inset_0_0_0_1px_#3a3832]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    {res}
                  </button>
                );
              })}
            </div>

            {/* Segmented Aspect Gate Switcher */}
            <div
              role="group"
              aria-label="Aspect ratio"
              className="hidden rounded-[3px] border border-line bg-canvas p-0.5 sm:inline-flex"
            >
              {ASPECT_ORDER.map((asp) => {
                const active = project.aspect === asp;
                return (
                  <button
                    key={asp}
                    type="button"
                    onClick={() => updateProjectSetting("aspect", asp)}
                    className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-1 font-tech text-[11px] transition-colors ${
                      active
                        ? "bg-elevated font-semibold text-paper shadow-[inset_0_0_0_1px_#3a3832]"
                        : "text-stone-ink hover:text-paper"
                    }`}
                  >
                    <AspectGlyph aspect={asp} className="h-3 w-3" />
                    <span>{asp}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void rewriteWholeScript()}
              disabled={rewritingAll || render.status === "rendering"}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper disabled:opacity-45"
            >
              <RefreshCw
                className={`h-3 w-3 ${rewritingAll ? "animate-spin text-amber-cue" : ""}`}
              />
              <span>{rewritingAll ? "Redrafting…" : "Redraft All"}</span>
            </button>

            <button
              type="button"
              onClick={() => void startMasterRender()}
              disabled={render.status === "rendering" || scenes.length === 0}
              className={`inline-flex items-center gap-2 rounded-[3px] px-3.5 py-1.5 font-tech text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                render.status === "rendering"
                  ? "border border-tally/60 bg-tally/20 text-[#f9c6bd]"
                  : "bg-amber-cue text-[#14110A] hover:bg-amber-hover"
              }`}
            >
              {render.status === "rendering" ? (
                <>
                  <span className="tally-dot h-2 w-2 rounded-full bg-tally" />
                  <span>Encoding {render.progress}%</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  <span>
                    {hasMasterFile && !hasUnrenderedEdits
                      ? `Re-encode ${project.resolution}`
                      : `Render ${project.resolution} Master`}
                  </span>
                </>
              )}
            </button>

            {hasMasterFile && render.status !== "rendering" ? (
              <a
                href={downloadUrl}
                download={`reclaimed-artistry-${project.id.slice(0, 8)}-${project.resolution}.mp4`}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-nominal/45 bg-nominal/10 px-3 py-1.5 font-tech text-[11px] font-medium text-nominal transition-colors hover:bg-nominal/20"
              >
                <Download className="h-3 w-3" />
                <span>MP4</span>
              </a>
            ) : null}
          </div>
        </div>

        {/* Live FFmpeg Encode Telemetry Strip */}
        {render.status === "rendering" ? (
          <div className="border-t border-line bg-inset px-4 py-2">
            <div className="flex items-center justify-between font-tech text-[11px]">
              <span className="flex items-center gap-2 text-paper">
                <Loader2 className="h-3 w-3 animate-spin text-amber-cue" />
                {render.stage || "Encoding H.264 stream…"}
              </span>
              <span className="text-amber-cue">{render.progress}%</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden bg-canvas">
              <div
                className="h-full bg-amber-cue transition-[width] duration-300"
                style={{ width: `${Math.max(4, render.progress)}%` }}
              />
            </div>
          </div>
        ) : null}

        {render.error ? (
          <div className="border-t border-tally/40 bg-tally/10 px-4 py-2 font-tech text-xs text-[#f4b4a8]">
            ENCODE ERR // {render.error}
          </div>
        ) : null}
      </header>

      {/* Main 3-Pane NLE Workbench */}
      <div className="grid flex-1 xl:grid-cols-[330px_minmax(0,1fr)_390px]">
        {/* LEFT PANE: Scene Rundown */}
        <section className="flex flex-col border-b border-line bg-panel xl:max-h-[calc(100vh-57px)] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-line bg-inset px-3.5 py-2.5">
            <div>
              <h2 className="font-tech text-[11px] font-semibold uppercase tracking-[0.14em] text-paper">
                Scene Rundown
              </h2>
              <p className="font-tech text-[10px] text-ash">
                {totalWords} words · est. {formatClock(totalEstimatedSeconds)}
              </p>
            </div>
            <button
              type="button"
              onClick={addScene}
              disabled={scenes.length >= MAX_SCENES}
              className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-panel px-2 py-1 font-tech text-[10px] uppercase tracking-wider text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              <span>Cue</span>
            </button>
          </div>

          <div className="scroll-thin flex-1 divide-y divide-line overflow-y-auto">
            {scenes.map((scene, index) => {
              const selected = scene.id === activeScene?.id;
              const timing = sceneTimings[index];
              return (
                <div
                  key={scene.id}
                  onClick={() => {
                    setActiveSceneId(scene.id);
                    if (scene.mediaQuery) setSearch(scene.mediaQuery);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveSceneId(scene.id);
                    }
                  }}
                  className={`group cursor-pointer p-3 transition-colors ${
                    selected
                      ? "bg-elevated shadow-[inset_2px_0_0_0_#E5A93C]"
                      : "hover:bg-inset/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-tech text-[10px]">
                    <span className={selected ? "font-semibold text-amber-cue" : "text-stone-ink"}>
                      SC {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-ash">
                      {formatClock(timing?.start ?? 0)} · ~{(timing?.duration ?? 4).toFixed(1)}s
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-2.5">
                    <div className="relative aspect-video overflow-hidden rounded-[2px] border border-line bg-[#050504]">
                      {scene.mediaThumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scene.mediaThumb}
                          alt={scene.caption}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-ash">
                          <Film className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-paper">
                        {scene.caption || "Untitled super"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-ink">
                        {scene.narration || "No voiceover copy"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CENTER PANE: Program Monitor + Timeline Strip + Cue Sheet Editor */}
        <section className="flex min-w-0 flex-col bg-canvas xl:max-h-[calc(100vh-57px)] xl:overflow-y-auto">
          {/* Monitor Bezel Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-[2px] border border-line bg-canvas p-0.5 font-tech text-[10px] uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setMonitorMode("storyboard")}
                  className={`rounded-[2px] px-2.5 py-1 transition-colors ${
                    monitorMode === "storyboard"
                      ? "bg-elevated font-semibold text-paper"
                      : "text-ash hover:text-paper"
                  }`}
                >
                  Storyboard Gate
                </button>
                <button
                  type="button"
                  disabled={!hasMasterFile}
                  onClick={() => setMonitorMode("master")}
                  className={`inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    monitorMode === "master"
                      ? "bg-elevated font-semibold text-nominal"
                      : "text-ash hover:text-paper"
                  }`}
                >
                  <span>Master MP4</span>
                  {hasUnrenderedEdits && hasMasterFile ? (
                    <span
                      title="Edits made since last encode"
                      className="h-1.5 w-1.5 rounded-full bg-amber-cue"
                    />
                  ) : null}
                </button>
              </div>

              {monitorMode === "storyboard" ? (
                <button
                  type="button"
                  onClick={() => setShowSafeGuides((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-1 font-tech text-[10px] uppercase tracking-wider transition-colors ${
                    showSafeGuides
                      ? "border-amber-cue/60 bg-amber-cue/10 text-amber-cue"
                      : "border-line bg-canvas text-ash hover:text-paper"
                  }`}
                >
                  <Crosshair className="h-3 w-3" />
                  <span>Safe Guides</span>
                </button>
              ) : null}
            </div>

            <div className="font-tech flex items-center gap-3 text-[11px]">
              <span className="text-ash">
                {RESOLUTIONS[project.resolution].label} · {project.aspect}
              </span>
              <span className="timecode text-amber-cue">
                {monitorMode === "master"
                  ? formatSmpte(masterTime)
                  : formatSmpte(activeTiming.start)}
              </span>
            </div>
          </div>

          {/* Program Monitor Bay */}
          <div className="flex items-center justify-center border-b border-line bg-[#060605] p-4 sm:p-6">
            {monitorMode === "master" && hasMasterFile ? (
              <div className={`relative overflow-hidden border border-line bg-black ${monitorFrameClass}`}>
                <video
                  key={outputUrl}
                  src={outputUrl}
                  poster={posterUrl}
                  controls
                  playsInline
                  onTimeUpdate={(e) => setMasterTime(e.currentTarget.currentTime)}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div
                className={`relative flex items-end justify-center overflow-hidden border border-line-strong bg-[#0a0a09] ${monitorFrameClass}`}
              >
                {activeScene?.mediaUrl ? (
                  <video
                    key={activeScene.mediaUrl}
                    src={activeScene.mediaUrl}
                    poster={activeScene.mediaThumb ?? undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : activeScene?.mediaThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeScene.mediaThumb}
                    alt={activeScene.caption}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}

                {/* Broadcast Action/Title Safe Guides */}
                {showSafeGuides ? (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-[5%] border border-dashed border-white/25" />
                    <div className="absolute inset-[10%] border border-amber-cue/40" />
                    <div className="absolute left-1/2 top-[8%] bottom-[8%] w-px bg-white/15" />
                    <div className="absolute top-1/2 left-[8%] right-[8%] h-px bg-white/15" />
                  </div>
                ) : null}

                {/* Top-left monitor HUD */}
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
                  <span className="rounded-[2px] bg-black/75 px-1.5 py-0.5 font-tech text-[10px] text-amber-cue">
                    SC {String(activeIndex + 1).padStart(2, "0")}/{String(scenes.length).padStart(2, "0")}
                  </span>
                  {activeScene?.mediaTitle ? (
                    <span className="max-w-[220px] truncate rounded-[2px] bg-black/75 px-1.5 py-0.5 font-tech text-[10px] text-stone-ink">
                      {activeScene.mediaTitle}
                    </span>
                  ) : null}
                </div>

                {/* Live Styled Lower-Third / Caption Preview */}
                {activeScene?.caption ? (
                  <div className="relative z-10 mb-[8%] flex w-[84%] flex-col items-center text-center">
                    <span
                      className={`text-sm font-semibold leading-snug sm:text-base ${captionPreviewClasses(
                        project.style,
                      )}`}
                    >
                      {activeScene.caption}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Proportional Timeline Filmstrip */}
          <div className="border-b border-line bg-panel px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between font-tech text-[10px] text-ash">
              <span>TIMELINE RUNDOWN // CLICK CUE TO INSPECT</span>
              <span>TOTAL ~{formatSmpte(totalEstimatedSeconds)}</span>
            </div>
            <div className="flex h-12 gap-1 overflow-x-auto">
              {scenes.map((scene, idx) => {
                const timing = sceneTimings[idx];
                const share =
                  totalEstimatedSeconds > 0
                    ? Math.max(12, (timing.duration / totalEstimatedSeconds) * 100)
                    : 100 / Math.max(1, scenes.length);
                const selected = scene.id === activeScene?.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    style={{ width: `${share}%`, minWidth: "84px" }}
                    onClick={() => {
                      setActiveSceneId(scene.id);
                      setMonitorMode("storyboard");
                    }}
                    className={`relative flex flex-col justify-between overflow-hidden rounded-[2px] border p-1.5 text-left transition-colors ${
                      selected
                        ? "border-amber-cue bg-elevated"
                        : "border-line bg-inset hover:border-line-strong"
                    }`}
                  >
                    {scene.mediaThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={scene.mediaThumb}
                        alt=""
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
                      />
                    ) : null}
                    <span className="relative font-tech text-[9px] font-semibold text-paper">
                      SC 0{idx + 1}
                    </span>
                    <span className="relative truncate font-tech text-[9px] text-stone-ink">
                      {timing.duration.toFixed(1)}s
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Cue Sheet Inspector */}
          {activeScene ? (
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-[2px] bg-amber-cue px-2 py-0.5 font-tech text-[11px] font-semibold text-[#14110A]">
                    SC {String(activeIndex + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-sm font-semibold text-paper">
                    Cue Sheet & Narration
                  </h3>
                  <span className="font-tech text-[11px] text-ash">
                    {countWords(activeScene.narration)} words · ~
                    {activeTiming.duration.toFixed(1)}s read
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void playSpeechSample(
                        `scene-${activeScene.id}`,
                        project.voice,
                        activeScene.narration || activeScene.caption,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-1 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
                  >
                    {playingAudioKey === `scene-${activeScene.id}` ? (
                      <>
                        <AudioMeter active />
                        <span>Stop VO</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3 w-3 text-amber-cue" />
                        <span>Audition Cue ({selectedVoiceObj?.name ?? project.voice})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => moveScene(activeScene.id, -1)}
                    disabled={activeIndex === 0}
                    title="Move cue earlier"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-stone-ink transition-colors hover:text-paper disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveScene(activeScene.id, 1)}
                    disabled={activeIndex === scenes.length - 1}
                    title="Move cue later"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-stone-ink transition-colors hover:text-paper disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void regenerateCue(activeScene.id)}
                    disabled={rewritingSceneId === activeScene.id}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-panel px-2.5 py-1 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper disabled:opacity-45"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${
                        rewritingSceneId === activeScene.id ? "animate-spin text-amber-cue" : ""
                      }`}
                    />
                    <span>Rewrite Cue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeScene(activeScene.id)}
                    disabled={scenes.length <= 1}
                    title="Delete cue"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-ash transition-colors hover:border-tally/50 hover:text-tally disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Spoken Voiceover Copy */}
              <label className="block">
                <span className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
                  Spoken Voiceover Script
                </span>
                <textarea
                  value={activeScene.narration}
                  onChange={(event) =>
                    updateScene(activeScene.id, { narration: event.target.value })
                  }
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-[3px] border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed text-paper outline-none transition-colors focus:border-amber-cue"
                />
              </label>

              {/* Burned-in Caption + B-Roll Search Query + Hold Override */}
              <div className="mt-3 grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-5">
                  <span className="font-tech flex justify-between text-[10px] uppercase tracking-[0.14em] text-ash">
                    <span>Burned-In Lower Third</span>
                    <span>{activeScene.caption.length} ch</span>
                  </span>
                  <input
                    value={activeScene.caption}
                    onChange={(event) =>
                      updateScene(activeScene.id, { caption: event.target.value })
                    }
                    className="mt-1.5 w-full rounded-[3px] border border-line bg-panel px-3 py-2 text-xs font-medium text-paper outline-none transition-colors focus:border-amber-cue"
                  />
                </label>

                <div className="sm:col-span-5">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.14em] text-ash">
                    B-Roll Shot Query
                  </span>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={activeScene.mediaQuery}
                      onChange={(event) =>
                        updateScene(activeScene.id, { mediaQuery: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          setTab("media");
                          setSearch(activeScene.mediaQuery);
                          void searchMedia(activeScene.mediaQuery);
                        }
                      }}
                      placeholder="e.g. barista espresso steam"
                      className="min-w-0 flex-1 rounded-[3px] border border-line bg-panel px-3 py-2 text-xs text-paper outline-none transition-colors focus:border-amber-cue"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTab("media");
                        setSearch(activeScene.mediaQuery);
                        void searchMedia(activeScene.mediaQuery);
                      }}
                      className="rounded-[3px] border border-line bg-inset px-2.5 py-2 font-tech text-[10px] uppercase tracking-wider text-amber-cue transition-colors hover:border-amber-cue"
                    >
                      Match
                    </button>
                  </div>
                </div>

                <label className="block sm:col-span-2">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Min Hold (s)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={45}
                    placeholder="Auto"
                    value={activeScene.duration ?? ""}
                    onChange={(event) =>
                      updateScene(activeScene.id, {
                        duration: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    className="mt-1.5 w-full rounded-[3px] border border-line bg-panel px-2.5 py-2 font-tech text-xs text-paper outline-none transition-colors focus:border-amber-cue"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </section>

        {/* RIGHT PANE: B-Roll Footage Bin / Neural Voice Booth / Master Settings */}
        <section className="flex flex-col border-t border-line bg-panel xl:max-h-[calc(100vh-57px)] xl:border-l xl:border-t-0">
          <div className="grid grid-cols-3 border-b border-line bg-inset">
            {(
              [
                ["media", "B-Roll Bin", Film],
                ["voices", "VO Booth", Volume2],
                ["settings", "Master Specs", Sliders],
              ] as const
            ).map(([key, label, Icon]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 font-tech text-[11px] uppercase tracking-[0.08em] transition-colors ${
                    active
                      ? "border-amber-cue bg-panel font-semibold text-paper"
                      : "border-transparent text-ash hover:text-stone-ink"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto p-3.5">
            {/* TAB 1: MOVING B-ROLL FOOTAGE BIN */}
            {tab === "media" ? (
              <div className="space-y-3">
                {/* Provider selector */}
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex rounded-[2px] border border-line bg-canvas p-0.5 font-tech text-[10px] uppercase">
                    {(
                      [
                        ["all", "All Pools"],
                        ["pexels", "Pexels"],
                        ["pixabay", "Pixabay"],
                      ] as const
                    ).map(([prov, label]) => (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => {
                          setProviderFilter(prov);
                          void searchMedia(search, prov);
                        }}
                        className={`rounded-[2px] px-2 py-1 transition-colors ${
                          providerFilter === prov
                            ? "bg-elevated font-semibold text-amber-cue"
                            : "text-ash hover:text-paper"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="font-tech text-[10px] uppercase text-ash">
                    {mediaSource || "video-only"}
                  </span>
                </div>

                {/* Search input */}
                <div className="flex gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ash" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void searchMedia(search);
                      }}
                      placeholder="Search moving B-roll clips…"
                      className="w-full rounded-[3px] border border-line bg-canvas py-2 pl-8 pr-2.5 text-xs text-paper outline-none transition-colors focus:border-amber-cue"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void searchMedia(search)}
                    className="rounded-[3px] border border-line bg-inset px-3 py-2 font-tech text-[11px] font-medium text-paper transition-colors hover:border-line-strong"
                  >
                    {searching ? "…" : "Find"}
                  </button>
                </div>

                {/* Quick roll filters */}
                <div className="flex flex-wrap gap-1">
                  {QUICK_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        setSearch(topic);
                        void searchMedia(topic);
                      }}
                      className="rounded-[2px] border border-line bg-inset px-2 py-0.5 font-tech text-[10px] uppercase text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
                    >
                      {topic}
                    </button>
                  ))}
                </div>

                <p className="font-tech text-[10px] text-ash">
                  Click any clip to cut into{" "}
                  <span className="text-paper">
                    SC {String(activeIndex + 1).padStart(2, "0")}
                  </span>{" "}
                  · Hover to scrub footage
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {assets.map((asset) => {
                    const isAssigned = activeScene?.mediaId === asset.id;
                    const hovered = hoveredAssetId === asset.id;
                    const clipPreview = pickPreviewUrl(asset);

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => assignMedia(asset)}
                        onMouseEnter={() => setHoveredAssetId(asset.id)}
                        onMouseLeave={() =>
                          setHoveredAssetId((curr) => (curr === asset.id ? null : curr))
                        }
                        className={`group overflow-hidden rounded-[3px] border text-left transition-colors ${
                          isAssigned
                            ? "border-amber-cue bg-elevated"
                            : "border-line bg-inset hover:border-line-strong"
                        }`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-black">
                          {hovered && clipPreview ? (
                            <video
                              src={clipPreview}
                              poster={asset.thumb}
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.thumb}
                              alt={asset.title}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/80 px-1 py-0.5 font-tech text-[9px] text-paper">
                            {formatClock(asset.duration ?? 10)}
                          </span>
                          {isAssigned ? (
                            <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-[2px] bg-amber-cue px-1.5 py-0.5 font-tech text-[9px] font-semibold text-[#14110A]">
                              <Check className="h-2.5 w-2.5" />
                              IN CUE
                            </span>
                          ) : null}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-[11px] font-medium text-paper">
                            {asset.title}
                          </p>
                          <p className="font-tech truncate text-[9px] uppercase text-ash">
                            {asset.provider} · {asset.creator}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* TAB 2: 24KHZ NEURAL VOICE BOOTH */}
            {tab === "voices" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1">
                  {["all", "American", "British", "Australian"].map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setVoiceAccentFilter(acc)}
                      className={`rounded-[2px] px-2 py-1 font-tech text-[10px] uppercase transition-colors ${
                        voiceAccentFilter === acc
                          ? "bg-amber-cue font-semibold text-[#14110A]"
                          : "border border-line bg-inset text-stone-ink hover:text-paper"
                      }`}
                    >
                      {acc}
                    </button>
                  ))}
                </div>

                <p className="font-tech text-[10px] leading-relaxed text-ash">
                  24kHz Microsoft neural voices normalized to -16 LUFS. Audition
                  reads your active cue copy live.
                </p>

                <div className="divide-y divide-line border-y border-line">
                  {filteredVoices.map((voice) => {
                    const selected = project.voice === voice.id;
                    const playing = playingAudioKey === `voice-${voice.id}`;
                    return (
                      <div
                        key={voice.id}
                        className={`flex items-center justify-between gap-2 py-2.5 px-2 transition-colors ${
                          selected ? "bg-elevated" : "hover:bg-inset/60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => updateProjectSetting("voice", voice.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold ${
                                selected ? "text-amber-cue" : "text-paper"
                              }`}
                            >
                              {voice.name}
                            </span>
                            <span className="font-tech text-[10px] uppercase text-ash">
                              {voice.accent} · {voice.gender}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-stone-ink">
                            {voice.style} — {voice.description}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void playSpeechSample(
                              `voice-${voice.id}`,
                              voice.id,
                              activeScene?.narration || voice.previewText,
                            )
                          }
                          className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border border-line bg-canvas px-2.5 font-tech text-[10px] text-stone-ink transition-colors hover:border-amber-cue hover:text-paper"
                        >
                          {playing ? (
                            <>
                              <AudioMeter active />
                              <Square className="h-2.5 w-2.5 fill-current text-amber-cue" />
                            </>
                          ) : (
                            <>
                              <Play className="h-2.5 w-2.5 fill-current" />
                              <span>Test</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* TAB 3: MASTER SEQUENCE SPECS */}
            {tab === "settings" ? (
              <div className="space-y-4">
                <div>
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Deliverable Resolution
                  </span>
                  <div className="space-y-1.5">
                    {RESOLUTION_ORDER.map((opt) => {
                      const active = project.resolution === opt;
                      const info = RESOLUTIONS[opt];
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateProjectSetting("resolution", opt)}
                          className={`flex w-full items-center justify-between rounded-[3px] border px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-amber-cue bg-elevated"
                              : "border-line bg-inset hover:border-line-strong"
                          }`}
                        >
                          <div>
                            <span className="font-tech text-xs font-semibold text-paper">
                              {info.label} {info.role}
                            </span>
                            <span className="block text-[11px] text-stone-ink">
                              {info.note}
                            </span>
                          </div>
                          <span className="font-tech text-[10px] text-amber-cue">
                            {info.spec}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Frame Gate Aspect
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ASPECT_ORDER.map((opt) => {
                      const active = project.aspect === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateProjectSetting("aspect", opt)}
                          className={`flex flex-col items-center gap-1 rounded-[3px] border py-2 font-tech text-xs transition-colors ${
                            active
                              ? "border-amber-cue bg-elevated text-paper"
                              : "border-line bg-inset text-stone-ink hover:text-paper"
                          }`}
                        >
                          <AspectGlyph aspect={opt} className="h-3.5 w-3.5" />
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block">
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Burned-In Caption Styling (libass)
                  </span>
                  <select
                    value={project.style}
                    onChange={(event) =>
                      updateProjectSetting("style", event.target.value as Style)
                    }
                    className="w-full rounded-[3px] border border-line bg-canvas px-3 py-2 text-xs font-medium capitalize text-paper outline-none focus:border-amber-cue"
                  >
                    {STYLES.map((opt) => (
                      <option key={opt} value={opt} className="bg-panel capitalize">
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                      Script Tone
                    </span>
                    <select
                      value={project.tone}
                      onChange={(event) =>
                        updateProjectSetting("tone", event.target.value as Tone)
                      }
                      className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium capitalize text-paper outline-none focus:border-amber-cue"
                    >
                      {TONES.map((opt) => (
                        <option key={opt} value={opt} className="bg-panel capitalize">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                      VO Language
                    </span>
                    <select
                      value={project.language}
                      onChange={(event) =>
                        updateProjectSetting("language", event.target.value)
                      }
                      className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-paper outline-none focus:border-amber-cue"
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.id} value={lang.id} className="bg-panel">
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Target Brief Duration (15–90s)
                  </span>
                  <input
                    type="number"
                    min={15}
                    max={90}
                    value={project.duration}
                    onChange={(event) =>
                      updateProjectSetting(
                        "duration",
                        Math.min(90, Math.max(15, Number(event.target.value) || 30)),
                      )
                    }
                    className="w-full rounded-[3px] border border-line bg-canvas px-3 py-2 font-tech text-xs text-paper outline-none focus:border-amber-cue"
                  />
                </label>

                <div className="rounded-[3px] border border-line bg-inset p-3 font-tech text-[10px] leading-relaxed text-ash">
                  Final master runtime locks to exact spoken neural voiceover
                  length (+0.45s tail pad per cue) so narration is never clipped.
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
