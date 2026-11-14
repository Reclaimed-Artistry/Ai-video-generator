"use client";

import {
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  Undo2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateWithRetry,
  type AiStatus,
} from "@/lib/ai-client";
import {
  AI_MOTIONS,
  AI_STYLE_ORDER,
  AI_STYLES,
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
};

const MOTION_ORDER: AiMotion[] = ["push-in", "pan-right", "pull-out", "pan-left"];

function engineName(provider: string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "pollinations") return "Pollinations";
  if (provider === "pollinations-free") return "Pollinations (free)";
  return "built-in engine";
}

export default function AiPanel({
  project,
  activeScene,
  activeIndex,
  onApplyVisual,
  onRevertToStock,
  onRewriteScene,
  onSelectScene,
}: Props) {
  const scenes = project.script.scenes;
  const defaultStyle: AiStyleId = project.script.options?.aiStyle ?? "cinematic";

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [prompt, setPrompt] = useState(activeScene?.aiPrompt ?? "");
  const [style, setStyle] = useState<AiStyleId>(activeScene?.aiStyle ?? defaultStyle);
  const [motion, setMotion] = useState<AiMotion>(
    activeScene?.aiMotion ?? MOTION_ORDER[activeIndex % MOTION_ORDER.length],
  );
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [batch, setBatch] = useState<{ done: number; total: number; current: number } | null>(null);
  const batchAbort = useRef<AbortController | null>(null);
  const singleAbort = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);

  const [instruction, setInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteNote, setRewriteNote] = useState<string | null>(null);

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

  const applyImage = useCallback(
    (scene: Scene, url: string, seed: number, provider: string, opts: { prompt: string; style: AiStyleId; motion: AiMotion }) => {
      onApplyVisual(scene.id, {
        mediaSource: "ai",
        mediaType: "photo",
        mediaUrl: url,
        mediaThumb: url,
        mediaId: `ai-${seed}`,
        mediaTitle: `AI · ${AI_STYLES[opts.style].label}`,
        mediaCreator: engineName(provider),
        mediaProvider: "ai",
        mediaLocked: true,
        aiPrompt: opts.prompt,
        aiStyle: opts.style,
        aiMotion: opts.motion,
        aiSeed: seed,
      });
    },
    [onApplyVisual],
  );

  async function generateForActive(newSeed: boolean) {
    if (!activeScene) return;
    const scene = activeScene;
    const usePrompt = prompt.trim() || scene.aiPrompt || scene.narration;
    if (usePrompt.trim().length < 3) {
      setError("Describe the image you want first.");
      return;
    }
    singleAbort.current?.abort();
    const ctrl = new AbortController();
    singleAbort.current = ctrl;
    setBusySceneId(scene.id);
    setError(null);
    try {
      const result = await generateWithRetry(
        {
          prompt: usePrompt,
          style,
          aspect: project.aspect,
          projectId: project.id,
          seed: newSeed || !scene.aiSeed ? undefined : scene.aiSeed,
          signal: ctrl.signal,
        },
        setWaitSeconds,
      );
      applyImage(scene, result.url, result.seed, result.provider, { prompt: usePrompt, style, motion });
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setBusySceneId(null);
      setWaitSeconds(0);
    }
  }

  const runBatch = useCallback(
    async (onlyMissing: boolean) => {
      const targets = scenes.filter((s) => !onlyMissing || s.mediaSource !== "ai");
      if (targets.length === 0) return;
      batchAbort.current?.abort();
      const ctrl = new AbortController();
      batchAbort.current = ctrl;
      setError(null);
      setBatch({ done: 0, total: targets.length, current: 0 });
      let done = 0;
      for (const scene of targets) {
        if (ctrl.signal.aborted) break;
        const index = scenes.findIndex((s) => s.id === scene.id);
        setBatch({ done, total: targets.length, current: index });
        setBusySceneId(scene.id);
        const scenePrompt = scene.aiPrompt?.trim() || scene.narration;
        const sceneStyle = scene.aiStyle ?? defaultStyle;
        const sceneMotion = scene.aiMotion ?? MOTION_ORDER[index % MOTION_ORDER.length];
        try {
          const result = await generateWithRetry(
            {
              prompt: scenePrompt,
              style: sceneStyle,
              aspect: project.aspect,
              projectId: project.id,
              signal: ctrl.signal,
            },
            setWaitSeconds,
          );
          applyImage(scene, result.url, result.seed, result.provider, {
            prompt: scenePrompt,
            style: sceneStyle,
            motion: sceneMotion,
          });
          done += 1;
          setBatch({ done, total: targets.length, current: index });
        } catch (err) {
          if (ctrl.signal.aborted) break;
          setError(
            `Scene ${index + 1}: ${err instanceof Error ? err.message : "generation failed"} — it keeps its stock clip.`,
          );
        }
      }
      setBusySceneId(null);
      setWaitSeconds(0);
      setBatch(null);
    },
    [scenes, defaultStyle, project.aspect, project.id, applyImage],
  );

  // Projects created with "AI-generated visuals" start generating right away.
  useEffect(() => {
    if (autoStarted.current) return;
    if (project.script.options?.visualMode !== "ai") return;
    if (scenes.length === 0 || scenes.some((s) => s.mediaSource === "ai")) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      void runBatch(true);
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

  return (
    <div className="space-y-4">
      {/* Engines */}
      <div className="rounded-[3px] border border-line bg-inset/70 p-2.5 font-tech text-[10px] leading-relaxed text-stone-ink">
        <div className="mb-1 flex items-center gap-1.5 uppercase tracking-[0.12em] text-paper">
          <Sparkles className="h-3 w-3 text-amber-cue" />
          <span>Generative engines</span>
        </div>
        <p>Writer: {status ? status.textLabel : "…"}</p>
        <p>Images: {status ? status.imageLabel : "…"}</p>
        {engine ? <p>This script was written by: {engineName(engine)}</p> : null}
        {status?.freeTier ? (
          <p className="mt-1 text-ash">
            Free tier is rate-limited. Add POLLINATIONS_API_KEY or OPENAI_API_KEY for faster, HD
            results.
          </p>
        ) : null}
      </div>

      {/* Active scene visual */}
      {activeScene ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
              Scene {String(activeIndex + 1).padStart(2, "0")} · AI visual
            </h3>
            <span className="font-tech text-[10px] text-stone-ink">
              {activeScene.mediaSource === "ai" ? "AI image" : "Stock video"}
            </span>
          </div>

          {activeScene.mediaSource === "ai" && activeScene.mediaUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-[3px] border border-line bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeScene.mediaUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded-[2px] bg-black/75 px-1.5 py-0.5 font-tech text-[9px] text-paper">
                {activeScene.mediaTitle} · {AI_MOTIONS[activeScene.aiMotion ?? "push-in"]}
              </span>
            </div>
          ) : null}

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Describe the shot: subject, setting, light, camera angle…"
            className="w-full resize-none rounded-[3px] border border-line bg-canvas px-2.5 py-2 text-xs leading-relaxed text-paper outline-none transition-colors placeholder:text-ash focus:border-amber-cue"
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                Art style
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
            <label className="block">
              <span className="font-tech mb-1 block text-[9px] uppercase tracking-[0.12em] text-ash">
                Camera move
              </span>
              <select
                value={motion}
                onChange={(event) => {
                  const next = event.target.value as AiMotion;
                  setMotion(next);
                  if (activeScene.mediaSource === "ai") {
                    onApplyVisual(activeScene.id, { aiMotion: next });
                  }
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
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void generateForActive(true)}
              disabled={Boolean(busySceneId)}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-3 py-1.5 font-tech text-[11px] font-semibold uppercase tracking-[0.06em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusyActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImagePlus className="h-3 w-3" />
              )}
              <span>
                {isBusyActive
                  ? waitSeconds > 0
                    ? `Free tier · ${waitSeconds}s`
                    : "Generating…"
                  : activeScene.mediaSource === "ai"
                    ? "New variation"
                    : "Generate visual"}
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
            {activeScene.mediaSource === "ai" ? (
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
          <p className="font-tech text-[10px] leading-relaxed text-ash">
            AI images become moving shots in the final video with the camera move above.
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
                Scene {batch.current + 1}
                {waitSeconds > 0 ? ` · free tier wait ${waitSeconds}s` : " · generating"}
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
              onClick={() => void runBatch(true)}
              disabled={Boolean(busySceneId) || aiCount === scenes.length}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
            >
              <Sparkles className="h-3 w-3" />
              <span>
                {aiCount === 0 ? "Generate visuals for every scene" : "Fill remaining scenes"}
              </span>
            </button>
            {aiCount > 0 ? (
              <button
                type="button"
                onClick={() => void runBatch(false)}
                disabled={Boolean(busySceneId)}
                className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:text-paper disabled:opacity-45"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Regenerate all</span>
              </button>
            ) : null}
          </div>
        )}
        {status?.freeTier && !batch ? (
          <p className="font-tech text-[10px] text-ash">
            Free tier: about 45 seconds per image. The studio waits and retries automatically.
          </p>
        ) : null}
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
                  AI
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

      {error ? (
        <p className="rounded-[3px] border border-tally/40 bg-tally/10 px-2.5 py-2 font-tech text-[10px] text-[#f4b4a8]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
