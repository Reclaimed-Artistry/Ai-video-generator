"use client";

import { useEffect, useRef } from "react";
import {
  chooseStickPerformance,
  drawStickFrame,
  estimatedMouth,
  type StickAction,
  type StickTheme,
} from "@/lib/stickman";

type Props = {
  narration: string;
  sceneIndex: number;
  action?: StickAction | null;
  theme: StickTheme;
  /** Scene length in seconds; the preview loops over it. */
  duration: number;
  aspect: "16:9" | "9:16" | "1:1";
  className?: string;
};

const SIZES = { "16:9": [640, 360], "9:16": [360, 640], "1:1": [480, 480] } as const;

/**
 * Live preview of a stickman scene using the same engine as the final render.
 * The mouth follows an estimate from the text here; renders use the real
 * voiceover loudness for frame-accurate lip-sync.
 */
export default function StickmanPreview({
  narration,
  sceneIndex,
  action,
  theme,
  duration,
  aspect,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const [width, height] = SIZES[aspect];
    const perf = chooseStickPerformance(narration || "", sceneIndex);
    const loop = Math.max(2.5, duration);
    const spec = {
      width,
      height,
      duration: loop,
      action: action ?? perf.action,
      expression: perf.expression,
      theme,
      seed: sceneIndex + 1,
      mouth: estimatedMouth(narration || "", loop),
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      drawStickFrame(ctx, spec, 1.2);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      drawStickFrame(ctx, spec, ((now - start) / 1000) % loop);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [narration, sceneIndex, action, theme, duration, aspect]);

  const [width, height] = SIZES[aspect];
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-label="Stickman animation preview"
      className={className}
    />
  );
}
