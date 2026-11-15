"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Crosshair,
  Download,
  FileText,
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
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Unlock,
  Users,
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
import AiPanel from "@/components/AiPanel";
import StickmanPreview from "@/components/StickmanPreview";
import { STICK_THEMES, type StickTheme } from "@/lib/stickman";
import { AI_GENERATE_EVENT, parseGenerateIntent } from "@/lib/ai-client";
import {
  loadLocalVideoBlob,
  saveLocalProject,
  saveLocalVideoBlob,
} from "@/lib/client-store";
import { resolveMediaUrl } from "@/lib/media-url";
import { getMusicTrack, MUSIC_TRACKS } from "@/lib/music";
import {
  ASPECT_ORDER,
  ASPECTS,
  CAPTION_MODES,
  CAPTION_POSITIONS,
  LANGUAGES,
  MAX_SCENES,
  MEDIA_FILTERS,
  MEDIA_SPEEDS,
  PEOPLE_REPRESENTATIONS,
  RESOLUTION_ORDER,
  RESOLUTIONS,
  STYLES,
  TONES,
  type AspectRatio,
  type CaptionMode,
  type CaptionPosition,
  type MediaFilter,
  type MusicTrackId,
  type PeopleRepresentation,
  type Project,
  type Resolution,
  type Scene,
  type StockAsset,
  type StockProvider,
  type Style,
  type Tone,
} from "@/lib/types";
import type { Voice } from "@/lib/voices";

type RightTab = "media" | "voices" | "settings" | "ai";
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
  "Use African American cast",
  "Switch to African only",
  "Change voice to British male",
  "Switch to 9:16 vertical",
  "Replace scene 2 with coffee",
  "Make it 1080p",
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
  const [tab, setTab] = useState<RightTab>(
    initialProject.script.options?.visualMode &&
      initialProject.script.options.visualMode !== "stock"
      ? "ai"
      : "media",
  );
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

  // Export & Full Script Editor Modals
  const [exportOpen, setExportOpen] = useState(false);
  const [exportResolution, setExportResolution] = useState<Resolution>(
    initialProject.resolution,
  );
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [bulkScriptText, setBulkScriptText] = useState("");
  const [customVideoUrl, setCustomVideoUrl] = useState("");

  // Voices & Music
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceAccentFilter, setVoiceAccentFilter] = useState<string>("all");
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);

  // Stock Media Bin & Narration Sync
  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [mediaSource, setMediaSource] = useState<string>("");
  const [providerFilter, setProviderFilter] = useState<StockProvider>("all");
  const [search, setSearch] = useState<string>(
    initialProject.script.scenes[0]?.mediaQuery ?? "",
  );
  const [searching, setSearching] = useState(false);
  const [matchingSceneId, setMatchingSceneId] = useState<string | null>(null);
  const [syncingAllMedia, setSyncingAllMedia] = useState(false);
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
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const hydrated = useRef(false);
  const autorunDone = useRef(false);
  const saveSeqRef = useRef(0);
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenes = useMemo(() => project.script.scenes ?? [], [project.script.scenes]);
  const activeIndex = useMemo(() => {
    const idx = scenes.findIndex((scene) => scene.id === activeSceneId);
    return idx >= 0 ? idx : 0;
  }, [scenes, activeSceneId]);
  const activeScene: Scene | null = scenes[activeIndex] ?? null;

  const captionMode: CaptionMode =
    project.script.options?.captionMode ?? "word-highlight";
  const captionPosition: CaptionPosition =
    project.script.options?.captionPosition ?? "bottom";
  const voiceRateOffset = project.script.options?.voiceRateOffset ?? 0;
  const autoMatchMedia = project.script.options?.autoMatchMedia ?? true;
  const peopleRepresentation: PeopleRepresentation =
    project.script.options?.peopleRepresentation ?? "all";
  const musicTrackId: MusicTrackId =
    project.script.options?.musicTrack ?? "cinematic";
  const musicVolume = project.script.options?.musicVolume ?? 0.16;

  const sceneTimings = useMemo(() => {
    return scenes.reduce<
      { id: string; start: number; duration: number; end: number }[]
    >((acc, scene) => {
      const duration = estimateSceneSeconds(scene.narration, scene.duration);
      const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
      acc.push({ id: scene.id, start, duration, end: start + duration });
      return acc;
    }, []);
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
    async (
      query: string,
      provider: StockProvider = providerFilter,
      peopleOverride: PeopleRepresentation = peopleRepresentation,
    ) => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/media/search?q=${encodeURIComponent(query)}&provider=${provider}&people=${encodeURIComponent(peopleOverride)}&limit=24`,
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
    [providerFilter, peopleRepresentation],
  );

  useEffect(() => {
    let active = true;
    const firstQuery = initialProject.script.scenes[0]?.mediaQuery ?? "";
    const initialPeople =
      initialProject.script.options?.peopleRepresentation ?? "all";

    // Always mirror into client-store so navigating back / reloading never loses the project
    saveLocalProject(initialProject);

    fetch("/api/voices")
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data.voices)) setVoices(data.voices);
      })
      .catch(() => undefined);

    fetch(
      `/api/media/search?q=${encodeURIComponent(firstQuery)}&provider=all&people=${encodeURIComponent(initialPeople)}&limit=24`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setAssets(Array.isArray(data.assets) ? data.assets : []);
        setMediaSource(data.source ?? "");
      })
      .catch(() => undefined);

    if (ephemeralMode) {
      void loadLocalVideoBlob(initialProject.id).then((blob) => {
        if (!active || !blob) return;
        const url = URL.createObjectURL(blob);
        setInlineBlobUrl(url);
      });
    }

    return () => {
      active = false;
    };
  }, [initialProject, ephemeralMode]);

  // Apply live trim start & playback speed to the Storyboard monitor video element
  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el || !activeScene) return;
    const speed =
      typeof activeScene.mediaSpeed === "number" && activeScene.mediaSpeed > 0
        ? activeScene.mediaSpeed
        : 1;
    el.playbackRate = speed;
    if (
      typeof activeScene.mediaStart === "number" &&
      activeScene.mediaStart > 0 &&
      el.readyState >= 1
    ) {
      try {
        el.currentTime = activeScene.mediaStart;
      } catch {
        // Ignore seek errors before metadata
      }
    }
  }, [activeScene]);

  // Auto-trigger render when arriving from Home with ?autorun=1
  useEffect(() => {
    if (autorunDone.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autorun") === "1") {
      autorunDone.current = true;
      params.delete("autorun");
      const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", cleanUrl);
      const timer = setTimeout(() => {
        void startMasterRender(initialProject.resolution, initialProject);
      }, 150);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          saveLocalProject({
            ...project,
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
    [project, hasMasterFile, ephemeralMode],
  );

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    // Keep client mirror fresh immediately on every edit
    saveLocalProject(project);
    const timer = setTimeout(() => {
      void persistPatch(
        { script: project.script, title: project.title, prompt: project.prompt },
        true,
      );
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.script, project.title, project.prompt]);

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
        if (data.outputPath) {
          setProject((curr) => ({
            ...curr,
            status: "done",
            outputPath: data.outputPath,
            posterPath: data.posterPath ?? curr.posterPath,
          }));
        } else {
          const refreshed = await fetch(`/api/projects/${project.id}`)
            .then((r) => (r.ok ? r.json() : null))
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
        }
        setHasUnrenderedEdits(false);
        setStoryboardPlaying(false);
        setRenderVersion((v) => v + 1);
        setMonitorMode("master");
      }
    }, 1400);
    return () => clearInterval(timer);
  }, [ephemeralMode, render.status, project.id]);

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

  const matchSceneToNarration = useCallback(
    async (
      sceneId: string,
      narrationText: string,
      captionText?: string,
      forceUnlock = false,
    ) => {
      const clean = narrationText.trim();
      if (!clean && !captionText?.trim()) return;
      setMatchingSceneId(sceneId);
      try {
        const excludeIds = project.script.scenes
          .filter((s) => s.id !== sceneId && s.mediaId)
          .map((s) => s.mediaId as string);
        const res = await fetch("/api/media/match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            narration: clean,
            caption: captionText ?? "",
            topicContext: project.prompt || project.title,
            excludeIds,
            provider: providerFilter,
            peopleRepresentation,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.match) {
          setProject((curr) => ({
            ...curr,
            script: {
              ...curr.script,
              scenes: curr.script.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;
                if (scene.mediaLocked && !forceUnlock) return scene;
                return {
                  ...scene,
                  ...data.match,
                  mediaLocked: forceUnlock ? false : scene.mediaLocked,
                };
              }),
            },
          }));
          if (data.mediaQuery) setSearch(data.mediaQuery);
          if (hasMasterFile) setHasUnrenderedEdits(true);
        }
      } finally {
        setMatchingSceneId((curr) => (curr === sceneId ? null : curr));
      }
    },
    [
      project.script.scenes,
      project.prompt,
      project.title,
      providerFilter,
      peopleRepresentation,
      hasMasterFile,
    ],
  );

  function handleNarrationEdit(scene: Scene, nextNarration: string) {
    updateScene(scene.id, { narration: nextNarration });
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    if (!autoMatchMedia || scene.mediaLocked) return;
    if (nextNarration.trim().split(/\s+/).length < 2) return;
    matchTimerRef.current = setTimeout(() => {
      void matchSceneToNarration(scene.id, nextNarration, scene.caption, false);
    }, 1150);
  }

  async function syncAllScenesToNarration(
    overrideScenes?: Scene[],
    overridePeople?: PeopleRepresentation,
  ) {
    const list = overrideScenes ?? scenes;
    if (list.length === 0 || syncingAllMedia) return;
    const effectivePeople = overridePeople ?? peopleRepresentation;
    setSyncingAllMedia(true);
    setMonitorMode("storyboard");
    try {
      const res = await fetch("/api/media/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topicContext: project.prompt || project.title,
          provider: providerFilter,
          peopleRepresentation: effectivePeople,
          scenes: list.map((s) => ({
            id: s.id,
            narration: s.narration,
            caption: s.caption,
            mediaLocked: Boolean(s.mediaLocked),
            mediaId: s.mediaId,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.matches) {
        setProject((curr) => ({
          ...curr,
          script: {
            ...curr.script,
            scenes: curr.script.scenes.map((scene) => {
              const matched = data.matches[scene.id];
              return matched && !scene.mediaLocked
                ? { ...scene, ...matched }
                : scene;
            }),
          },
        }));
        if (hasMasterFile) setHasUnrenderedEdits(true);
      }
    } finally {
      setSyncingAllMedia(false);
    }
  }

  function addScene() {
    if (scenes.length >= MAX_SCENES) return;
    const unusedAsset =
      assets.find((a) => !scenes.some((s) => s.mediaId === a.id)) ?? assets[0];
    const newScene: Scene = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      narration: "",
      caption: `Scene ${scenes.length + 1}`,
      mediaQuery: unusedAsset?.tags.slice(0, 2).join(" ") ?? "",
      mediaId: unusedAsset?.id ?? null,
      mediaType: "video",
      mediaUrl: unusedAsset ? pickPreviewUrl(unusedAsset) : null,
      mediaThumb: unusedAsset?.thumb ?? null,
      mediaTitle: unusedAsset?.title ?? null,
      mediaCreator: unusedAsset?.creator ?? null,
      mediaProvider: unusedAsset?.provider ?? "pexels",
      mediaStart: 0,
      mediaSpeed: 1,
      mediaFilter: "none",
      mediaLocked: false,
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

  function duplicateScene(sceneId: string) {
    if (scenes.length >= MAX_SCENES) return;
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const clone: Scene = {
      ...scenes[idx],
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mediaLocked: false,
    };
    setMonitorMode("storyboard");
    setProject((curr) => {
      const next = [...curr.script.scenes];
      next.splice(idx + 1, 0, clone);
      return { ...curr, script: { ...curr.script, scenes: next } };
    });
    setActiveSceneId(clone.id);
  }

  function openScriptModal() {
    setBulkScriptText(scenes.map((s) => s.narration.trim()).join("\n\n"));
    setScriptModalOpen(true);
  }

  async function applyBulkScript(syncClipsAfter: boolean) {
    const paragraphs = bulkScriptText
      .split(/\n\s*\n+/)
      .map((block) => block.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_SCENES);
    if (paragraphs.length === 0) return;

    const updatedScenes: Scene[] = paragraphs.map((narration, idx) => {
      const existing = scenes[idx];
      const headline = narration
        .replace(/[.!?,;:]+/g, "")
        .split(/\s+/)
        .slice(0, 5)
        .join(" ");
      if (existing) {
        return {
          ...existing,
          narration,
          caption: existing.caption || headline || `Scene ${idx + 1}`,
          mediaLocked: syncClipsAfter ? false : existing.mediaLocked,
        };
      }
      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        narration,
        caption: headline || `Scene ${idx + 1}`,
        mediaQuery: "",
        mediaId: null,
        mediaType: "video",
        mediaUrl: null,
        mediaThumb: null,
        mediaTitle: null,
        mediaCreator: null,
        mediaProvider: "pexels",
        mediaStart: 0,
        mediaSpeed: 1,
        mediaFilter: "none",
        mediaLocked: false,
        duration: null,
        transition: idx === 0 ? "fade" : "none",
      };
    });

    setProject((curr) => ({
      ...curr,
      script: { ...curr.script, scenes: updatedScenes },
    }));
    setActiveSceneId(updatedScenes[0]?.id ?? "");
    setScriptModalOpen(false);
    setMonitorMode("storyboard");
    if (hasMasterFile) setHasUnrenderedEdits(true);

    if (syncClipsAfter) {
      await syncAllScenesToNarration(updatedScenes);
    }
  }

  function applyCustomVideoUrl() {
    const cleanUrl = customVideoUrl.trim();
    if (!activeScene || !cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    updateScene(activeScene.id, {
      mediaId: `custom-${Date.now()}`,
      mediaType: "video",
      mediaUrl: cleanUrl,
      mediaThumb: null,
      mediaTitle: cleanUrl.split("/").pop()?.split("?")[0] || "Custom Video URL",
      mediaCreator: "Custom URL",
      mediaProvider: "custom",
      mediaLocked: true,
    });
    setCustomVideoUrl("");
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

  function applyAiVisual(sceneId: string, patch: Partial<Scene>) {
    updateScene(sceneId, patch);
    if (hasMasterFile) setHasUnrenderedEdits(true);
  }

  function revertSceneToStock(sceneId: string) {
    const scene = project.script.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    updateScene(sceneId, {
      mediaSource: "stock",
      mediaType: "video",
      mediaUrl: null,
      mediaThumb: null,
      mediaId: null,
      mediaTitle: null,
      mediaCreator: null,
      mediaProvider: null,
      mediaLocked: false,
      stickAction: null,
      aiLipsync: null,
    });
    void matchSceneToNarration(sceneId, scene.narration, scene.caption, true);
  }

  async function rewriteSceneWithInstruction(
    sceneId: string,
    instruction: string,
  ): Promise<string | null> {
    setRewritingSceneId(sceneId);
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, instruction }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.project) {
        const nextProject = data.project as Project;
        setProject(nextProject);
        saveLocalProject(nextProject);
        if (hasMasterFile) setHasUnrenderedEdits(true);
        return typeof data.engine === "string" ? data.engine : "built-in";
      }
      return null;
    } finally {
      setRewritingSceneId(null);
    }
  }

  async function regenerateCue(sceneId: string) {
    setRewritingSceneId(sceneId);
    setMonitorMode("storyboard");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/scenes/${sceneId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.project) {
        const nextProject = data.project as Project;
        setProject(nextProject);
        saveLocalProject(nextProject);
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.project) {
        const nextProject = data.project as Project;
        setProject(nextProject);
        saveLocalProject(nextProject);
        setActiveSceneId(nextProject.script.scenes?.[0]?.id ?? "");
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
      mediaLocked: true,
    });
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
        body: JSON.stringify({
          voiceId,
          text,
          language: project.language,
          rateOffset: voiceRateOffset,
        }),
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
        void saveLocalVideoBlob(targetProject.id, blob);
        const url = URL.createObjectURL(blob);
        setInlineBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        const doneProject: Project = { ...snapshot, status: "done" };
        setProject(doneProject);
        saveLocalProject(doneProject);
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

    // "Generate a video/image of …" requests go to the generative AI panel.
    const intent = parseGenerateIntent(command);
    if (intent) {
      setTab("ai");
      setMonitorMode("storyboard");
      window.dispatchEvent(new CustomEvent(AI_GENERATE_EVENT, { detail: intent }));
      const where =
        intent.target === "all"
          ? "every scene"
          : typeof intent.target === "number"
            ? `scene ${intent.target + 1}`
            : `scene ${activeIndex + 1}`;
      setCommandInput("");
      setCommandFeedback({
        ok: true,
        lines: [
          `Generating AI ${intent.kind} for ${where}${intent.prompt ? `: “${intent.prompt}”` : ""}.`,
          "Progress is shown in the AI tab.",
        ],
      });
      return;
    }

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
              onClick={openScriptModal}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
            >
              <FileText className="h-3 w-3 text-amber-cue" />
              <span>Edit Script</span>
            </button>

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
                {rewritingAll ? "Redrafting…" : "Redraft"}
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void syncAllScenesToNarration()}
                disabled={syncingAllMedia || scenes.length === 0}
                title="Match every unlocked scene's video clip to its narration"
                className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-panel px-2 py-1 font-tech text-[10px] uppercase tracking-wider text-amber-cue transition-colors hover:border-amber-cue disabled:opacity-40"
              >
                {syncingAllMedia ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                <span>Sync Clips</span>
              </button>
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
                      ? "bg-elevated shadow-[inset_2px_0_0_0_#2563EB]"
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
                  className={`relative flex justify-center overflow-hidden border border-line-strong bg-[#0a0a09] ${
                    captionPosition === "top"
                      ? "items-start"
                      : captionPosition === "center"
                        ? "items-center"
                        : "items-end"
                  } ${monitorFrameClass}`}
                >
                  {activeScene?.mediaSource === "stickman" ? (
                    <StickmanPreview
                      key={`${activeScene.id}-${project.script.options?.stickTheme ?? "whiteboard"}-${activeScene.stickAction ?? "auto"}`}
                      narration={activeScene.narration}
                      sceneIndex={activeIndex}
                      action={activeScene.stickAction}
                      theme={project.script.options?.stickTheme ?? "whiteboard"}
                      duration={sceneTimings[activeIndex]?.duration ?? 5}
                      aspect={project.aspect}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : activeScene?.mediaSource === "ai" &&
                  activeScene.mediaType !== "video" &&
                  activeScene.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${activeScene.mediaUrl}-${activeScene.aiMotion ?? "push-in"}`}
                      src={activeScene.mediaUrl}
                      alt={activeScene.aiPrompt ?? activeScene.caption}
                      style={{
                        filter:
                          MEDIA_FILTERS.find(
                            (f) => f.id === (activeScene.mediaFilter ?? "none"),
                          )?.css ?? "none",
                      }}
                      className={`absolute inset-0 h-full w-full object-cover ai-motion-${activeScene.aiMotion ?? "push-in"}`}
                    />
                  ) : activeScene?.mediaUrl ? (
                    <video
                      ref={previewVideoRef}
                      key={activeScene.mediaUrl}
                      src={activeScene.mediaUrl}
                      poster={activeScene.mediaThumb ?? undefined}
                      autoPlay
                      muted
                      loop
                      playsInline
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget;
                        el.playbackRate =
                          typeof activeScene.mediaSpeed === "number" &&
                          activeScene.mediaSpeed > 0
                            ? activeScene.mediaSpeed
                            : 1;
                        if (
                          typeof activeScene.mediaStart === "number" &&
                          activeScene.mediaStart > 0 &&
                          activeScene.mediaStart < (el.duration || 60)
                        ) {
                          el.currentTime = activeScene.mediaStart;
                        }
                      }}
                      style={{
                        filter:
                          MEDIA_FILTERS.find(
                            (f) => f.id === (activeScene.mediaFilter ?? "none"),
                          )?.css ?? "none",
                      }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : activeScene?.mediaThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeScene.mediaThumb}
                      alt={activeScene.caption}
                      style={{
                        filter:
                          MEDIA_FILTERS.find(
                            (f) => f.id === (activeScene.mediaFilter ?? "none"),
                          )?.css ?? "none",
                      }}
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
                  {matchingSceneId === activeScene?.id ? (
                    <span className="inline-flex items-center gap-1 rounded-[2px] bg-amber-cue px-1.5 py-0.5 font-tech text-[10px] font-semibold text-[#14110A]">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Matching clip…
                    </span>
                  ) : null}
                </div>

                {/* Live Caption / Word-Highlight Preview */}
                {captionMode !== "off" && previewSubtitleWords.length > 0 ? (
                  <div
                    className={`relative z-10 flex w-[86%] flex-col items-center text-center ${
                      captionPosition === "top"
                        ? "mt-[9%]"
                        : captionPosition === "center"
                          ? "my-0"
                          : "mb-[8%]"
                    }`}
                  >
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
                  className="accent-[#2563EB]"
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
                    onClick={() => duplicateScene(activeScene.id)}
                    disabled={scenes.length >= MAX_SCENES}
                    title="Duplicate scene"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-line bg-panel text-stone-ink transition-colors hover:text-paper disabled:opacity-30"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void matchSceneToNarration(
                        activeScene.id,
                        activeScene.narration,
                        activeScene.caption,
                        true,
                      )
                    }
                    disabled={matchingSceneId === activeScene.id}
                    title="Find the best stock video matching this narration"
                    className="inline-flex items-center gap-1 rounded-[3px] border border-amber-cue/45 bg-amber-cue/10 px-2.5 py-1 font-tech text-[11px] text-amber-cue transition-colors hover:bg-amber-cue/20 disabled:opacity-45"
                  >
                    {matchingSceneId === activeScene.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    <span>Match Clip</span>
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

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="active-scene-narration"
                    className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash"
                  >
                    Spoken Voiceover Script (drives synced captions, timing & footage)
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-tech text-[10px] text-stone-ink">
                    <input
                      type="checkbox"
                      checked={autoMatchMedia}
                      onChange={(e) =>
                        updateScriptOptions({ autoMatchMedia: e.target.checked })
                      }
                      className="accent-[#2563EB]"
                    />
                    <span>Auto-match clip to narration</span>
                  </label>
                </div>
                <textarea
                  id="active-scene-narration"
                  value={activeScene.narration}
                  onChange={(event) =>
                    handleNarrationEdit(activeScene, event.target.value)
                  }
                  rows={3}
                  placeholder="Write what the narrator should say in this scene — the video clip will automatically match your words…"
                  className="mt-1.5 w-full resize-none rounded-[3px] border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed text-paper outline-none transition-colors focus:border-amber-cue"
                />
              </div>

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

              {/* Per-Scene Media Trim, Speed, Color Grade & Clip Lock Controls */}
              <div className="mt-3 grid gap-3 rounded-[3px] border border-line bg-inset/70 p-3 sm:grid-cols-12 sm:items-end">
                <label className="block sm:col-span-3">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.12em] text-ash">
                    Clip Trim Start (s)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={0.5}
                    value={activeScene.mediaStart ?? 0}
                    onChange={(event) =>
                      updateScene(activeScene.id, {
                        mediaStart: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    className="mt-1 w-full rounded-[3px] border border-line bg-canvas px-2.5 py-1.5 font-tech text-xs text-paper outline-none focus:border-amber-cue"
                  />
                </label>

                <div className="sm:col-span-3">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.12em] text-ash">
                    Clip Speed
                  </span>
                  <div className="mt-1 grid grid-cols-4 rounded-[3px] border border-line bg-canvas p-0.5">
                    {MEDIA_SPEEDS.map((spd) => {
                      const active = (activeScene.mediaSpeed ?? 1) === spd;
                      return (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => updateScene(activeScene.id, { mediaSpeed: spd })}
                          className={`rounded-[2px] py-1 font-tech text-[10px] transition-colors ${
                            active
                              ? "bg-elevated font-semibold text-amber-cue"
                              : "text-stone-ink hover:text-paper"
                          }`}
                        >
                          {spd}x
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block sm:col-span-4">
                  <span className="font-tech block text-[10px] uppercase tracking-[0.12em] text-ash">
                    Color Grade / Look
                  </span>
                  <select
                    value={activeScene.mediaFilter ?? "none"}
                    onChange={(event) =>
                      updateScene(activeScene.id, {
                        mediaFilter: event.target.value as MediaFilter,
                      })
                    }
                    className="mt-1 w-full rounded-[3px] border border-line bg-canvas px-2.5 py-1.5 text-xs text-paper outline-none focus:border-amber-cue"
                  >
                    {MEDIA_FILTERS.map((f) => (
                      <option key={f.id} value={f.id} className="bg-panel">
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateScene(activeScene.id, {
                        mediaLocked: !activeScene.mediaLocked,
                      })
                    }
                    title={
                      activeScene.mediaLocked
                        ? "Clip locked — click to allow auto-matching to narration"
                        : "Clip unlocked — auto-matches when narration changes"
                    }
                    className={`inline-flex w-full items-center justify-center gap-1 rounded-[3px] border px-2 py-1.5 font-tech text-[10px] uppercase transition-colors ${
                      activeScene.mediaLocked
                        ? "border-amber-cue/50 bg-amber-cue/10 text-amber-cue"
                        : "border-line bg-canvas text-stone-ink hover:text-paper"
                    }`}
                  >
                    {activeScene.mediaLocked ? (
                      <>
                        <Lock className="h-3 w-3" />
                        <span>Locked</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3 w-3" />
                        <span>Auto</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* RIGHT PANE: Multi-Site Stock Video Bin / VO & Music Booth / Master Specs */}
        <section className="flex flex-col border-t border-line bg-panel xl:max-h-[calc(100vh-57px)] xl:border-l xl:border-t-0">
          <div className="grid grid-cols-4 border-b border-line bg-inset">
            {(
              [
                ["ai", "AI", Sparkles],
                ["media", "Stock", Film],
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
                {/* People / Cast Filter for B-Roll Bin + Live Re-Sync */}
                <div className="rounded-[3px] border border-line bg-inset/70 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-tech inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-stone-ink">
                      <Users className="h-2.5 w-2.5 text-amber-cue" />
                      <span>People / Cast</span>
                    </span>
                    <span className="font-tech text-[9px] text-ash">
                      No abstract media
                    </span>
                  </div>
                  <select
                    aria-label="People representation filter"
                    value={peopleRepresentation}
                    onChange={(event) => {
                      const nextPeople = event.target.value as PeopleRepresentation;
                      updateScriptOptions({ peopleRepresentation: nextPeople });
                      void searchMedia(search, providerFilter, nextPeople);
                      void syncAllScenesToNarration(scenes, nextPeople);
                    }}
                    className="w-full rounded-[2px] border border-line bg-canvas px-2 py-1.5 text-xs font-medium text-paper outline-none focus:border-amber-cue"
                  >
                    {PEOPLE_REPRESENTATIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-panel text-paper">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

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

                {/* Custom Video URL Paste Bar */}
                <div className="rounded-[3px] border border-line bg-inset/60 p-2">
                  <span className="font-tech mb-1 flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-ash">
                    <Link2 className="h-2.5 w-2.5 text-amber-cue" />
                    <span>Or paste direct MP4 / WebM URL for SC {String(activeIndex + 1).padStart(2, "0")}</span>
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      value={customVideoUrl}
                      onChange={(e) => setCustomVideoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyCustomVideoUrl();
                      }}
                      placeholder="https://…/clip.mp4"
                      className="min-w-0 flex-1 rounded-[2px] border border-line bg-canvas px-2 py-1 font-tech text-[11px] text-paper outline-none focus:border-amber-cue"
                    />
                    <button
                      type="button"
                      onClick={applyCustomVideoUrl}
                      disabled={!customVideoUrl.trim()}
                      className="rounded-[2px] border border-line bg-elevated px-2.5 py-1 font-tech text-[10px] uppercase text-paper hover:border-amber-cue hover:text-amber-cue disabled:opacity-40"
                    >
                      Use
                    </button>
                  </div>
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
                        className="mt-1 w-full accent-[#2563EB]"
                      />
                    </label>
                  ) : null}
                </div>

                {/* Voice Speaking Pace Control */}
                <div className="rounded-[3px] border border-line bg-inset p-3">
                  <div className="flex items-center justify-between font-tech text-[10px]">
                    <span className="uppercase tracking-[0.12em] text-stone-ink">
                      Voiceover Speaking Pace
                    </span>
                    <span className="text-amber-cue">
                      {voiceRateOffset > 0 ? `+${voiceRateOffset}%` : `${voiceRateOffset}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={25}
                    step={5}
                    value={voiceRateOffset}
                    onChange={(e) =>
                      updateScriptOptions({ voiceRateOffset: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full accent-[#2563EB]"
                  />
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
                    Viral finishing
                  </span>
                  <div className="space-y-1.5">
                    {(
                      [
                        ["progressBar", "Progress bar", "Story-style segments across the top keep viewers watching"],
                        ["punchZoom", "Punch-in zoom", "Slow zoom on every video shot so nothing feels static"],
                        ["sceneSfx", "Scene whooshes", "A whoosh sound effect on every scene change"],
                      ] as const
                    ).map(([key, label, hint]) => {
                      const on = Boolean(project.script.options?.[key]);
                      return (
                        <button
                          key={key}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => updateScriptOptions({ [key]: !on })}
                          className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-3 py-2 text-left transition-colors ${
                            on ? "border-amber-cue/60 bg-elevated" : "border-line bg-inset hover:border-line-strong"
                          }`}
                        >
                          <span>
                            <span className="block font-tech text-xs font-semibold text-paper">{label}</span>
                            <span className="block text-[11px] text-stone-ink">{hint}</span>
                          </span>
                          <span
                            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-amber-cue" : "bg-line-strong"}`}
                          >
                            <span
                              className={`absolute top-0.5 h-3 w-3 rounded-full bg-canvas transition-all ${on ? "left-3.5" : "left-0.5"}`}
                            />
                          </span>
                        </button>
                      );
                    })}
                    <label className="flex items-center justify-between gap-3 rounded-[3px] border border-line bg-inset px-3 py-2">
                      <span className="font-tech text-xs font-semibold text-paper">Stickman theme</span>
                      <select
                        value={project.script.options?.stickTheme ?? "whiteboard"}
                        onChange={(event) => updateScriptOptions({ stickTheme: event.target.value as StickTheme })}
                        className="rounded-[3px] border border-line bg-canvas px-2 py-1 text-xs text-paper outline-none focus:border-amber-cue"
                      >
                        {(Object.keys(STICK_THEMES) as StickTheme[]).map((id) => (
                          <option key={id} value={id} className="bg-panel">
                            {STICK_THEMES[id]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

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

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                      Caption Theme
                    </span>
                    <select
                      value={project.style}
                      onChange={(event) =>
                        updateProjectSetting("style", event.target.value as Style)
                      }
                      className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs font-medium capitalize text-paper outline-none focus:border-amber-cue"
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
                      Caption Position
                    </span>
                    <div className="grid grid-cols-3 rounded-[3px] border border-line bg-canvas p-0.5">
                      {CAPTION_POSITIONS.map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() =>
                            updateScriptOptions({ captionPosition: pos.id })
                          }
                          className={`rounded-[2px] py-1.5 font-tech text-[10px] transition-colors ${
                            captionPosition === pos.id
                              ? "bg-elevated font-semibold text-amber-cue"
                              : "text-stone-ink hover:text-paper"
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="font-tech mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-ash">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3 text-amber-cue" />
                      People / Cast Representation
                    </span>
                    <span>Real footage only</span>
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PEOPLE_REPRESENTATIONS.map((opt) => {
                      const active = peopleRepresentation === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            updateScriptOptions({ peopleRepresentation: opt.id });
                            void searchMedia(search, providerFilter, opt.id);
                            void syncAllScenesToNarration(scenes, opt.id);
                          }}
                          className={`rounded-[3px] border px-2.5 py-2 text-left transition-colors ${
                            active
                              ? "border-amber-cue bg-elevated text-paper"
                              : "border-line bg-inset text-stone-ink hover:border-line-strong hover:text-paper"
                          }`}
                        >
                          <span className="font-tech block text-[11px] font-semibold">
                            {opt.shortLabel}
                          </span>
                          <span className="block truncate text-[10px] text-ash">
                            {opt.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

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

                {/* Editable Project Brief / Prompt */}
                <div className="border-t border-line pt-3">
                  <label className="block">
                    <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                      Original Brief / Prompt (editable)
                    </span>
                    <textarea
                      value={project.prompt}
                      onChange={(event) =>
                        setProject((curr) => ({ ...curr, prompt: event.target.value }))
                      }
                      rows={3}
                      className="w-full resize-none rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs leading-relaxed text-paper outline-none focus:border-amber-cue"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={rewritingAll}
                    onClick={() => void rewriteWholeScript()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[3px] border border-line bg-inset px-3 py-2 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
                  >
                    <RefreshCw className={`h-3 w-3 ${rewritingAll ? "animate-spin" : ""}`} />
                    <span>Regenerate All Scenes from Brief</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* AI panel stays mounted so a batch keeps generating on other tabs */}
            <div className={tab === "ai" ? "" : "hidden"}>
              <AiPanel
                project={project}
                activeScene={activeScene}
                activeIndex={activeIndex}
                onApplyVisual={applyAiVisual}
                onRevertToStock={revertSceneToStock}
                onRewriteScene={rewriteSceneWithInstruction}
                onSelectScene={(sceneId) => {
                  setActiveSceneId(sceneId);
                  setMonitorMode("storyboard");
                }}
                onUpdateOptions={updateScriptOptions}
              />
            </div>
          </div>
        </section>
      </div>

      {/* FULL SCRIPT BULK EDITOR MODAL */}
      {scriptModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-[2px]"
          onClick={() => setScriptModalOpen(false)}
        >
          <div
            className="console-surface flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[4px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-3">
              <div>
                <h2 className="font-tech text-xs font-semibold uppercase tracking-[0.14em] text-paper">
                  Edit Full Video Script
                </h2>
                <p className="font-tech text-[10px] text-ash">
                  Separate scenes with a blank line · Every scene gets synced footage & captions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                aria-label="Close script editor"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-line text-stone-ink hover:text-paper"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <label className="block">
                <span className="font-tech mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ash">
                  Full Spoken Script (one paragraph per scene, up to {MAX_SCENES} scenes)
                </span>
                <textarea
                  value={bulkScriptText}
                  onChange={(e) => setBulkScriptText(e.target.value)}
                  rows={14}
                  placeholder="Scene 1 narration paragraph…&#10;&#10;Scene 2 narration paragraph…&#10;&#10;Scene 3 narration paragraph…"
                  className="w-full resize-y rounded-[3px] border border-line bg-canvas p-3.5 text-sm leading-relaxed text-paper outline-none focus:border-amber-cue"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-inset px-4 py-3">
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="rounded-[3px] border border-line bg-panel px-3.5 py-2 font-tech text-[11px] uppercase text-stone-ink hover:text-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyBulkScript(false)}
                className="rounded-[3px] border border-line bg-elevated px-3.5 py-2 font-tech text-[11px] font-medium uppercase text-paper hover:border-line-strong"
              >
                Save Script Only
              </button>
              <button
                type="button"
                onClick={() => void applyBulkScript(true)}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-4 py-2 font-tech text-[11px] font-semibold uppercase tracking-[0.06em] text-[#14110A] hover:bg-amber-hover"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>Apply & Match Clips to Narration</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
