/**
 * Procedural stick-figure animation engine (no dependencies, no API keys).
 *
 * One implementation drives three outputs:
 *  - server renders  → rasterizeStickFrame() writes RGBA frames for FFmpeg
 *  - studio preview  → drawStickFrame() on a <canvas>
 *  - scene thumbnail → stickSvg()
 *
 * Motion is keyframe-free: every joint angle is a smooth function of time,
 * eased in from a neutral pose, with breathing, sway and blinking layered on.
 * Lip-sync comes from a mouth-openness curve; on the server that curve is the
 * frame-by-frame loudness of the actual voiceover.
 */

export type StickAction = "talk" | "wave" | "point" | "think" | "celebrate" | "walk" | "shrug";
export type StickExpression = "neutral" | "happy" | "surprised" | "thinking" | "sad";
export type StickTheme = "whiteboard" | "chalkboard" | "pop";

export const STICK_ACTIONS: Record<StickAction, string> = {
  talk: "Talking",
  wave: "Waving",
  point: "Pointing",
  think: "Thinking",
  celebrate: "Celebrating",
  walk: "Walking",
  shrug: "Shrugging",
};

export const STICK_THEMES: Record<StickTheme, string> = {
  whiteboard: "Whiteboard",
  chalkboard: "Chalkboard",
  pop: "Color pop",
};

type RGBA = [number, number, number, number];

export type StickShape =
  | { k: "seg"; x1: number; y1: number; x2: number; y2: number; w: number; c: RGBA }
  | { k: "ring"; x: number; y: number; r: number; w: number; c: RGBA }
  | { k: "disc"; x: number; y: number; r: number; c: RGBA }
  | { k: "ellipse"; x: number; y: number; rx: number; ry: number; c: RGBA };

export type StickSpec = {
  width: number;
  height: number;
  duration: number;
  action: StickAction;
  expression: StickExpression;
  theme: StickTheme;
  seed: number;
  /** Mouth openness 0..1 at time t (seconds). */
  mouth: (t: number) => number;
};

const THEMES: Record<StickTheme, { top: RGBA; bottom: RGBA; ink: RGBA; accent: RGBA; ground: RGBA }> = {
  whiteboard: {
    top: [250, 249, 246, 255],
    bottom: [240, 238, 232, 255],
    ink: [22, 22, 22, 255],
    accent: [229, 169, 60, 255],
    ground: [205, 202, 194, 255],
  },
  chalkboard: {
    top: [36, 50, 43, 255],
    bottom: [24, 34, 29, 255],
    ink: [242, 239, 233, 255],
    accent: [240, 184, 77, 255],
    ground: [84, 102, 92, 255],
  },
  pop: {
    top: [254, 236, 170, 255],
    bottom: [252, 196, 178, 255],
    ink: [20, 20, 28, 255],
    accent: [37, 99, 235, 255],
    ground: [214, 160, 140, 255],
  },
};

// ─── Script → performance ──────────────────────────────────────────────────

/** Pick an action and expression that fit the line being spoken. */
export function chooseStickPerformance(
  narration: string,
  index: number,
): { action: StickAction; expression: StickExpression } {
  const text = narration.toLowerCase();
  if (index === 0 && /\b(hello|hi|hey|welcome|meet)\b/.test(text)) return { action: "wave", expression: "happy" };
  if (/\b(win|won|success|amazing|incredible|finally|celebrate|best|awesome|wow)\b|!/.test(text)) {
    return { action: "celebrate", expression: "happy" };
  }
  if (/\?|\b(why|how come|what if|wonder|imagine|think|idea)\b/.test(text)) {
    return { action: "think", expression: "thinking" };
  }
  if (/\b(but|however|maybe|not sure|unclear|depends|nobody knows)\b/.test(text)) {
    return { action: "shrug", expression: "neutral" };
  }
  if (/\b(walk|go|move|journey|step|travel|road|path|start)\b/.test(text)) {
    return { action: "walk", expression: "neutral" };
  }
  if (/\b(you|your|look|here|this|notice|remember)\b/.test(text)) return { action: "point", expression: "happy" };
  if (/\b(sad|lost|fail|problem|struggle|pain|worst|mistake)\b/.test(text)) {
    return { action: "talk", expression: "sad" };
  }
  if (/\b(shock|suddenly|surprise|secret|unbelievable)\b/.test(text)) {
    return { action: "talk", expression: "surprised" };
  }
  return { action: "talk", expression: index % 3 === 1 ? "happy" : "neutral" };
}

/** Estimated mouth curve from text alone (used for previews before audio exists). */
export function estimatedMouth(narration: string, duration: number): (t: number) => number {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  const speakEnd = Math.max(0.6, Math.min(duration - 0.3, words.length / 2.6));
  return (t: number) => {
    if (t <= 0.05 || t >= speakEnd) return 0;
    const syllable = Math.abs(Math.sin(t * 13.5)) * 0.75 + Math.abs(Math.sin(t * 5.1)) * 0.25;
    return Math.min(1, 0.15 + syllable * 0.8);
  };
}

/** Convert per-frame RMS dB values into a smoothed mouth-openness curve. */
export function mouthFromLoudness(dbPerFrame: number[], fps: number): (t: number) => number {
  // Adapt to this clip's own loudness: its top 5% maps to "wide open" and
  // anything 24 dB below that to "closed", so syllables open and close the
  // mouth instead of it gaping for the whole sentence.
  const voiced = dbPerFrame.filter((db) => Number.isFinite(db) && db > -60).sort((a, b) => a - b);
  const top = voiced.length ? voiced[Math.min(voiced.length - 1, Math.floor(voiced.length * 0.95))] : -20;
  const floor = top - 24;
  const open: number[] = [];
  let level = 0;
  for (const db of dbPerFrame) {
    const linear = Number.isFinite(db) ? Math.min(1, Math.max(0, (db - floor) / (top - floor))) : 0;
    const target = Math.pow(linear, 1.6);
    // Fast attack, slower release: reads like speech, not flicker.
    level = target > level ? level + (target - level) * 0.75 : level + (target - level) * 0.35;
    open.push(level < 0.06 ? 0 : level);
  }
  return (t: number) => open[Math.max(0, Math.min(open.length - 1, Math.floor(t * fps)))] ?? 0;
}

// ─── Pose ──────────────────────────────────────────────────────────────────

type Pose = {
  ra1: number; ra2: number; la1: number; la2: number;
  rl1: number; rl2: number; ll1: number; ll2: number;
  lean: number; headTilt: number; bounce: number; driftX: number;
};

const NEUTRAL: Pose = {
  ra1: 0.28, ra2: -0.12, la1: -0.28, la2: 0.12,
  rl1: 0.12, rl2: -0.04, ll1: -0.12, ll2: 0.04,
  lean: 0, headTilt: 0, bounce: 0, driftX: 0,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function actionPose(action: StickAction, t: number, speech: number, duration: number): Pose {
  const p = { ...NEUTRAL };
  switch (action) {
    case "talk": {
      const g = 0.35 + 0.65 * speech;
      p.ra1 = 0.45 + g * (0.55 + 0.35 * Math.sin(t * 2.3));
      p.ra2 = -0.9 * g - 0.25 * Math.sin(t * 3.1);
      p.la1 = -0.35 - g * (0.35 + 0.25 * Math.sin(t * 1.7 + 1));
      p.la2 = 0.7 * g + 0.2 * Math.sin(t * 2.6);
      p.headTilt = 0.06 * Math.sin(t * 4.2) * (0.4 + speech);
      break;
    }
    case "wave":
      p.ra1 = 2.55 + 0.08 * Math.sin(t * 2);
      p.ra2 = 0.45 * Math.sin(t * 9);
      p.headTilt = 0.08;
      break;
    case "point":
      p.ra1 = 1.5 + 0.04 * Math.sin(t * 2.2);
      p.ra2 = 0.04;
      p.lean = 0.05;
      p.headTilt = 0.1;
      p.la1 = -0.3 - 0.15 * speech;
      break;
    case "think":
      p.ra1 = 0.55;
      p.ra2 = 2.35 + 0.05 * Math.sin(t * 1.5);
      p.la1 = -0.2;
      p.la2 = 1.4;
      p.headTilt = -0.14 + 0.03 * Math.sin(t * 1.2);
      break;
    case "celebrate": {
      const hop = Math.max(0, Math.sin(t * 6.2));
      // Arms in a wide V (clear of the head); legs spread outward on each hop.
      p.ra1 = 2.25 + 0.12 * Math.sin(t * 7);
      p.ra2 = 0.25 + 0.15 * Math.sin(t * 9);
      p.la1 = -2.25 - 0.12 * Math.sin(t * 7 + 1);
      p.la2 = -0.25 - 0.15 * Math.sin(t * 9 + 1);
      p.bounce = hop * 0.09;
      p.rl1 = 0.12 + 0.28 * hop;
      p.ll1 = -0.12 - 0.28 * hop;
      p.rl2 = 0;
      p.ll2 = 0;
      break;
    }
    case "walk": {
      const w = Math.sin(t * 6.5);
      p.rl1 = 0.42 * w;
      p.ll1 = -0.42 * w;
      p.rl2 = w < 0 ? 0.55 * w : -0.05;
      p.ll2 = w > 0 ? 0.55 * w : 0.05;
      p.ra1 = 0.25 - 0.45 * w;
      p.la1 = -0.25 - 0.45 * w;
      p.bounce = Math.abs(Math.cos(t * 6.5)) * 0.025;
      p.driftX = (Math.min(t, duration) / Math.max(duration, 1) - 0.5) * 0.18;
      p.lean = 0.04;
      break;
    }
    case "shrug": {
      const s = 0.5 + 0.5 * Math.sin(t * 2.4);
      p.ra1 = 1.0 + 0.25 * s;
      p.ra2 = 1.3 * s;
      p.la1 = -1.0 - 0.25 * s;
      p.la2 = -1.3 * s;
      p.headTilt = 0.12 * s;
      p.bounce = 0.012 * s;
      break;
    }
  }
  return p;
}

// ─── Frame geometry ────────────────────────────────────────────────────────

const dir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

function hashRandom(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** All drawable shapes for the frame at time t. */
export function stickFrameShapes(spec: StickSpec, t: number): StickShape[] {
  const { width: W, height: H, theme } = spec;
  const palette = THEMES[theme];
  const portrait = H > W;
  const s = Math.min(W, H) / 360;
  const lw = 6 * s;
  const ink = palette.ink;
  const accent = palette.accent;

  const speech = spec.mouth(t);
  const blend = smoothstep(0, 0.45, t);
  const target = actionPose(spec.action, t, speech, spec.duration);
  const p = {} as Pose;
  (Object.keys(NEUTRAL) as (keyof Pose)[]).forEach((key) => {
    p[key] = lerp(NEUTRAL[key], target[key], blend);
  });

  const breathe = 1 + 0.012 * Math.sin(t * 2.1 + spec.seed);
  const sway = 0.02 * Math.sin(t * 1.3 + spec.seed);
  const torso = 72 * s * breathe;
  const upper = 40 * s;
  const fore = 38 * s;
  const thigh = 46 * s;
  const shin = 44 * s;
  const headR = 22 * s;

  const groundY = H * (portrait ? 0.78 : 0.84);
  const cx = W * (portrait ? 0.5 : 0.3) + p.driftX * W;
  const legReach = thigh + shin - 4 * s;
  const hip: [number, number] = [cx, groundY - legReach - p.bounce * H];

  const lean = p.lean + sway;
  const nd = dir(Math.PI + lean);
  const neck: [number, number] = [hip[0] + nd[0] * torso, hip[1] + nd[1] * torso];
  const hd = dir(Math.PI + lean + p.headTilt);
  const head: [number, number] = [neck[0] + hd[0] * (headR + 5 * s), neck[1] + hd[1] * (headR + 5 * s)];

  const limb = (origin: [number, number], a1: number, a2: number, l1: number, l2: number) => {
    const d1 = dir(a1 + lean * 0.5);
    const mid: [number, number] = [origin[0] + d1[0] * l1, origin[1] + d1[1] * l1];
    const d2 = dir(a1 + a2 + lean * 0.5);
    const end: [number, number] = [mid[0] + d2[0] * l2, mid[1] + d2[1] * l2];
    return { mid, end };
  };
  const shoulder: [number, number] = [neck[0] + nd[0] * -6 * s, neck[1] + nd[1] * -6 * s];
  const rArm = limb(shoulder, p.ra1, p.ra2, upper, fore);
  const lArm = limb(shoulder, p.la1, p.la2, upper, fore);
  const rLeg = limb(hip, p.rl1, p.rl2, thigh, shin);
  const lLeg = limb(hip, p.ll1, p.ll2, thigh, shin);

  const shapes: StickShape[] = [];
  const seg = (a: [number, number], b: [number, number], w = lw, c: RGBA = ink) =>
    shapes.push({ k: "seg", x1: a[0], y1: a[1], x2: b[0], y2: b[1], w, c });

  // Ground line and contact shadow
  const shadowAlpha = Math.round(40 * (1 - Math.min(1, p.bounce * 8)));
  shapes.push({ k: "ellipse", x: cx, y: groundY + 3 * s, rx: 42 * s, ry: 5 * s, c: [0, 0, 0, shadowAlpha] });
  shapes.push({ k: "seg", x1: W * 0.06, y1: groundY + 6 * s, x2: W * 0.94, y2: groundY + 6 * s, w: 2 * s, c: palette.ground });

  // Body
  seg(lLeg.mid, lLeg.end); seg(hip, lLeg.mid);
  seg(rLeg.mid, rLeg.end); seg(hip, rLeg.mid);
  seg(hip, neck);
  seg(shoulder, lArm.mid); seg(lArm.mid, lArm.end);
  seg(shoulder, rArm.mid); seg(rArm.mid, rArm.end);
  shapes.push({ k: "ring", x: head[0], y: head[1], r: headR, w: lw, c: ink });

  // Face: eyes with blinks, brows by expression, audio-driven mouth
  const faceTurn = p.headTilt * headR * 0.6;
  const eyeY = head[1] - headR * 0.12;
  const eyeDx = headR * 0.36;
  const blinkPhase = (t + hashRandom(spec.seed, 1) * 3) % 3.1;
  const blinking = blinkPhase < 0.12;
  for (const side of [-1, 1]) {
    const ex = head[0] + faceTurn + side * eyeDx;
    if (blinking) {
      seg([ex - headR * 0.11, eyeY], [ex + headR * 0.11, eyeY], lw * 0.55);
    } else {
      shapes.push({ k: "disc", x: ex, y: eyeY, r: headR * (spec.expression === "surprised" ? 0.13 : 0.1), c: ink });
    }
  }
  const brow = (dy: number, slant: number) => {
    for (const side of [-1, 1]) {
      const bx = head[0] + faceTurn + side * eyeDx;
      const by = eyeY - headR * 0.3 - dy;
      seg([bx - headR * 0.15, by + side * slant], [bx + headR * 0.15, by - side * slant], lw * 0.45);
    }
  };
  if (spec.expression === "surprised") brow(headR * 0.12, 0);
  if (spec.expression === "sad") brow(0, -headR * 0.06);
  if (spec.expression === "thinking") {
    const bx = head[0] + faceTurn + eyeDx;
    seg([bx - headR * 0.15, eyeY - headR * 0.45], [bx + headR * 0.15, eyeY - headR * 0.52], lw * 0.45);
  }

  const mouthX = head[0] + faceTurn;
  const mouthY = head[1] + headR * 0.42;
  const open = Math.min(1, Math.max(0, speech));
  if (open > 0.06) {
    shapes.push({
      k: "ellipse",
      x: mouthX,
      y: mouthY,
      rx: headR * (0.27 - 0.08 * open),
      ry: headR * (0.05 + 0.27 * open),
      c: ink,
    });
  } else {
    const curve = spec.expression === "happy" ? 1 : spec.expression === "sad" ? -1 : 0.25;
    const mw = headR * 0.3;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 4; i += 1) {
      const u = i / 4 - 0.5;
      pts.push([mouthX + u * 2 * mw, mouthY + curve * headR * 0.12 * (0.25 - u * u) * 4]);
    }
    for (let i = 0; i < pts.length - 1; i += 1) seg(pts[i], pts[i + 1], lw * 0.5);
  }

  // Action props in the accent color
  if (spec.action === "think") {
    for (let i = 0; i < 3; i += 1) {
      const rise = (t * 0.6 + i * 0.33) % 1;
      shapes.push({
        k: "ring",
        x: head[0] + headR * (1.2 + i * 0.7),
        y: head[1] - headR * (1.1 + i * 0.75) - rise * 4 * s,
        r: headR * (0.16 + i * 0.12),
        w: lw * 0.55,
        c: accent,
      });
    }
  } else if (spec.action === "celebrate") {
    for (let i = 0; i < 26; i += 1) {
      const fall = (t * (0.25 + hashRandom(spec.seed, i) * 0.3) + hashRandom(spec.seed, i + 50)) % 1;
      const px = W * (0.08 + 0.84 * hashRandom(spec.seed, i + 100));
      const py = H * (fall * 0.9 - 0.05);
      const col: RGBA = i % 3 === 0 ? accent : i % 3 === 1 ? ink : [220, 70, 60, 255];
      shapes.push({ k: "disc", x: px + Math.sin(t * 3 + i) * 6 * s, y: py, r: (2.2 + hashRandom(spec.seed, i + 7) * 2.4) * s, c: col });
    }
  } else if (spec.action === "point") {
    const tipX = rArm.end[0] + 26 * s + Math.sin(t * 5) * 4 * s;
    const tipY = rArm.end[1];
    seg([rArm.end[0] + 10 * s, tipY], [tipX, tipY], lw * 0.7, accent);
    seg([tipX - 9 * s, tipY - 8 * s], [tipX, tipY], lw * 0.7, accent);
    seg([tipX - 9 * s, tipY + 8 * s], [tipX, tipY], lw * 0.7, accent);
  } else if (spec.action === "wave") {
    for (let i = 0; i < 2; i += 1) {
      const r = (16 + i * 9) * s;
      const hx = rArm.end[0];
      const hy = rArm.end[1];
      const a0 = -0.9;
      for (let k = 0; k < 3; k += 1) {
        const a = a0 + k * 0.35;
        const b = a + 0.3;
        seg([hx + Math.cos(a) * r, hy + Math.sin(a) * r], [hx + Math.cos(b) * r, hy + Math.sin(b) * r], lw * 0.45, accent);
      }
    }
  } else if (spec.action === "walk") {
    for (let i = 0; i < 3; i += 1) {
      const y = hip[1] - torso * (0.1 + i * 0.3);
      seg([cx - 52 * s, y], [cx - (70 + i * 6) * s, y], lw * 0.4, palette.ground);
    }
  }
  return shapes;
}

// ─── Output: raster (server) ───────────────────────────────────────────────

/** Theme background as an RGBA buffer (vertical gradient). */
export function stickBackground(width: number, height: number, theme: StickTheme): Uint8Array {
  const { top, bottom } = THEMES[theme];
  const buf = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const f = y / Math.max(1, height - 1);
    const r = Math.round(lerp(top[0], bottom[0], f));
    const g = Math.round(lerp(top[1], bottom[1], f));
    const b = Math.round(lerp(top[2], bottom[2], f));
    let o = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
      o += 4;
    }
  }
  return buf;
}

/** Anti-aliased software rasterizer: draws shapes onto an RGBA frame in place. */
export function rasterizeStickFrame(frame: Uint8Array, width: number, height: number, shapes: StickShape[]): void {
  const plot = (x0: number, y0: number, x1: number, y1: number, c: RGBA, coverage: (px: number, py: number) => number) => {
    const minX = Math.max(0, Math.floor(x0));
    const maxX = Math.min(width - 1, Math.ceil(x1));
    const minY = Math.max(0, Math.floor(y0));
    const maxY = Math.min(height - 1, Math.ceil(y1));
    const alpha = c[3] / 255;
    for (let y = minY; y <= maxY; y += 1) {
      let o = (y * width + minX) * 4;
      for (let x = minX; x <= maxX; x += 1) {
        const cov = coverage(x + 0.5, y + 0.5);
        if (cov > 0) {
          const a = cov * alpha;
          frame[o] += (c[0] - frame[o]) * a;
          frame[o + 1] += (c[1] - frame[o + 1]) * a;
          frame[o + 2] += (c[2] - frame[o + 2]) * a;
        }
        o += 4;
      }
    }
  };
  for (const sh of shapes) {
    if (sh.k === "seg") {
      const hw = sh.w / 2;
      const dx = sh.x2 - sh.x1;
      const dy = sh.y2 - sh.y1;
      const len2 = dx * dx + dy * dy || 1e-6;
      plot(
        Math.min(sh.x1, sh.x2) - hw - 1, Math.min(sh.y1, sh.y2) - hw - 1,
        Math.max(sh.x1, sh.x2) + hw + 1, Math.max(sh.y1, sh.y2) + hw + 1,
        sh.c,
        (px, py) => {
          let u = ((px - sh.x1) * dx + (py - sh.y1) * dy) / len2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = sh.x1 + u * dx - px;
          const ey = sh.y1 + u * dy - py;
          const d = Math.sqrt(ex * ex + ey * ey);
          const cov = hw - d + 0.5;
          return cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
        },
      );
    } else if (sh.k === "ring") {
      const hw = sh.w / 2;
      const ext = sh.r + hw + 1;
      plot(sh.x - ext, sh.y - ext, sh.x + ext, sh.y + ext, sh.c, (px, py) => {
        const d = Math.abs(Math.hypot(px - sh.x, py - sh.y) - sh.r);
        const cov = hw - d + 0.5;
        return cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
      });
    } else if (sh.k === "disc") {
      const ext = sh.r + 1;
      plot(sh.x - ext, sh.y - ext, sh.x + ext, sh.y + ext, sh.c, (px, py) => {
        const cov = sh.r - Math.hypot(px - sh.x, py - sh.y) + 0.5;
        return cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
      });
    } else {
      const ext = Math.max(sh.rx, sh.ry) + 1;
      const m = Math.min(sh.rx, sh.ry);
      plot(sh.x - sh.rx - 1, sh.y - sh.ry - 1, sh.x + sh.rx + 1, sh.y + sh.ry + 1, sh.c, (px, py) => {
        const k = Math.hypot((px - sh.x) / sh.rx, (py - sh.y) / sh.ry);
        const cov = 0.5 - (k - 1) * m;
        return cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
      });
      void ext;
    }
  }
}

// ─── Output: canvas (studio preview) and SVG (thumbnails) ─────────────────

const css = (c: RGBA) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(3)})`;

type Canvas2D = {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a: number, b: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): {
    addColorStop(o: number, c: string): void;
  };
};

export function drawStickFrame(ctx: Canvas2D, spec: StickSpec, t: number): void {
  const pal = THEMES[spec.theme];
  const grad = ctx.createLinearGradient(0, 0, 0, spec.height);
  grad.addColorStop(0, css(pal.top));
  grad.addColorStop(1, css(pal.bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, spec.width, spec.height);
  ctx.lineCap = "round";
  for (const sh of stickFrameShapes(spec, t)) {
    ctx.beginPath();
    if (sh.k === "seg") {
      ctx.strokeStyle = css(sh.c);
      ctx.lineWidth = sh.w;
      ctx.moveTo(sh.x1, sh.y1);
      ctx.lineTo(sh.x2, sh.y2);
      ctx.stroke();
    } else if (sh.k === "ring") {
      ctx.strokeStyle = css(sh.c);
      ctx.lineWidth = sh.w;
      ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sh.k === "disc") {
      ctx.fillStyle = css(sh.c);
      ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = css(sh.c);
      ctx.ellipse(sh.x, sh.y, sh.rx, sh.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function stickSvg(spec: StickSpec, t: number): string {
  const pal = THEMES[spec.theme];
  const parts = stickFrameShapes(spec, t).map((sh) => {
    if (sh.k === "seg") {
      return `<line x1="${sh.x1.toFixed(1)}" y1="${sh.y1.toFixed(1)}" x2="${sh.x2.toFixed(1)}" y2="${sh.y2.toFixed(1)}" stroke="${css(sh.c)}" stroke-width="${sh.w.toFixed(1)}" stroke-linecap="round"/>`;
    }
    if (sh.k === "ring") {
      return `<circle cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" r="${sh.r.toFixed(1)}" fill="none" stroke="${css(sh.c)}" stroke-width="${sh.w.toFixed(1)}"/>`;
    }
    if (sh.k === "disc") {
      return `<circle cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" r="${sh.r.toFixed(1)}" fill="${css(sh.c)}"/>`;
    }
    return `<ellipse cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" rx="${sh.rx.toFixed(1)}" ry="${sh.ry.toFixed(1)}" fill="${css(sh.c)}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css(pal.top)}"/><stop offset="1" stop-color="${css(pal.bottom)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${parts.join("")}</svg>`;
}

export function stickThumbDataUrl(
  narration: string,
  index: number,
  theme: StickTheme,
  action?: StickAction | null,
): string {
  const perf = chooseStickPerformance(narration, index);
  const spec: StickSpec = {
    width: 320,
    height: 180,
    duration: 4,
    action: action ?? perf.action,
    expression: perf.expression,
    theme,
    seed: index + 1,
    mouth: () => 0,
  };
  return `data:image/svg+xml;utf8,${encodeURIComponent(stickSvg(spec, 1.2))}`;
}
