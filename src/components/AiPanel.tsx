"use client";

import {
  Check,
  Clapperboard,
  ImagePlus,
  Loader2,
  Mic,
  PersonStanding,
  Upload,
  RefreshCw,
  Sparkles,
  Square,
  Undo2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_GENERATE_EVENT,
  generateSceneImage,
  generateSceneVideo,
  VideoUnavailableError,
  withRetry,
  type AiStatus,
  type GenerateIntent,
} from "@/lib/ai-client";
import {
  STICK_ACTIONS,
  STICK_THEMES,
  stickThumbDataUrl,
  type StickAction,
  type StickTheme,
} from "@/lib/stickman";
import {
  AI_MOTIONS,
  AI_STYLE_ORDER,
  AI_STYLES,
  aiKindForMode,
  type AiKind,
  type AiMotion,
  type AiStyleId,
  type Project,
  type Scene,
} from "@/lib/types";

type Props = {
  project: Project;
  activeScene: Scene | null;
  activeIndex: number;
  onApplyVisual: (sceneId: string, patch: Partial<Scene>) => void;
  onRevertToStock: (sceneId: string) => void;
  onRewriteScene: (sceneId: string, instruction: string) => Promise<string | null>;
  onSelectScene: (sceneId: string) => void;
  onUpdateOptions: (patch: Partial<NonNullable<Project["script"]["options"]>>) => void;
};

type PanelKind = AiKind | "stickman";

type GenerateOptions = {
  kind: AiKind;
  prompt: string;
  style: AiStyleId;
  motion: AiMotion;
  newSeed: boolean;
  signal: AbortSignal;
};

const MOTION_ORDER: AiMotion[] = ["push-in", "pan-right", "pull-out", "pan-left"];

function engineName(provider: string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "pollinations") return "Pollinations";
  if (provider === "pollinations-free") return "Pollinations (free)";
  return "built-in engine";
}

function shortModel(model: string): string {
  return model.split("/").pop() || model;
}

export default function AiPanel({
  project,
  activeScene,
  activeIndex,
  onApplyVisual,
  onRevertToStock,
  onRewriteScene,
  onSelectScene,
  onUpdateOptions,
}: Props) {
  const scenes = project.script.scenes;
  const defaultStyle: AiStyleId = project.script.options?.aiStyle ?? "cinematic";

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [kind, setKind] = useState<PanelKind>(
    project.script.options?.visualMode === "stickman"
      ? "stickman"
      : aiKindForMode(project.script.options?.visualMode) ?? "video",
  );
  const stickTheme: StickTheme = project.script.options?.stickTheme ?? "whiteboard";
  const [stickAction, setStickAction] = useState<StickAction | "auto">("auto");
  const [characterUrl, setCharacterUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [animating, setAnimating] = useState<"motion" | "lipsync" | null>(null);
  const [prompt, setPrompt] = useState(activeScene?.aiPrompt ?? "");
  const [style, setStyle] = useState<AiStyleId>(activeScene?.aiStyle ?? defaultStyle);
  const [motion, setMotion] = useState<AiMotion>(
    activeScene?.aiMotion ?? MOTION_ORDER[activeIndex % MOTION_ORDER.length],
  );
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<AiKind>("video");
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [batch, setBatch] = useState<{ done: number; total: number; current: number } | null>(null);
  const batchAbort = useRef<AbortController | null>(null);
  const singleAbort = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);

  const [instruction, setInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteNote, setRewriteNote] = useState<string | null>(null);

  const videoReady = status ? status.video === "pollinations" : true;

  useEffect(() => {
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((data: AiStatus) => setStatus(data))
      .catch(() => undefined);
  }, []);

  // Load the selected scene's prompt/style/motion when the selection changes
  // (adjusting state during render, as React recommends, instead of an effect).
  const [syncedSceneId, setSyncedSceneId] = useState(activeScene?.id ?? null);
  if (activeScene && activeScene.id !== syncedSceneId) {
    setSyncedSceneId(activeScene.id);
    setPrompt(activeScene.aiPrompt ?? "");
    setStyle(activeScene.aiStyle ?? defaultStyle);
    setMotion(activeScene.aiMotion ?? MOTION_ORDER[activeIndex % MOTION_ORDER.length]);
    setRewriteNote(null);
  }

  /**
   * Generate a visual for one scene. Video is attempted first when asked;
   * without a video provider it falls back to a motion shot from an AI image.
   */
  const generateFor = useCallback(
    async (scene: Scene, opts: GenerateOptions): Promise<void> => {
      const base = {
        style: opts.style,
        aspect: project.aspect,
        projectId: project.id,
        signal: opts.signal,
        seed: opts.newSeed || !scene.aiSeed ? undefined : scene.aiSeed,
      };

      if (opts.kind === "video") {
        try {
          const clip = await withRetry(
            () => generateSceneVideo({ ...base, prompt: opts.prompt }),
            setWaitSeconds,
            opts.signal,
          );
          onApplyVisual(scene.id, {
            mediaSource: "ai",
            mediaType: "video",
            mediaUrl: clip.url,
            mediaThumb: clip.thumbUrl,
            mediaId: `ai-video-${clip.seed}`,
            mediaTitle: `AI video · ${shortModel(clip.model)}`,
            mediaCreator: engineName(clip.provider),
            mediaProvider: "ai",
            mediaLocked: true,
            mediaSpeed: null,
            mediaStart: null,
            aiPrompt: opts.prompt,
            aiStyle: opts.style,
            aiSeed: clip.seed,
          });
          return;
        } catch (err) {
          if (!(err instanceof VideoUnavailableError)) throw err;
          setNotice(
            "No AI video key is configured, so this is a motion shot made from an AI image. Add POLLINATIONS_API_KEY for real AI video.",
          );
        }
      }

      const image = await withRetry(
        () => generateSceneImage({ ...base, prompt: opts.prompt }),
        setWaitSeconds,
        opts.signal,
      );
      onApplyVisual(scene.id, {
        mediaSource: "ai",
        mediaType: "photo",
        mediaUrl: image.url,
        mediaThumb: image.url,
        mediaId: `ai-${image.seed}`,
        mediaTitle: `AI image · ${AI_STYLES[opts.style].label}`,
        mediaCreator: engineName(image.provider),
        mediaProvider: "ai",
        mediaLocked: true,
        aiPrompt: opts.prompt,
        aiStyle: opts.style,
        aiMotion: opts.motion,
        aiSeed: image.seed,
      });
    },
    [project.aspect, project.id, onApplyVisual],
  );

  const generateSingle = useCallback(
    async (scene: Scene, opts: Omit<GenerateOptions, "signal">) => {
      if (opts.prompt.trim().length < 3) {
        setError("Describe the shot you want first.");
        return;
      }
      singleAbort.current?.abort();
      const ctrl = new AbortController();
      singleAbort.current = ctrl;
      setBusySceneId(scene.id);
      setBusyKind(opts.kind);
      setError(null);
      try {
        await generateFor(scene, { ...opts, signal: ctrl.signal });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setError(err instanceof Error ? err.message : "Generation failed");
        }
      } finally {
        setBusySceneId(null);
        setWaitSeconds(0);
      }
    },
    [generateFor],
  );

  const applyStickman = useCallback(
    (scene: Scene, action: StickAction | "auto") => {
      const index = scenes.findIndex((s) => s.id === scene.id);
      onApplyVisual(scene.id, {
        mediaSource: "stickman",
        mediaType: "video",
        mediaUrl: null,
        mediaThumb: stickThumbDataUrl(scene.narration, index, stickTheme, action === "auto" ? null : action),
        mediaId: `stickman-${index + 1}`,
        mediaTitle: "Stickman animation",
        mediaCreator: "Built-in animation engine",
        mediaProvider: "stickman",
        mediaLocked: true,
        aiLipsync: null,
        stickAction: action === "auto" ? null : action,
      });
    },
    [scenes, stickTheme, onApplyVisual],
  );

  const applyStickmanAll = useCallback(() => {
    scenes.forEach((scene) => applyStickman(scene, "auto"));
    setNotice("Every scene now uses the built-in stickman animation (lip-synced to the voiceover at render).");
  }, [scenes, applyStickman]);

  async function uploadCharacter(file: File) {
    setUploading(true);
    setError(null);
    try {
      const response = await fetch(`/api/media/upload?projectId=${encodeURIComponent(project.id)}`, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      setCharacterUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const animateCharacter = useCallback(
    async (scene: Scene, mode: "motion" | "lipsync", imageOverride?: string | null) => {
      const imageUrl =
        imageOverride ??
        characterUrl ??
        (scene.mediaSource === "ai" && scene.mediaType !== "video" ? scene.mediaUrl : null);
      if (!imageUrl) {
        setError("Upload a character image or generate an AI image for this scene first.");
        return;
      }
      singleAbort.current?.abort();
      const ctrl = new AbortController();
      singleAbort.current = ctrl;
      setAnimating(mode);
      setBusySceneId(scene.id);
      setBusyKind("video");
      setError(null);
      try {
        const clip = await withRetry(
          async () => {
            const response = await fetch("/api/ai/animate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              signal: ctrl.signal,
              body: JSON.stringify({
                mode,
                imageUrl,
                prompt: prompt.trim() || scene.aiPrompt || "",
                aspect: project.aspect,
                projectId: project.id,
                narration: scene.narration,
                voice: project.voice,
                language: project.language,
              }),
            });
            const data = (await response.json().catch(() => ({}))) as {
              url?: string;
              thumbUrl?: string | null;
              seed?: number;
              model?: string;
              error?: string;
              retryAfter?: number;
            };
            if (response.status === 429) {
              const { RateLimitError } = await import("@/lib/ai-client");
              throw new RateLimitError(data.error ?? "The video service is busy.", data.retryAfter ?? 30);
            }
            if (!response.ok || !data.url) throw new Error(data.error ?? "Animation failed");
            return data as { url: string; thumbUrl?: string | null; seed?: number; model?: string };
          },
          setWaitSeconds,
          ctrl.signal,
        );
        onApplyVisual(scene.id, {
          mediaSource: "ai",
          mediaType: "video",
          mediaUrl: clip.url,
          mediaThumb: clip.thumbUrl ?? imageUrl,
          mediaId: `ai-${mode}-${clip.seed ?? 0}`,
          mediaTitle: `${mode === "lipsync" ? "Talking character" : "Animated image"} · ${shortModel(clip.model ?? "")}`,
          mediaCreator: "Pollinations",
          mediaProvider: "ai",
          mediaLocked: true,
          mediaSpeed: null,
          mediaStart: null,
          aiLipsync: mode === "lipsync",
          aiSeed: clip.seed ?? null,
        });
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : "Animation failed");
      } finally {
        setAnimating(null);
        setBusySceneId(null);
        setWaitSeconds(0);
      }
    },
    [characterUrl, prompt, project.aspect, project.id, project.voice, project.language, onApplyVisual],
  );

  const runBatch = useCallback(
    async (onlyMissing: boolean, batchKind: AiKind, promptOverride?: string | null) => {
      const targets = scenes.filter((s) => !onlyMissing || s.mediaSource !== "ai");
      if (targets.length === 0) return;
      batchAbort.current?.abort();
      const ctrl = new AbortController();
      batchAbort.current = ctrl;
      setError(null);
      setBusyKind(batchKind);
      setBatch({ done: 0, total: targets.length, current: 0 });
      let done = 0;
      for (const scene of targets) {
        if (ctrl.signal.aborted) break;
        const index = scenes.findIndex((s) => s.id === scene.id);
        setBatch({ done, total: targets.length, current: index });
        setBusySceneId(scene.id);
        try {
          await generateFor(scene, {
            kind: batchKind,
            prompt: promptOverride?.trim() || scene.aiPrompt?.trim() || scene.narration,
            style: scene.aiStyle ?? defaultStyle,
            motion: scene.aiMotion ?? MOTION_ORDER[index % MOTION_ORDER.length],
            newSeed: true,
            signal: ctrl.signal,
          });
          done += 1;
          setBatch({ done, total: targets.length, current: index });
        } catch (err) {
          if (ctrl.signal.aborted) break;
          setError(
            `Scene ${index + 1}: ${err instanceof Error ? err.message : "generation failed"} (it keeps its current visual).`,
          );
        }
      }
      setBusySceneId(null);
      setWaitSeconds(0);
      setBatch(null);
    },
    [scenes, defaultStyle, generateFor],
  );

  // Requests typed into the AI edit box ("generate a video of …").
  const intentHandler = useRef<(intent: GenerateIntent) => void>(() => undefined);
  useEffect(() => {
    intentHandler.current = (intent: GenerateIntent) => {
      if (intent.kind === "stickman") {
        setKind("stickman");
        if (intent.target === "all") {
          applyStickmanAll();
        } else {
          const target = typeof intent.target === "number" ? scenes[intent.target] : activeScene;
          if (target) {
            onSelectScene(target.id);
            applyStickman(target, "auto");
          }
        }
        return;
      }
      if (intent.kind === "lipsync") {
        const target = typeof intent.target === "number" ? scenes[intent.target] : activeScene;
        if (!target) return;
        onSelectScene(target.id);
        void animateCharacter(target, "lipsync");
        return;
      }
      const genKind: AiKind = intent.kind;
      setKind(genKind);
      if (intent.target === "all") {
        void runBatch(false, genKind, intent.prompt);
        return;
      }
      const scene =
        typeof intent.target === "number" ? scenes[intent.target] ?? null : activeScene;
      if (!scene) {
        setError(`There is no scene ${Number(intent.target) + 1} in this video.`);
        return;
      }
      onSelectScene(scene.id);
      const scenePrompt = intent.prompt || scene.aiPrompt || scene.narration;
      setPrompt(scenePrompt);
      const index = scenes.findIndex((s) => s.id === scene.id);
      void generateSingle(scene, {
        kind: genKind,
        prompt: scenePrompt,
        style: scene.aiStyle ?? defaultStyle,
        motion: scene.aiMotion ?? MOTION_ORDER[index % MOTION_ORDER.length],
        newSeed: true,
      });
    };
  });
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<GenerateIntent>).detail;
      if (detail) intentHandler.current(detail);
    };
    window.addEventListener(AI_GENERATE_EVENT, listener);
    return () => window.removeEventListener(AI_GENERATE_EVENT, listener);
  }, []);

  // Projects created with AI visuals start generating right away.
  useEffect(() => {
    if (autoStarted.current) return;
    const modeKind = aiKindForMode(project.script.options?.visualMode);
    if (!modeKind) return;
    if (scenes.length === 0 || scenes.some((s) => s.mediaSource === "ai")) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      void runBatch(true, modeKind);
    }, 400);
    return () => clearTimeout(timer);
  }, [project.script.options?.visualMode, scenes, runBatch]);

  useEffect(
    () => () => {
      batchAbort.current?.abort();
      singleAbort.current?.abort();
    },
    [],
  );

  async function rewrite() {
    if (!activeScene) return;
    setRewriting(true);
    setRewriteNote(null);
    try {
      const engine = await onRewriteScene(activeScene.id, instruction);
      if (engine) {
        setRewriteNote(
          engine === "built-in"
            ? "Rewritten with the built-in engine (AI writer unavailable right now)."
            : `Rewritten by ${engineName(engine)}.`,
        );
        setInstruction("");
      }
    } finally {
      setRewriting(false);
    }
  }

  const aiCount = scenes.filter((s) => s.mediaSource === "ai").length;
  const isBusyActive = busySceneId !== null && busySceneId === activeScene?.id && !batch;
  const engine = project.script.options?.scriptEngine;
  const activeIsAiVideo = activeScene?.mediaSource === "ai" && activeScene.mediaType === "video";
  const activeIsAiImage = activeScene?.mediaSource === "ai" && activeScene.mediaType !== "video";
  const busyLabel =
    waitSeconds > 0
      ? `Service busy · ${waitSeconds}s`
      : busyKind === "video" && videoReady
        ? "Generating video… (1–2 min)"
        : "Generating…";

  return (
    <div className="space-y-4">
      {/* Engines */}
      <div className="rounded-[3px] border border-line bg-inset/70 p-2.5 font-tech text-[10px] leading-relaxed text-stone-ink">
        <div className="mb-1 flex items-center gap-1.5 uppercase tracking-[0.12em] text-paper">
          <Sparkles className="h-3 w-3 text-amber-cue" />
          <span>Generative engines</span>
        </div>
        <p>Video: {status ? status.videoLabel : "…"}</p>
        <p>Images: {status ? status.imageLabel : "…"}</p>
        <p>Writer: {status ? status.textLabel : "…"}</p>
        {engine ? <p>This script was written by: {engineName(engine)}</p> : null}
        {typeof project.script.options?.qualityScore === "number" ? (
          <p>
            Script quality check: {project.script.options.qualityScore}/100
            {project.script.options.qualityNotes?.length
              ? ` · ${project.script.options.qualityNotes.slice(0, 2).join(" ")}`
              : " · no repetition found"}
          </p>
        ) : null}
        <p className="mt-1 text-ash">
          Tip: type requests in the AI edit box, e.g. “generate a video of waves at dusk for
          scene 2” or “make an image of a cabin for all scenes”.
        </p>
      </div>

      {/* Video / Image switch */}
      <div
        role="radiogroup"
        aria-label="What to generate"
        className="grid grid-cols-3 rounded-[3px] border border-line bg-canvas p-0.5"
      >
        {(
          [
            ["video", "AI video", Clapperboard],
            ["image", "AI image", ImagePlus],
            ["stickman", "Stickman", PersonStanding],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = kind === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-[2px] px-2 py-1.5 font-tech text-[11px] uppercase tracking-[0.06em] transition-colors ${
                active ? "bg-amber-cue font-semibold text-[#14110A]" : "text-stone-ink hover:text-paper"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {kind === "video" && !videoReady ? (
        <p className="font-tech text-[10px] leading-relaxed text-ash">
          AI video needs POLLINATIONS_API_KEY (there is no free text-to-video service). Until then,
          “Generate video” makes a motion shot from an AI image.
        </p>
      ) : null}

      {/* Active scene */}
      {activeScene ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
              Scene {String(activeIndex + 1).padStart(2, "0")}
            </h3>
            <span className="font-tech text-[10px] text-stone-ink">
              {activeScene.mediaSource === "stickman"
                ? "Stickman"
                : activeScene.aiLipsync
                  ? "Talking character"
                  : activeIsAiVideo
                    ? "AI video"
                    : activeIsAiImage
                      ? "AI image"
                      : "Stock video"}
            </span>
          </div>

          {activeIsAiVideo && activeScene.mediaUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-[3px] border border-line bg-black">
              <video
                key={activeScene.mediaUrl}
                src={activeScene.mediaUrl}
                poster={activeScene.mediaThumb ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/75 px-1.5 py-0.5 font-tech text-[9px] text-paper">
                {activeScene.mediaTitle}
              </span>
            </div>
          ) : activeIsAiImage && activeScene.mediaUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-[3px] border border-line bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeScene.mediaUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/75 px-1.5 py-0.5 font-tech text-[9px] text-paper">
                {activeScene.mediaTitle} · {AI_MOTIONS[activeScene.aiMotion ?? "push-in"]}
              </span>
            </div>
          ) : null}

          {kind === "stickman" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                    Action
                  </span>
                  <select
                    value={stickAction}
                    onChange={(event) => setStickAction(event.target.value as StickAction | "auto")}
                    className="w-full rounded-[3px] border border-line bg-canvas px-2 py-1.5 text-xs text-paper outline-none focus:border-amber-cue"
                  >
                    <option value="auto" className="bg-panel">Auto (from narration)</option>
                    {(Object.keys(STICK_ACTIONS) as StickAction[]).map((id) => (
                      <option key={id} value={id} className="bg-panel">
                        {STICK_ACTIONS[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                    Theme (all scenes)
                  </span>
                  <select
                    value={stickTheme}
                    onChange={(event) => onUpdateOptions({ stickTheme: event.target.value as StickTheme })}
                    className="w-full rounded-[3px] border border-line bg-canvas px-2 py-1.5 text-xs text-paper outline-none focus:border-amber-cue"
                  >
                    {(Object.keys(STICK_THEMES) as StickTheme[]).map((id) => (
                      <option key={id} value={id} className="bg-panel">
                        {STICK_THEMES[id]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => applyStickman(activeScene, stickAction)}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-3 py-1.5 font-tech text-[11px] font-semibold uppercase tracking-[0.06em] text-[#14110A] transition-colors hover:bg-amber-hover"
              >
                <PersonStanding className="h-3 w-3" />
                <span>{activeScene.mediaSource === "stickman" ? "Update stickman" : "Use stickman animation"}</span>
              </button>
              <p className="font-tech text-[10px] leading-relaxed text-ash">
                Free and instant. The stick figure gestures, blinks and moves smoothly, and its mouth is
                lip-synced to the real voiceover when the video renders.
              </p>
            </div>
          ) : (
            <>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder={
              kind === "video"
                ? "Describe the shot and its motion: subject, action, setting, light, camera…"
                : "Describe the image: subject, setting, light, camera angle…"
            }
            className="w-full resize-none rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs leading-relaxed text-paper outline-none transition-colors placeholder:text-ash focus:border-amber-cue"
          />

          <div className={`grid gap-2 ${kind === "image" ? "grid-cols-2" : "grid-cols-1"}`}>
            <label className="block">
              <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                Look
              </span>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value as AiStyleId)}
                className="w-full rounded-[3px] border border-line bg-canvas px-2 py-1.5 text-xs text-paper outline-none focus:border-amber-cue"
              >
                {AI_STYLE_ORDER.map((id) => (
                  <option key={id} value={id} className="bg-panel">
                    {AI_STYLES[id].label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "image" ? (
              <label className="block">
                <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                  Camera move
                </span>
                <select
                  value={motion}
                  onChange={(event) => {
                    const next = event.target.value as AiMotion;
                    setMotion(next);
                    if (activeIsAiImage) onApplyVisual(activeScene.id, { aiMotion: next });
                  }}
                  className="w-full rounded-[3px] border border-line bg-canvas px-2 py-1.5 text-xs text-paper outline-none focus:border-amber-cue"
                >
                  {MOTION_ORDER.map((id) => (
                    <option key={id} value={id} className="bg-panel">
                      {AI_MOTIONS[id]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() =>
                void generateSingle(activeScene, {
                  kind: kind as AiKind,
                  prompt: prompt.trim() || activeScene.aiPrompt || activeScene.narration,
                  style,
                  motion,
                  newSeed: true,
                })
              }
              disabled={Boolean(busySceneId)}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-3 py-1.5 font-tech text-[11px] font-semibold uppercase tracking-[0.06em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusyActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : kind === "video" ? (
                <Clapperboard className="h-3 w-3" />
              ) : (
                <ImagePlus className="h-3 w-3" />
              )}
              <span>
                {isBusyActive
                  ? busyLabel
                  : kind === "video"
                    ? activeIsAiVideo
                      ? "New video take"
                      : "Generate video"
                    : activeIsAiImage
                      ? "New image variation"
                      : "Generate image"}
              </span>
            </button>
            {isBusyActive ? (
              <button
                type="button"
                onClick={() => singleAbort.current?.abort()}
                className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink hover:text-paper"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>Cancel</span>
              </button>
            ) : null}
            {activeScene.mediaSource === "ai" || activeScene.mediaSource === "stickman" ? (
              <button
                type="button"
                onClick={() => onRevertToStock(activeScene.id)}
                disabled={Boolean(busySceneId)}
                className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper disabled:opacity-50"
              >
                <Undo2 className="h-3 w-3" />
                <span>Back to stock video</span>
              </button>
            ) : null}
          </div>
            </>
          )}
        </section>
      ) : null}

      {/* Character: image-to-video + lip-sync */}
      {activeScene && kind !== "stickman" ? (
        <section className="space-y-2 border-t border-line pt-3">
          <h3 className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
            Character · image-to-video &amp; lip-sync
          </h3>
          <p className="text-[11px] leading-relaxed text-stone-ink">
            Bring a character image to life with smooth movement, or make it speak this scene&apos;s
            narration with lip-sync.
          </p>
          <div className="flex items-center gap-2">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[3px] border border-line bg-black">
              {characterUrl ||
              (activeScene.mediaSource === "ai" && activeScene.mediaType !== "video" && activeScene.mediaUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(characterUrl ?? activeScene.mediaUrl) as string}
                  alt="Character"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full place-items-center font-tech text-[9px] text-ash">none</span>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              <span>{uploading ? "Uploading…" : "Upload character"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadCharacter(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void animateCharacter(activeScene, "motion")}
              disabled={Boolean(busySceneId)}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
            >
              {animating === "motion" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clapperboard className="h-3 w-3" />}
              <span>{animating === "motion" ? busyLabel : "Animate image"}</span>
            </button>
            <button
              type="button"
              onClick={() => void animateCharacter(activeScene, "lipsync")}
              disabled={Boolean(busySceneId) || !activeScene.narration.trim()}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
            >
              {animating === "lipsync" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
              <span>{animating === "lipsync" ? busyLabel : "Make it talk (lip-sync)"}</span>
            </button>
          </div>
          <p className="font-tech text-[10px] leading-relaxed text-ash">
            {status?.characterLabel ?? "…"}
            {videoReady ? " · Needs a public site URL (deploy, or set PUBLIC_APP_URL / Vercel Blob)." : ""}
          </p>
        </section>
      ) : null}

      {/* All scenes */}
      <section className="space-y-2 border-t border-line pt-3">
        <h3 className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">All scenes</h3>
        <p className="text-[11px] text-stone-ink">
          {aiCount} of {scenes.length} scenes use AI visuals.
        </p>
        {batch ? (
          <div className="rounded-[3px] border border-line bg-inset p-2.5">
            <div className="flex items-center justify-between font-tech text-[11px] text-paper">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-amber-cue" />
                Scene {batch.current + 1} · {busyLabel.toLowerCase()}
              </span>
              <span className="text-amber-cue">
                {batch.done}/{batch.total}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden bg-canvas">
              <div
                className="h-full bg-amber-cue transition-[width] duration-300"
                style={{ width: `${Math.max(4, (batch.done / batch.total) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => batchAbort.current?.abort()}
              className="mt-2 inline-flex items-center gap-1 font-tech text-[10px] uppercase tracking-wider text-stone-ink hover:text-paper"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => (kind === "stickman" ? applyStickmanAll() : void runBatch(true, kind))}
              disabled={Boolean(busySceneId) || (kind !== "stickman" && aiCount === scenes.length)}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
            >
              <Sparkles className="h-3 w-3" />
              <span>
                {kind === "stickman"
                  ? "Use stickman for every scene"
                  : aiCount === 0
                    ? `Generate ${kind === "video" ? "videos" : "images"} for every scene`
                    : `Fill remaining scenes with ${kind === "video" ? "video" : "images"}`}
              </span>
            </button>
            {aiCount > 0 ? (
              <button
                type="button"
                onClick={() => (kind === "stickman" ? applyStickmanAll() : void runBatch(false, kind))}
                disabled={Boolean(busySceneId)}
                className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:text-paper disabled:opacity-45"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Regenerate all</span>
              </button>
            ) : null}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelectScene(scene.id)}
              title={`Scene ${index + 1}`}
              className={`relative aspect-video overflow-hidden rounded-[2px] border ${
                scene.id === activeScene?.id ? "border-amber-cue" : "border-line"
              } bg-black`}
            >
              {scene.mediaThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scene.mediaThumb} alt="" className="h-full w-full object-cover" />
              ) : null}
              {busySceneId === scene.id ? (
                <span className="absolute inset-0 grid place-items-center bg-black/60">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-cue" />
                </span>
              ) : scene.mediaSource === "ai" ? (
                <span className="absolute right-0.5 top-0.5 rounded-[2px] bg-amber-cue px-1 font-tech text-[8px] font-bold text-[#14110A]">
                  {scene.mediaType === "video" ? "AI ▶" : "AI"}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* AI rewrite */}
      {activeScene ? (
        <section className="space-y-2 border-t border-line pt-3">
          <h3 className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
            AI rewrite · scene {String(activeIndex + 1).padStart(2, "0")}
          </h3>
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !rewriting) void rewrite();
            }}
            placeholder='Optional direction, e.g. "punchier", "mention free shipping"'
            className="w-full rounded-[3px] border border-line bg-canvas px-2.5 py-1.5 text-xs text-paper outline-none placeholder:text-ash focus:border-amber-cue"
          />
          <button
            type="button"
            onClick={() => void rewrite()}
            disabled={rewriting}
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            <span>{rewriting ? "Rewriting…" : "Rewrite narration & caption"}</span>
          </button>
          {rewriteNote ? (
            <p className="inline-flex items-center gap-1 font-tech text-[10px] text-nominal">
              <Check className="h-3 w-3" />
              {rewriteNote}
            </p>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-[3px] border border-amber-cue/40 bg-amber-cue/10 px-2.5 py-2 font-tech text-[10px] leading-relaxed text-paper">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[3px] border border-tally/40 bg-tally/10 px-2.5 py-2 font-tech text-[10px] text-[#f4b4a8]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
