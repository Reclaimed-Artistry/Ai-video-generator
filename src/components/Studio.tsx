"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Crosshair,
  Download,
  Film,
  Link2,
  Loader2,
  Lock,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Square,
  Terminal,
  Trash2,
  Unlock,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AspectGlyph,
  AudioMeter,
  BrandMark,
  countWords,
  estimateSceneSeconds,
  formatClock,
  formatSmpte,
} from "@/components/BrandMark";
import { saveLocalProject } from "@/lib/client-store";
import { narrationFingerprint, sceneNarrationText } from "@/lib/fingerprint";
import { resolveMediaUrl } from "@/lib/media-url";
import { getMusicTrack, MUSIC_TRACKS } from "@/lib/music";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  LANGUAGES,
  MAX_SCENES,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  STYLES,
  TONES,
  type AspectRatio,
  type CaptionMode,
  type MusicTrackId,
  type Project,
  type Resolution,
  type Scene,
  type StockAsset,
  type StockProvider,
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

const QUICK_TOPICS = [
  "city",
  "technology",
  "coffee",
  "ocean",
  "fitness",
  "business",
  "nature",
  "space",
];

const COMMAND_EXAMPLES = [
  "Change voice to British male",
  "Switch to 9:16 vertical",
  "Replace scene 2 with ocean waves",
  "Add cinematic music",
  "Make it 1080p",
  "Turn off captions",
];

function pickPreviewUrl(asset: StockAsset): string | null {
  if (!asset.sources.length) return null;
  const sorted = [...asset.sources].sort(
    (a, b) => (a.height ?? 540) - (b.height ?? 540),
  );
  const mid = sorted.find((source) => (source.height ?? 540) >= 360) ?? sorted[0];
  return mid?.url ?? null;
}

function computeDimensions(resolution: Resolution, aspect: AspectRatio): string {
  const base = RESOLUTIONS[resolution];
  const ratio = ASPECTS[aspect].ratio;
  const short = Math.min(base.width, base.height);
  const width =
    ratio >= 1 ? Math.round((short * ratio) / 2) * 2 : Math.round(short / 2) * 2;
  const height =
    ratio >= 1 ? Math.round(short / 2) * 2 : Math.round(short / ratio / 2) * 2;
  return `${width}×${height}`;
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
      return "bg-black/75 px-3 py-1 text-paper";
  }
}

export default function Studio({
  initialProject,
  ephemeralMode = false,
}: {
  initialProject: Project;
  ephemeralMode?: boolean;
}) {
  const [project, setProject] = useState<Project>(initialProject);
  const [inlineBlobUrl, setInlineBlobUrl] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string>(
    initialProject.script.scenes[0]?.id ?? "",
  );
  const [tab, setTab] = useState<RightTab>("media");
  const [monitorMode, setMonitorMode] = useState<MonitorMode>(
    initialProject.status === "done" ? "master" : "storyboard",
  );
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [hasUnrenderedEdits, setHasUnrenderedEdits] = useState(false);
  const [storyboardPlaying, setStoryboardPlaying] = useState(false);

  // Command Box (InVideo Magic Box)
  const [commandInput, setCommandInput] = useState("");
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandAutoRender, setCommandAutoRender] = useState(true);
  const [commandFeedback, setCommandFeedback] = useState<{
    ok: boolean;
    lines: string[];
  } | null>(null);

  // Export Modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportResolution, setExportResolution] = useState<Resolution>(
    initialProject.resolution,
  );

  // Voices & Music
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceAccentFilter, setVoiceAccentFilter] = useState<string>("all");
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);

  // Stock Media Bin
  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [mediaSource, setMediaSource] = useState<string>("");
  const [providerFilter, setProviderFilter] = useState<StockProvider>("all");
  const [search, setSearch] = useState<string>(
    initialProject.script.scenes[0]?.mediaQuery ?? "",
  );
  const [searching, setSearching] = useState(false);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);

  // Persistence & Render state
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
  const [matchingSceneIds, setMatchingSceneIds] = useState<string[]>([]);
  const [customUrlDraft, setCustomUrlDraft] = useState("");
  const [footageError, setFootageError] = useState<string | null>(null);
  const matchInFlight = useRef<Set<string>>(new Set());
  const projectRef = useRef(project);
  const autoRenderRequested = useRef(false);
  const hydrated = useRef(false);
  const saveSeqRef = useRef(0);

  const scenes = useMemo(() => project.script.scenes ?? [], [project.script.scenes]);
  const activeIndex = useMemo(() => {
    const idx = scenes.findIndex((scene) => scene.id === activeSceneId);
    return idx >= 0 ? idx : 0;
  }, [scenes, activeSceneId]);
  const activeScene: Scene | null = scenes[activeIndex] ?? null;

  const captionMode: CaptionMode =
    project.script.options?.captionMode ?? "word-highlight";
  const musicTrackId: MusicTrackId =
    project.script.options?.musicTrack ?? "cinematic";
  const musicVolume = project.script.options?.musicVolume ?? 0.16;

  const sceneTimings = useMemo(() => {
    const timings: { id: string; start: number; duration: number; end: number }[] = [];
    let cursor = 0;
    for (const scene of scenes) {
      const duration = estimateSceneSeconds(scene.narration, scene.duration);
      timings.push({ id: scene.id, start: cursor, duration, end: cursor + duration });
      cursor += duration;
    }
    return timings;
  }, [scenes]);

  const totalEstimatedSeconds = useMemo(
    () => sceneTimings.reduce((acc, item) => acc + item.duration, 0),
    [sceneTimings],
  );

  const totalWords = useMemo(
    () => scenes.reduce((acc, scene) => acc + countWords(scene.narration), 0),
    [scenes],
  );

  const hasMasterFile = Boolean(inlineBlobUrl) || Boolean(project.outputPath) || render.status === "done";

  const searchMedia = useCallback(
    async (query: string, provider: StockProvider = providerFilter) => {
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

    // Defer the first B-roll search so no state is set synchronously in the effect.
    const firstQuery = initialProject.script.scenes[0]?.mediaQuery ?? "";
    void Promise.resolve().then(() => searchMedia(firstQuery, "all"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Footage follows the narration: shortly after narration changes, every
  // unlocked scene whose clip was matched to older text is re-matched.
  useEffect(() => {
    const stale = scenes.filter((scene) => {
      const text = sceneNarrationText(scene);
      return !scene.mediaLocked && text && scene.mediaMatchedFor !== narrationFingerprint(text);
    });
    if (stale.length === 0) return;
    const timer = setTimeout(() => {
      void (async () => {
        for (const scene of stale) await rematchScene(scene.id);
      })();
    }, 1400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // Multi-scene Storyboard auto-step playback
  useEffect(() => {
    if (!storyboardPlaying || monitorMode !== "storyboard" || scenes.length === 0) {
      return;
    }
    const currentDurMs = Math.max(
      1800,
      Math.round((sceneTimings[activeIndex]?.duration ?? 4) * 1000),
    );
    const timer = setTimeout(() => {
      const nextIdx = activeIndex + 1;
      if (nextIdx >= scenes.length) {
        setStoryboardPlaying(false);
        setActiveSceneId(scenes[0].id);
      } else {
        setActiveSceneId(scenes[nextIdx].id);
      }
    }, currentDurMs);
    return () => clearTimeout(timer);
  }, [storyboardPlaying, monitorMode, activeIndex, scenes, sceneTimings]);

  const persistPatch = useCallback(
    async (patch: Record<string, unknown>, marksRenderDirty = true) => {
      const seq = ++saveSeqRef.current;
      setSaving(true);
      if (marksRenderDirty && hasMasterFile) {
        setHasUnrenderedEdits(true);
      }
      try {
        if (ephemeralMode) {
          // Read the latest project via ref: a captured `project` here would be
          // stale and could overwrite newer edits in browser storage.
          saveLocalProject({
            ...projectRef.current,
            ...(patch as Partial<Project>),
            updatedAt: new Date().toISOString(),
          });
          setSavedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          );
          return;
        }
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
    [project.id, hasMasterFile, ephemeralMode],
  );

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

  // Poll FFmpeg encode status while active
  useEffect(() => {
    if (ephemeralMode || render.status !== "rendering") return;
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
            resolution: refreshed.project.resolution,
            outputPath: refreshed.project.outputPath,
            posterPath: refreshed.project.posterPath,
          }));
        }
        setHasUnrenderedEdits(false);
        setStoryboardPlaying(false);
        setRenderVersion((v) => v + 1);
        setMonitorMode("master");
      }
    }, 1400);
    return () => clearInterval(timer);
  }, [render.status, project.id, ephemeralMode]);

  function updateProjectSetting<K extends keyof Project>(
    key: K,
    value: Project[K],
  ) {
    setProject((curr) => ({ ...curr, [key]: value }));
    if (key === "resolution") setExportResolution(value as Resolution);
    if (key === "aspect" || key === "style") {
      setMonitorMode("storyboard");
    }
    void persistPatch({ [key]: value }, true);
  }

  function updateScriptOptions(patch: Partial<NonNullable<Project["script"]["options"]>>) {
    setProject((curr) => ({
      ...curr,
      script: {
        ...curr.script,
        options: {
          ...curr.script.options,
          ...patch,
        },
      },
    }));
    if (hasMasterFile) setHasUnrenderedEdits(true);
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
      mediaStart: 0,
      // A clip chosen by hand is never auto-replaced when narration changes.
      mediaLocked: true,
      mediaMatchedFor: narrationFingerprint(sceneNarrationText(activeScene)),
    });
  }

  /** Re-pick a scene's clip from its narration (skips locked scenes unless forced). */
  async function rematchScene(sceneId: string, force = false) {
    const current = projectRef.current.script.scenes.find((scene) => scene.id === sceneId);
    if (!current || matchInFlight.current.has(sceneId)) return;
    if (current.mediaLocked && !force) return;
    const narration = sceneNarrationText(current);
    if (!narration) return;
    const requestedFor = narrationFingerprint(narration);

    matchInFlight.current.add(sceneId);
    setMatchingSceneIds((ids) => [...ids, sceneId]);
    setFootageError(null);
    try {
      const excludeIds = projectRef.current.script.scenes
        .filter((scene) => scene.id !== sceneId)
        .map((scene) => scene.mediaId)
        .filter((clipId): clipId is string => Boolean(clipId));
      const response = await fetch("/api/media/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          narration: current.narration,
          caption: current.caption,
          topic: projectRef.current.prompt,
          excludeIds,
          currentQuery: current.mediaQuery,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        media?: Partial<Scene>;
        error?: string;
      };
      if (!response.ok || !data.media) throw new Error(data.error ?? "Could not match footage");

      // Ignore a late answer if the narration changed again or the user locked a clip.
      const latest = projectRef.current.script.scenes.find((scene) => scene.id === sceneId);
      if (!latest || (latest.mediaLocked && !force)) return;
      if (narrationFingerprint(sceneNarrationText(latest)) !== requestedFor) return;
      updateScene(sceneId, { ...data.media, mediaMatchedFor: requestedFor, mediaLocked: false });
    } catch (error) {
      setFootageError(error instanceof Error ? error.message : "Could not match footage");
    } finally {
      matchInFlight.current.delete(sceneId);
      setMatchingSceneIds((ids) => ids.filter((id) => id !== sceneId));
    }
  }

  function applyCustomVideoUrl(sceneId: string) {
    const url = customUrlDraft.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setFootageError("Paste a direct video link starting with https:// (MP4 or WebM).");
      return;
    }
    const target = scenes.find((scene) => scene.id === sceneId);
    updateScene(sceneId, {
      mediaId: null,
      mediaType: "video",
      mediaUrl: url,
      mediaThumb: null,
      mediaTitle: "Your video",
      mediaCreator: null,
      mediaProvider: "custom",
      mediaStart: 0,
      mediaLocked: true,
      mediaMatchedFor: target ? narrationFingerprint(sceneNarrationText(target)) : null,
    });
    setCustomUrlDraft("");
    setFootageError(null);
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingAudioKey(null);
  }

  async function playSpeechSample(key: string, voiceId: string, text?: string) {
    if (playingAudioKey === key) {
      stopAudio();
      return;
    }
    try {
      stopAudio();
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

  async function playMusicSample(trackId: MusicTrackId) {
    const key = `music-${trackId}`;
    if (playingAudioKey === key) {
      stopAudio();
      return;
    }
    const track = getMusicTrack(trackId);
    if (!track.url) return;
    try {
      stopAudio();
      setPlayingAudioKey(key);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = track.url;
      audioRef.current.volume = 0.45;
      audioRef.current.onended = () => setPlayingAudioKey(null);
      audioRef.current.onerror = () => setPlayingAudioKey(null);
      await audioRef.current.play();
    } catch {
      setPlayingAudioKey(null);
    }
  }

  // Opened with ?autorender=1 (browser-only projects): start the render here,
  // where the full project snapshot is available to send to the server.
  useEffect(() => {
    if (autoRenderRequested.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autorender") !== "1") return;
    autoRenderRequested.current = true;
    params.delete("autorender");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    const timer = setTimeout(() => void startMasterRender(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startMasterRender(overrideResolution?: Resolution, overrideProject?: Project) {
    const targetProject = overrideProject ?? project;
    const targetResolution = overrideResolution ?? targetProject.resolution;

    if (overrideResolution && overrideResolution !== project.resolution) {
      setProject((curr) => ({ ...curr, resolution: overrideResolution }));
    }

    setExportOpen(false);
    setStoryboardPlaying(false);
    setRender({
      status: "rendering",
      progress: 2,
      stage: `Encoding ${targetResolution} H.264 master…`,
      error: null,
    });

    const snapshot: Project = { ...targetProject, resolution: targetResolution };
    if (ephemeralMode) {
      saveLocalProject(snapshot);
      setRender({
        status: "rendering",
        progress: 35,
        stage: `Encoding ${targetResolution} H.264 master (15–45s)…`,
        error: null,
      });
    } else {
      await fetch(`/api/projects/${targetProject.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: targetProject.title,
          script: targetProject.script,
          voice: targetProject.voice,
          resolution: targetResolution,
          aspect: targetProject.aspect,
          tone: targetProject.tone,
          style: targetProject.style,
          language: targetProject.language,
          duration: targetProject.duration,
        }),
      }).catch(() => undefined);
    }

    try {
      const response = await fetch(`/api/projects/${targetProject.id}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: snapshot }),
      });
      const ct = response.headers.get("content-type") ?? "";
      if (response.ok && ct.includes("video/mp4")) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setInlineBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setRender({ status: "done", progress: 100, stage: "Master ready", error: null });
        setHasUnrenderedEdits(false);
        setRenderVersion((v) => v + 1);
        setMonitorMode("master");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setRender({
          status: "error",
          progress: 0,
          stage: "Encode aborted",
          error: data.error ?? `Render failed (HTTP ${response.status})`,
        });
      }
    } catch (cause) {
      setRender({
        status: "error",
        progress: 0,
        stage: "Encode aborted",
        error: cause instanceof Error ? cause.message : "Render request failed",
      });
    }
  }

  async function submitEditCommand(rawCmd?: string) {
    const command = (rawCmd ?? commandInput).trim();
    if (!command || commandRunning) return;
    setCommandRunning(true);
    setCommandFeedback(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, project }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCommandFeedback({
          ok: false,
          lines: [data.error ?? "Command could not be applied."],
        });
        return;
      }
      const updated = data.project as Project;
      setProject(updated);
      setExportResolution(updated.resolution);
      if (
        updated.script.scenes.length > 0 &&
        !updated.script.scenes.some((s) => s.id === activeSceneId)
      ) {
        setActiveSceneId(updated.script.scenes[0].id);
      }
      setCommandInput("");
      setCommandFeedback({
        ok: true,
        lines: Array.isArray(data.changes) ? data.changes : ["Updated sequence"],
      });
      setHasUnrenderedEdits(true);

      if (commandAutoRender && render.status !== "rendering") {
        void startMasterRender(updated.resolution, updated);
      } else {
        setMonitorMode("storyboard");
      }
    } finally {
      setCommandRunning(false);
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
    inlineBlobUrl ??
    resolveMediaUrl(
      project.outputPath,
      `renders/${project.id}/output.mp4`,
      renderVersion,
    ) ??
    `/api/files/renders/${project.id}/output.mp4?v=${renderVersion}`;
  const downloadUrl =
    inlineBlobUrl ??
    resolveMediaUrl(project.outputPath, `renders/${project.id}/output.mp4`) ??
    `/api/files/renders/${project.id}/output.mp4`;
  const posterUrl = inlineBlobUrl
    ? undefined
    : resolveMediaUrl(
        project.posterPath,
        `renders/${project.id}/poster.jpg`,
        renderVersion,
      ) ?? undefined;
  const activeTiming = sceneTimings[activeIndex] ?? { start: 0, duration: 5, end: 5 };

  const monitorFrameClass =
    project.aspect === "9:16"
      ? "aspect-[9/16] h-[340px] sm:h-[395px]"
      : project.aspect === "1:1"
        ? "aspect-square h-[320px] sm:h-[375px]"
        : "aspect-video w-full max-h-[395px]";

  // Preview caption words for Storyboard mode
  const previewSubtitleWords = useMemo(() => {
    if (!activeScene) return [];
    const sourceText =
      captionMode === "headline"
        ? activeScene.caption
        : activeScene.narration || activeScene.caption;
    return sourceText.trim().split(/\s+/).slice(0, 6);
  }, [activeScene, captionMode]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-paper">
      {/* Top NLE Transport & Sequence Bar */}
      {ephemeralMode ? (
        <div className="border-b border-amber-cue/30 bg-amber-cue/10 px-4 py-2 text-center font-tech text-[11px] text-[#f0d9a8]">
          No database connected: this sequence is saved only in this browser. To keep
          sequences on every device, open Vercel → Storage → create Neon Postgres,
          connect it to this project and redeploy.
        </div>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
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
                className="w-52 max-w-full truncate rounded-[2px] bg-transparent px-1 py-0.5 text-sm font-semibold text-paper outline-none ring-1 ring-transparent transition focus:bg-inset focus:ring-amber-cue sm:w-72"
              />
              <div className="font-tech flex items-center gap-2 px-1 text-[10px] text-ash">
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      saving ? "bg-amber-cue" : "bg-nominal"
                    }`}
                  />
                  {saving ? "Syncing…" : savedAt ? `Saved ${savedAt}` : "Synced"}
                </span>
                <span>·</span>
                <span>{scenes.length} cues</span>
                <span>·</span>
                <span>~{formatClock(totalEstimatedSeconds)}</span>
                <span className="hidden md:inline">·</span>
                <span className="hidden md:inline">
                  Score: {getMusicTrack(musicTrackId).name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Resolution Switcher */}
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

            {/* Aspect Gate Switcher */}
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
              <span className="hidden lg:inline">
                {rewritingAll ? "Redrafting…" : "Redraft Script"}
              </span>
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
                  <span>Generating {render.progress}%</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  <span>
                    {hasMasterFile && !hasUnrenderedEdits
                      ? `Re-render ${project.resolution}`
                      : `Generate ${project.resolution}`}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setExportResolution(project.resolution);
                setExportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-nominal/45 bg-nominal/10 px-3 py-1.5 font-tech text-[11px] font-medium text-nominal transition-colors hover:bg-nominal/20"
            >
              <Download className="h-3 w-3" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {render.error ? (
          <div className="border-t border-tally/40 bg-tally/10 px-4 py-2 font-tech text-xs text-[#f4b4a8]">
            ENCODE ERR // {render.error}
          </div>
        ) : null}
      </header>

      {/* Main 3-Pane NLE Workbench */}
      <div className="grid flex-1 xl:grid-cols-[320px_minmax(0,1fr)_390px]">
        {/* LEFT PANE: Scene Rundown */}
        <section className="flex flex-col border-b border-line bg-panel xl:max-h-[calc(100vh-57px)] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-line bg-inset px-3.5 py-2.5">
            <div>
              <h2 className="font-tech text-[11px] font-semibold uppercase tracking-[0.14em] text-paper">
                Script & Scenes
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
              <span>Scene</span>
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
                    <span
                      className={
                        selected ? "font-semibold text-amber-cue" : "text-stone-ink"
                      }
                    >
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
                      {scene.mediaProvider ? (
                        <span className="absolute bottom-0.5 right-0.5 rounded-[1px] bg-black/80 px-1 font-tech text-[8px] uppercase text-stone-ink">
                          {scene.mediaProvider}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-paper">
                        {scene.caption || `Scene ${index + 1}`}
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

        {/* CENTER PANE: Program Monitor + AI Command Box + Timeline + Cue Editor */}
        <section className="flex min-w-0 flex-col bg-canvas xl:max-h-[calc(100vh-57px)] xl:overflow-y-auto">
          {/* Monitor Bezel Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
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
                  Storyboard
                </button>
                <button
                  type="button"
                  disabled={!hasMasterFile}
                  onClick={() => {
                    setStoryboardPlaying(false);
                    setMonitorMode("master");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    monitorMode === "master"
                      ? "bg-elevated font-semibold text-nominal"
                      : "text-ash hover:text-paper"
                  }`}
                >
                  <span>Rendered Video</span>
                  {hasUnrenderedEdits && hasMasterFile ? (
                    <span
                      title="Edits pending re-render"
                      className="h-1.5 w-1.5 rounded-full bg-amber-cue"
                    />
                  ) : null}
                </button>
              </div>

              {monitorMode === "storyboard" && render.status !== "rendering" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStoryboardPlaying((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-1 font-tech text-[10px] uppercase tracking-wider transition-colors ${
                      storyboardPlaying
                        ? "border-amber-cue bg-amber-cue/15 text-amber-cue"
                        : "border-line bg-canvas text-stone-ink hover:text-paper"
                    }`}
                  >
                    {storyboardPlaying ? (
                      <>
                        <Pause className="h-3 w-3" />
                        <span>Stop Cut</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        <span>Play Storyboard</span>
                      </>
                    )}
                  </button>
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
                    <span>Guides</span>
                  </button>
                </>
              ) : null}
            </div>

            <div className="font-tech flex items-center gap-3 text-[11px]">
              <span className="text-ash">
                {computeDimensions(project.resolution, project.aspect)} · {project.resolution}
              </span>
              <span className="timecode text-amber-cue">
                {monitorMode === "master"
                  ? formatSmpte(masterTime)
                  : formatSmpte(activeTiming.start)}
              </span>
            </div>
          </div>

          {/* Program Monitor Bay */}
          <div className="relative flex items-center justify-center border-b border-line bg-[#060605] p-4 sm:p-5">
            {render.status === "rendering" ? (
              <div
                className={`relative flex flex-col items-center justify-center overflow-hidden border border-line-strong bg-[#0c0c0a] p-6 text-center ${monitorFrameClass}`}
              >
                {activeScene?.mediaThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeScene.mediaThumb}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
                  />
                ) : null}
                <div className="relative z-10 w-full max-w-md space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-[2px] border border-tally/40 bg-black/75 px-2.5 py-1 font-tech text-[10px] uppercase tracking-[0.14em] text-[#f9c6bd]">
                    <span className="tally-dot h-2 w-2 rounded-full bg-tally" />
                    <span>Rendering {project.resolution} Master</span>
                  </div>
                  <p className="font-editorial text-2xl text-paper">
                    Assembling voiceover, footage & synced captions…
                  </p>
                  <p className="font-tech text-xs text-stone-ink">
                    {render.stage || "Preparing FFmpeg pipeline…"}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-line">
                    <div
                      className="h-full bg-amber-cue transition-[width] duration-300"
                      style={{ width: `${Math.max(4, render.progress)}%` }}
                    />
                  </div>
                  <p className="font-tech text-[11px] text-amber-cue">
                    {render.progress}% complete · auto-plays when finished
                  </p>
                </div>
              </div>
            ) : monitorMode === "master" && hasMasterFile ? (
              <div
                className={`relative overflow-hidden border border-line bg-black ${monitorFrameClass}`}
              >
                <video
                  key={outputUrl}
                  src={outputUrl}
                  poster={posterUrl}
                  controls
                  autoPlay={renderVersion > 0}
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

                {showSafeGuides ? (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-[5%] border border-dashed border-white/25" />
                    <div className="absolute inset-[10%] border border-amber-cue/40" />
                    <div className="absolute bottom-[8%] left-1/2 top-[8%] w-px bg-white/15" />
                    <div className="absolute left-[8%] right-[8%] top-1/2 h-px bg-white/15" />
                  </div>
                ) : null}

                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
                  <span className="rounded-[2px] bg-black/80 px-1.5 py-0.5 font-tech text-[10px] text-amber-cue">
                    SC {String(activeIndex + 1).padStart(2, "0")}/
                    {String(scenes.length).padStart(2, "0")}
                  </span>
                  {activeScene?.mediaTitle ? (
                    <span className="max-w-[230px] truncate rounded-[2px] bg-black/80 px-1.5 py-0.5 font-tech text-[10px] text-stone-ink">
                      {activeScene.mediaTitle}
                    </span>
                  ) : null}
                </div>

                {/* Live Caption / Word-Highlight Preview */}
                {captionMode !== "off" && previewSubtitleWords.length > 0 ? (
                  <div className="relative z-10 mb-[8%] flex w-[86%] flex-col items-center text-center">
                    <span
                      className={`text-sm font-semibold leading-snug sm:text-base ${captionPreviewClasses(
                        project.style,
                      )}`}
                    >
                      {captionMode === "word-highlight"
                        ? previewSubtitleWords.map((word, idx) => (
                            <span
                              key={`${word}-${idx}`}
                              className={idx === 1 ? "text-amber-cue" : undefined}
                            >
                              {idx > 0 ? " " : ""}
                              {word}
                            </span>
                          ))
                        : previewSubtitleWords.join(" ")}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* INVIDEO-STYLE AI EDIT COMMAND BOX ("Direct the Cut") */}
          <div className="border-b border-line bg-panel px-4 py-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-tech text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-cue">
                <Terminal className="h-3 w-3" />
                <span>AI Edit Command Box</span>
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 font-tech text-[10px] text-stone-ink">
                <input
                  type="checkbox"
                  checked={commandAutoRender}
                  onChange={(e) => setCommandAutoRender(e.target.checked)}
                  className="accent-[#E5A93C]"
                />
                <span>Auto re-render after command</span>
              </label>
            </div>

            <div className="flex gap-2">
              <input
                value={commandInput}
                onChange={(event) => setCommandInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitEditCommand();
                  }
                }}
                disabled={commandRunning}
                placeholder="Give a command to edit this video — e.g. 'Change voice to British male', 'Replace scene 2 with ocean waves', 'Make it 1080p'…"
                className="min-w-0 flex-1 rounded-[3px] border border-line bg-canvas px-3 py-2 text-xs text-paper outline-none transition-colors placeholder:text-ash focus:border-amber-cue"
              />
              <button
                type="button"
                onClick={() => void submitEditCommand()}
                disabled={commandRunning || !commandInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-elevated px-3.5 py-2 font-tech text-[11px] font-semibold uppercase tracking-[0.06em] text-paper shadow-[inset_0_0_0_1px_#3a3832] transition-colors hover:bg-amber-cue hover:text-[#14110A] disabled:opacity-40"
              >
                {commandRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                <span>Apply</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {COMMAND_EXAMPLES.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  disabled={commandRunning}
                  onClick={() => void submitEditCommand(cmd)}
                  className="rounded-[2px] border border-line bg-inset px-2 py-0.5 font-tech text-[10px] text-stone-ink transition-colors hover:border-amber-cue/60 hover:text-paper disabled:opacity-40"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {commandFeedback ? (
              <div
                className={`mt-2 rounded-[2px] border px-2.5 py-1.5 font-tech text-[11px] ${
                  commandFeedback.ok
                    ? "border-nominal/35 bg-nominal/10 text-nominal"
                    : "border-tally/40 bg-tally/10 text-[#f4b4a8]"
                }`}
              >
                {commandFeedback.ok ? "APPLIED // " : "NOTE // "}
                {commandFeedback.lines.join(" · ")}
              </div>
            ) : null}
          </div>

          {/* Proportional Timeline Filmstrip */}
          <div className="border-b border-line bg-inset/60 px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between font-tech text-[10px] text-ash">
              <span>TIMELINE // CLICK CUE TO EDIT</span>
              <span>TOTAL ~{formatSmpte(totalEstimatedSeconds)}</span>
            </div>
            <div className="flex h-11 gap-1 overflow-x-auto">
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
                    Script & Media Editor
                  </h3>
                  <span className="font-tech text-[11px] text-ash">
                    {countWords(activeScene.narration)} words · ~
                    {activeTiming.duration.toFixed(1)}s
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
                        <span>Audition ({selectedVoiceObj?.name ?? project.voice})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => moveScene(activeScene.id, -1)}
                    disabled={activeIndex === 0}
                    title="Move earlier"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-stone-ink transition-colors hover:text-paper disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveScene(activeScene.id, 1)}
                    disabled={activeIndex === scenes.length - 1}
                    title="Move later"
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
                        rewritingSceneId === activeScene.id
                          ? "animate-spin text-amber-cue"
                          : ""
                      }`}
                    />
                    <span>Rewrite</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeScene(activeScene.id)}
                    disabled={scenes.length <= 1}
                    title="Delete scene"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-ash transition-colors hover:border-tally/50 hover:text-tally disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
                  Spoken Voiceover Script (drives synced captions & timing)
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

              <div className="mt-3 grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-4">
                  <span className="font-tech flex justify-between text-[10px] uppercase tracking-[0.14em] text-ash">
                    <span>Scene Headline</span>
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
                    Stock Video Search Query
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
                      placeholder="e.g. ocean waves, coffee barista"
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
                      Find
                    </button>
                  </div>
                </div>

                <label className="block sm:col-span-3">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Transition / Hold
                  </span>
                  <div className="mt-1.5 flex gap-1.5">
                    <select
                      aria-label="Scene transition"
                      value={activeScene.transition}
                      onChange={(e) =>
                        updateScene(activeScene.id, {
                          transition: e.target.value as "fade" | "none",
                        })
                      }
                      className="w-1/2 rounded-[3px] border border-line bg-panel px-2 py-2 font-tech text-[11px] text-paper outline-none focus:border-amber-cue"
                    >
                      <option value="none" className="bg-panel">Cut</option>
                      <option value="fade" className="bg-panel">Fade</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={45}
                      placeholder="Auto"
                      title="Minimum hold duration in seconds"
                      value={activeScene.duration ?? ""}
                      onChange={(event) =>
                        updateScene(activeScene.id, {
                          duration: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      className="w-1/2 rounded-[3px] border border-line bg-panel px-2 py-2 font-tech text-[11px] text-paper outline-none focus:border-amber-cue"
                    />
                  </div>
                </label>
              </div>

              {/* Scene footage: follows the narration unless the clip is locked */}
              {(() => {
                const isMatching = matchingSceneIds.includes(activeScene.id);
                const inSync =
                  activeScene.mediaMatchedFor ===
                  narrationFingerprint(sceneNarrationText(activeScene));
                const status = isMatching
                  ? { label: "Matching footage to narration…", tone: "text-amber-cue border-amber-cue/40" }
                  : activeScene.mediaLocked
                    ? { label: "Locked · your pick", tone: "text-paper border-line-strong" }
                    : inSync
                      ? { label: "Matches narration", tone: "text-nominal border-nominal/40" }
                      : { label: "Narration changed · re-matching", tone: "text-amber-cue border-amber-cue/40" };
                return (
                  <div className="mt-4 rounded-[3px] border border-line bg-inset p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
                        Scene Footage
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-tech text-[10px] uppercase tracking-wider ${status.tone}`}
                      >
                        {isMatching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-2.5 grid gap-3 sm:grid-cols-[168px_minmax(0,1fr)]">
                      <div className="relative aspect-video overflow-hidden rounded-[2px] border border-line bg-black">
                        {activeScene.mediaUrl ? (
                          <video
                            key={`${activeScene.mediaUrl}#${activeScene.mediaStart ?? 0}`}
                            src={`${activeScene.mediaUrl}#t=${Math.max(0, activeScene.mediaStart ?? 0)}`}
                            poster={activeScene.mediaThumb ?? undefined}
                            muted
                            loop
                            autoPlay
                            playsInline
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-ash">
                            <Film className="h-4 w-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-2.5">
                        <div>
                          <p className="truncate text-xs font-medium text-paper">
                            {activeScene.mediaTitle || "No clip yet"}
                          </p>
                          <p className="truncate font-tech text-[10px] uppercase text-ash">
                            {activeScene.mediaProvider ?? "stock"}
                            {activeScene.mediaCreator ? ` · ${activeScene.mediaCreator}` : ""}
                            {activeScene.mediaQuery ? ` · “${activeScene.mediaQuery}”` : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void rematchScene(activeScene.id, true)}
                            disabled={isMatching || !sceneNarrationText(activeScene)}
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-panel px-2.5 py-1 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-40"
                          >
                            <Wand2 className="h-3 w-3" />
                            Re-match to narration
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateScene(activeScene.id, {
                                mediaLocked: !activeScene.mediaLocked,
                                // Unlocking makes the clip follow the narration again.
                                mediaMatchedFor: activeScene.mediaLocked
                                  ? null
                                  : narrationFingerprint(sceneNarrationText(activeScene)),
                              })
                            }
                            title={
                              activeScene.mediaLocked
                                ? "Unlock: footage will follow the narration again"
                                : "Lock: keep this clip even if the narration changes"
                            }
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-panel px-2.5 py-1 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
                          >
                            {activeScene.mediaLocked ? (
                              <Unlock className="h-3 w-3" />
                            ) : (
                              <Lock className="h-3 w-3" />
                            )}
                            {activeScene.mediaLocked ? "Unlock clip" : "Lock clip"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTab("media");
                              const query = activeScene.mediaQuery || sceneNarrationText(activeScene);
                              setSearch(query);
                              void searchMedia(query);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-panel px-2.5 py-1 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
                          >
                            <Search className="h-3 w-3" />
                            Browse clips
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <label className="block">
                            <span className="font-tech block text-[10px] uppercase tracking-[0.14em] text-ash">
                              Start at (s)
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={activeScene.mediaStart ?? 0}
                              onChange={(event) =>
                                updateScene(activeScene.id, {
                                  mediaStart: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                              className="mt-1 w-full rounded-[3px] border border-line bg-panel px-2 py-1.5 font-tech text-[11px] text-paper outline-none focus:border-amber-cue"
                            />
                          </label>
                          <div>
                            <span className="font-tech block text-[10px] uppercase tracking-[0.14em] text-ash">
                              Use my own video (direct MP4/WebM link)
                            </span>
                            <div className="mt-1 flex gap-1.5">
                              <input
                                value={customUrlDraft}
                                onChange={(event) => setCustomUrlDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") applyCustomVideoUrl(activeScene.id);
                                }}
                                placeholder="https://…/clip.mp4"
                                className="min-w-0 flex-1 rounded-[3px] border border-line bg-panel px-2.5 py-1.5 text-[11px] text-paper outline-none placeholder:text-ash focus:border-amber-cue"
                              />
                              <button
                                type="button"
                                onClick={() => applyCustomVideoUrl(activeScene.id)}
                                className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-panel px-2.5 py-1.5 font-tech text-[10px] uppercase tracking-wider text-amber-cue transition-colors hover:border-amber-cue"
                              >
                                <Link2 className="h-3 w-3" />
                                Use
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {footageError ? (
                      <p className="mt-2 font-tech text-[11px] text-[#f4b4a8]">{footageError}</p>
                    ) : (
                      <p className="mt-2 text-[11px] leading-relaxed text-ash">
                        Edit the narration and this scene&apos;s footage is re-matched to what is said.
                        Pick a clip yourself (or lock this one) to keep it fixed.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </section>

        {/* RIGHT PANE: Multi-Site Stock Video Bin / VO & Music Booth / Master Specs */}
        <section className="flex flex-col border-t border-line bg-panel xl:max-h-[calc(100vh-57px)] xl:border-l xl:border-t-0">
          <div className="grid grid-cols-3 border-b border-line bg-inset">
            {(
              [
                ["media", "Stock Video", Film],
                ["voices", "VO & Music", Volume2],
                ["settings", "Settings", Sliders],
              ] as const
            ).map(([key, label, Icon]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 font-tech text-[11px] uppercase tracking-[0.06em] transition-colors ${
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
            {/* TAB 1: MULTI-SITE MOVING STOCK VIDEO BIN */}
            {tab === "media" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      ["all", "All Sites"],
                      ["pexels", "Pexels"],
                      ["mixkit", "Mixkit"],
                      ["wikimedia", "Wikimedia"],
                      ["nasa", "NASA"],
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
                      className={`rounded-[2px] px-2 py-1 font-tech text-[10px] uppercase transition-colors ${
                        providerFilter === prov
                          ? "bg-amber-cue font-semibold text-[#14110A]"
                          : "border border-line bg-inset text-stone-ink hover:text-paper"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ash" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void searchMedia(search);
                      }}
                      placeholder="Search Pexels, Mixkit, Wikimedia, NASA…"
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

                <div className="flex items-center justify-between font-tech text-[10px] text-ash">
                  <span>
                    Click clip →{" "}
                    <span className="text-paper">
                      SC {String(activeIndex + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span className="uppercase">{mediaSource || "video-only"}</span>
                </div>

                {searching ? (
                  <div className="grid place-items-center py-10 font-tech text-xs text-stone-ink">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-cue" />
                      Searching stock video libraries…
                    </span>
                  </div>
                ) : assets.length === 0 ? (
                  <div className="rounded-[3px] border border-line bg-inset p-4 text-center font-tech text-xs text-stone-ink">
                    No clips matched “{search}” on {providerFilter}. Try another term or switch to All Sites.
                  </div>
                ) : (
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
                            setHoveredAssetId((curr) =>
                              curr === asset.id ? null : curr,
                            )
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
                            <span className="absolute bottom-1 right-1 rounded-[2px] bg-black/80 px-1 py-0.5 font-tech text-[8px] uppercase text-stone-ink">
                              {asset.provider}
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
                              {asset.creator}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {/* TAB 2: NEURAL VOICES & ROYALTY-FREE BACKGROUND MUSIC MIXER */}
            {tab === "voices" ? (
              <div className="space-y-5">
                {/* Background Music Bed Section */}
                <div className="rounded-[3px] border border-line bg-inset p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-tech text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-cue">
                      <Music className="h-3 w-3" />
                      <span>Background Music Score</span>
                    </span>
                    <span className="font-tech text-[10px] text-stone-ink">
                      Mix: {Math.round(musicVolume * 100)}%
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    {MUSIC_TRACKS.map((track) => {
                      const active = musicTrackId === track.id;
                      const playing = playingAudioKey === `music-${track.id}`;
                      return (
                        <div
                          key={track.id}
                          className={`flex items-center justify-between gap-2 rounded-[2px] border px-2.5 py-1.5 transition-colors ${
                            active
                              ? "border-amber-cue bg-elevated"
                              : "border-line bg-panel hover:border-line-strong"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              updateScriptOptions({ musicTrack: track.id })
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="flex items-center gap-2 text-xs font-medium text-paper">
                              <span className={active ? "text-amber-cue" : undefined}>
                                {track.name}
                              </span>
                              <span className="font-tech text-[9px] uppercase text-ash">
                                {track.mood}
                              </span>
                            </p>
                          </button>
                          {track.url ? (
                            <button
                              type="button"
                              onClick={() => void playMusicSample(track.id)}
                              className="inline-flex h-6 items-center gap-1 rounded-[2px] border border-line bg-canvas px-2 font-tech text-[10px] text-stone-ink hover:border-amber-cue hover:text-paper"
                            >
                              {playing ? (
                                <>
                                  <AudioMeter active />
                                  <Square className="h-2.5 w-2.5 fill-current text-amber-cue" />
                                </>
                              ) : (
                                <Play className="h-2.5 w-2.5 fill-current" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {musicTrackId !== "none" ? (
                    <label className="mt-2.5 block">
                      <div className="flex justify-between font-tech text-[10px] text-ash">
                        <span>Music bed level under voiceover</span>
                        <span className="text-paper">
                          {Math.round(musicVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={38}
                        value={Math.round(musicVolume * 100)}
                        onChange={(e) =>
                          updateScriptOptions({
                            musicVolume: Number(e.target.value) / 100,
                          })
                        }
                        className="mt-1 w-full accent-[#E5A93C]"
                      />
                    </label>
                  ) : null}
                </div>

                {/* Neural Voices Section */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-tech text-[10px] font-semibold uppercase tracking-[0.14em] text-paper">
                      24kHz Neural Narrators
                    </span>
                    <div className="flex gap-1">
                      {["all", "American", "British", "Australian"].map((acc) => (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => setVoiceAccentFilter(acc)}
                          className={`rounded-[2px] px-1.5 py-0.5 font-tech text-[9px] uppercase transition-colors ${
                            voiceAccentFilter === acc
                              ? "bg-amber-cue font-semibold text-[#14110A]"
                              : "border border-line bg-inset text-stone-ink hover:text-paper"
                          }`}
                        >
                          {acc === "all" ? "All" : acc.slice(0, 2)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-line border-y border-line">
                    {filteredVoices.map((voice) => {
                      const selected = project.voice === voice.id;
                      const playing = playingAudioKey === `voice-${voice.id}`;
                      return (
                        <div
                          key={voice.id}
                          className={`flex items-center justify-between gap-2 px-2 py-2.5 transition-colors ${
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
              </div>
            ) : null}

            {/* TAB 3: MASTER SEQUENCE SPECS */}
            {tab === "settings" ? (
              <div className="space-y-4">
                <div>
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Subtitle / Caption Mode
                  </span>
                  <div className="space-y-1.5">
                    {CAPTION_MODES.map((mode) => {
                      const active = captionMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            updateScriptOptions({ captionMode: mode.id })
                          }
                          className={`block w-full rounded-[3px] border px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-amber-cue bg-elevated"
                              : "border-line bg-inset hover:border-line-strong"
                          }`}
                        >
                          <span className="font-tech text-xs font-semibold text-paper">
                            {mode.label}
                          </span>
                          <span className="block text-[11px] text-stone-ink">
                            {mode.note}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block">
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Caption Theme (libass)
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

                <div>
                  <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                    Export Resolution
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
                            {computeDimensions(opt, project.aspect)}
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
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* DEDICATED EXPORT MODAL (240p / 360p / 1080p) */}
      {exportOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-[2px]"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="console-surface w-full max-w-lg rounded-[4px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-3">
              <div>
                <h2 className="font-tech text-xs font-semibold uppercase tracking-[0.14em] text-paper">
                  Export Master MP4
                </h2>
                <p className="font-tech text-[10px] text-ash">
                  H.264 High · AAC-LC 160k · -16 LUFS ·{" "}
                  {ASPECTS[project.aspect].shortLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                aria-label="Close export modal"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-line text-stone-ink hover:text-paper"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <span className="font-tech mb-2 block text-[10px] uppercase tracking-[0.14em] text-ash">
                  Select Export Resolution
                </span>
                <div className="space-y-2">
                  {RESOLUTION_ORDER.map((res) => {
                    const info = RESOLUTIONS[res];
                    const selected = exportResolution === res;
                    const estMB = Math.max(
                      0.4,
                      (totalEstimatedSeconds * info.estMbps) / 8,
                    ).toFixed(1);
                    return (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setExportResolution(res)}
                        className={`flex w-full items-center justify-between rounded-[3px] border px-3.5 py-2.5 text-left transition-colors ${
                          selected
                            ? "border-amber-cue bg-elevated"
                            : "border-line bg-inset hover:border-line-strong"
                        }`}
                      >
                        <div>
                          <span className="font-tech text-sm font-semibold text-paper">
                            {info.label}
                          </span>
                          <span className="ml-2 text-xs text-stone-ink">
                            {info.role} — {info.note}
                          </span>
                        </div>
                        <div className="text-right font-tech text-[10px]">
                          <span className="block text-amber-cue">
                            {computeDimensions(res, project.aspect)}
                          </span>
                          <span className="text-ash">~{estMB} MB</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 rounded-[3px] border border-line bg-inset p-3 font-tech text-[11px]">
                <div>
                  <dt className="text-[10px] uppercase text-ash">Voiceover</dt>
                  <dd className="text-paper">
                    {selectedVoiceObj?.name ?? project.voice} ({project.language.toUpperCase()})
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-ash">Music Score</dt>
                  <dd className="text-paper">{getMusicTrack(musicTrackId).name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-ash">Subtitles</dt>
                  <dd className="text-paper">
                    {CAPTION_MODES.find((c) => c.id === captionMode)?.label}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-ash">Runtime</dt>
                  <dd className="text-paper">
                    ~{formatClock(totalEstimatedSeconds)} ({scenes.length} cues)
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {hasMasterFile &&
                !hasUnrenderedEdits &&
                exportResolution === project.resolution ? (
                  <a
                    href={downloadUrl}
                    download={`reclaimed-artistry-${project.id.slice(0, 8)}-${project.resolution}.mp4`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-nominal px-4 py-2.5 font-tech text-xs font-semibold uppercase tracking-[0.08em] text-[#08130C] transition-opacity hover:opacity-90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download {project.resolution} MP4 Now</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  disabled={render.status === "rendering"}
                  onClick={() => void startMasterRender(exportResolution)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-amber-cue px-4 py-2.5 font-tech text-xs font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>
                    {hasMasterFile && exportResolution === project.resolution
                      ? `Re-render ${exportResolution} MP4`
                      : `Render ${exportResolution} MP4`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
