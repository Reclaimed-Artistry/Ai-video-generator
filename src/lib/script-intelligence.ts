/**
 * Script intelligence: makes generated scripts and visuals less repetitive.
 *
 *  - parseModelJson   tolerant JSON parsing for small models (stray brackets,
 *                     trailing commas, missing commas) with a field-level salvage
 *  - analyzeScript    measures repetition: shared phrases, repeated openers,
 *                     prompt parroting, clichés, duplicate captions/searches
 *  - polishScript     local fixes that need no AI call
 *  - director prompts plan-then-write prompting with explicit variety rules
 *  - shot design      varied shot types / camera moves + one visual style
 */

// ─── Tolerant JSON ─────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.replace(/```(?:json)?/gi, "").trim();
}

function errorPosition(error: unknown): number | null {
  const m = /position (\d+)/i.exec(error instanceof Error ? error.message : String(error));
  return m ? Number(m[1]) : null;
}

/**
 * Parse JSON written by an LLM. Repairs the mistakes small models make
 * (e.g. `"text"],` instead of `"text",`, trailing commas, a missing comma
 * between properties) one error at a time.
 */
export function parseModelJson<T>(content: string): T | null {
  const raw = stripFences(content);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let text = raw
    .slice(start, end + 1)
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/,\s*([}\]])/g, "$1");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      const pos = errorPosition(error);
      if (pos === null || pos <= 0 || pos >= text.length) return null;
      const ch = text[pos];
      if (ch === "]" || ch === "}" || ch === ")") {
        text = text.slice(0, pos) + text.slice(pos + 1); // stray closer
      } else if (ch === '"' || ch === "{") {
        text = `${text.slice(0, pos)},${text.slice(pos)}`; // missing comma
      } else if (ch === "\n" || ch === "\r") {
        text = `${text.slice(0, pos)}\\n${text.slice(pos + 1)}`; // raw newline in a string
      } else {
        return null;
      }
    }
  }
  return null;
}

/** Last resort: pull scene fields out of malformed JSON with regexes. */
export function salvageScenes(content: string): Record<string, string>[] {
  const fields = ["narration", "caption", "mediaQuery", "visualPrompt", "shotType", "camera"];
  const chunks = content.split(/"narration"\s*:/).slice(1);
  return chunks
    .map((chunk) => {
      const text = `"narration":${chunk}`;
      const scene: Record<string, string> = {};
      for (const field of fields) {
        const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
        if (m) scene[field] = m[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
      }
      return scene;
    })
    .filter((scene) => (scene.narration ?? "").length > 8);
}

// ─── Repetition analysis ───────────────────────────────────────────────────

/** Phrases that make scripts sound templated. */
export const CLICHES = [
  "stop scrolling",
  "here is what nobody tells you",
  "here's what nobody tells you",
  "here is the shift",
  "the payoff",
  "save this for later",
  "let us unpack",
  "let's dive in",
  "dive into",
  "in today's world",
  "in today's fast-paced world",
  "game changer",
  "game-changer",
  "unlock the secrets",
  "unleash",
  "buckle up",
  "look no further",
  "it's no secret",
  "at the end of the day",
  "the rest is history",
];

const STOP = new Set(
  "a an and are as at be but by for from has have he her his i in is it its of on or our so that the their them they this to was we were what when which who will with you your".split(
    " ",
  ),
);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const gram = tokens.slice(i, i + n);
    if (gram.every((w) => STOP.has(w))) continue;
    out.add(gram.join(" "));
  }
  return out;
}

export type SceneText = { narration: string; caption: string; mediaQuery: string; aiPrompt?: string | null };

export type QualityReport = {
  score: number;
  issues: string[];
  /** Zero-based scene indexes that should be rewritten. */
  weakScenes: number[];
};

/** Does `text` contain a long verbatim run (≥ 5 words) of the user's prompt? */
export function echoesPrompt(text: string, prompt: string): boolean {
  const p = words(prompt);
  if (p.length < 5) return false;
  const t = ` ${words(text).join(" ")} `;
  for (let i = 0; i + 5 <= p.length; i += 1) {
    if (t.includes(` ${p.slice(i, i + 5).join(" ")} `)) return true;
  }
  return false;
}

export function analyzeScript(scenes: SceneText[], prompt: string): QualityReport {
  const issues: string[] = [];
  const weak = new Set<number>();

  // Phrases shared between scenes (4-word runs)
  const grams = scenes.map((s) => ngrams(words(s.narration), 4));
  for (let i = 0; i < scenes.length; i += 1) {
    for (let j = i + 1; j < scenes.length; j += 1) {
      const shared = [...grams[i]].filter((g) => grams[j].has(g));
      if (shared.length > 0) {
        issues.push(`Scenes ${i + 1} and ${j + 1} repeat “${shared[0]}”.`);
        weak.add(j);
      }
    }
  }

  // Same opening words
  const openers = new Map<string, number>();
  scenes.forEach((s, i) => {
    const opener = words(s.narration).slice(0, 2).join(" ");
    if (!opener) return;
    if (openers.has(opener)) {
      issues.push(`Scenes ${openers.get(opener)! + 1} and ${i + 1} both open with “${opener}”.`);
      weak.add(i);
    } else {
      openers.set(opener, i);
    }
  });

  scenes.forEach((s, i) => {
    const lower = s.narration.toLowerCase();
    const cliche = CLICHES.find((c) => lower.includes(c));
    if (cliche) {
      issues.push(`Scene ${i + 1} uses the cliché “${cliche}”.`);
      weak.add(i);
    }
    if (echoesPrompt(s.narration, prompt)) {
      issues.push(`Scene ${i + 1} repeats the prompt word for word.`);
      weak.add(i);
    }
  });

  const dupe = (key: "caption" | "mediaQuery", label: string) => {
    const seen = new Map<string, number>();
    scenes.forEach((s, i) => {
      const v = (s[key] ?? "").trim().toLowerCase();
      if (!v) return;
      if (seen.has(v)) issues.push(`Scenes ${seen.get(v)! + 1} and ${i + 1} share the same ${label}.`);
      else seen.set(v, i);
    });
  };
  dupe("caption", "caption");
  dupe("mediaQuery", "footage search");

  const score = Math.max(0, 100 - issues.length * 8);
  return { score, issues, weakScenes: [...weak].sort((a, b) => a - b) };
}

// ─── Local polish (no AI call) ─────────────────────────────────────────────

function distinctiveKeywords(text: string, avoid: Set<string>, count = 3): string[] {
  const freq = new Map<string, number>();
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w) || avoid.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, count)
    .map(([w]) => w);
}

const titleWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Replace the longest verbatim run (≥ 5 words) of the prompt with `subject`. */
export function replaceLongestEcho(text: string, prompt: string, subject: string): string {
  const p = prompt.match(/[A-Za-z0-9']+/g) ?? [];
  for (let len = p.length; len >= 5; len -= 1) {
    for (let i = 0; i + len <= p.length; i += 1) {
      const pattern = p
        .slice(i, i + len)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^A-Za-z0-9']+");
      const re = new RegExp(`\\b${pattern}\\b`, "i");
      if (re.test(text)) {
        const out = text.replace(re, subject).replace(/\s{2,}/g, " ");
        // Keep sentences starting with a capital letter.
        return out.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
      }
    }
  }
  return text;
}

/**
 * Fix what can be fixed deterministically: prompt parroting, duplicate
 * footage searches and duplicate captions. `subject` is the short topic noun
 * phrase used instead of the full prompt.
 */
export function polishScript<T extends SceneText>(scenes: T[], prompt: string, subject: string): T[] {
  const seenQueries = new Set<string>();
  const seenCaptions = new Set<string>();
  return scenes.map((scene, index) => {
    let narration = scene.narration;
    if (echoesPrompt(narration, prompt)) narration = replaceLongestEcho(narration, prompt, subject);

    let mediaQuery = scene.mediaQuery.trim();
    const junk = /\b(isn|aren|doesn|theory|someone|send|before|everywhere|overlook|visible|refused|belongs|trap)\b/i.test(mediaQuery);
    if (!mediaQuery || junk || seenQueries.has(mediaQuery.toLowerCase())) {
      mediaQuery = visualForLine(narration, subject, index);
      if (seenQueries.has(mediaQuery.toLowerCase())) {
        const keys = distinctiveKeywords(narration, new Set(words(subject)), 2);
        mediaQuery = `${mediaQuery.split(",")[0]} ${keys.join(" ")}`.trim();
      }
    }
    seenQueries.add(mediaQuery.toLowerCase());

    let caption = scene.caption.trim();
    if (!caption || seenCaptions.has(caption.toLowerCase())) {
      caption = captionFromLine(narration) || caption;
    }
    seenCaptions.add(caption.toLowerCase());

    return { ...scene, narration, mediaQuery, caption };
  });
}

// ─── Shot design (varied visuals, one consistent style) ────────────────────

export const SHOT_TYPES = [
  "wide establishing shot",
  "medium shot",
  "close-up",
  "aerial drone shot",
  "over-the-shoulder shot",
  "low-angle shot",
  "macro detail shot",
  "tracking shot",
] as const;

export const CAMERA_MOVES = [
  "slow dolly in",
  "smooth pan",
  "handheld follow",
  "static locked-off frame",
  "orbiting move",
  "crane up",
  "slow push out",
] as const;

/** Build a text-to-image/video prompt from a scene's shot design. */
export function composeShotPrompt(args: {
  visualPrompt: string;
  shotType?: string | null;
  camera?: string | null;
  style?: string | null;
  index: number;
}): string {
  const shot = args.shotType?.trim() || SHOT_TYPES[args.index % SHOT_TYPES.length];
  const camera = args.camera?.trim() || CAMERA_MOVES[args.index % CAMERA_MOVES.length];
  const base = args.visualPrompt.trim().replace(/[.\s]+$/, "");
  return [`${shot}: ${base}`, camera, args.style?.trim()].filter(Boolean).join(". ");
}

// ─── Director prompts ──────────────────────────────────────────────────────

export const DIRECTOR_SYSTEM = `You are an award-winning short-form video director and scriptwriter.
You plan first, then write. Every scene must add NEW information (a fact, example, number, story beat or consequence) — never restate an earlier scene.
Write like a sharp human narrator: concrete, specific, surprising. Vary sentence openings and rhythm.
Never repeat the viewer's prompt word for word; refer to the subject naturally.
Be accurate: use well-established facts only. Do not invent statistics, exact numbers, dates, names or quotes — if unsure, describe it without a number.
Banned phrases: ${CLICHES.slice(0, 14).map((c) => `"${c}"`).join(", ")}.
Reply with ONLY one valid JSON object, no markdown.`;

export function directorUserPrompt(args: {
  prompt: string;
  count: number;
  formatLabel: string;
  tone: string;
  language: string;
  duration: number;
  cast: string;
  structure: string;
}): string {
  return `Brief: "${args.prompt}"
Format: ${args.formatLabel}, ${args.count} scenes, about ${args.duration}s total, tone: ${args.tone}, language: ${args.language}. Cast / people: ${args.cast}.
Structure to follow: ${args.structure}.

First plan: choose a fresh angle, then list ${args.count} DISTINCT points in "outline" (one per scene, no overlaps).
Then write each scene:
- narration: 1–2 spoken sentences, max 28 words, delivering that scene's point with something specific.
- caption: 2–5 punchy on-screen words that are NOT copied from the narration.
- shotType: one of: ${SHOT_TYPES.join(", ")} (use at least 4 different types across the video).
- camera: one of: ${CAMERA_MOVES.join(", ")}.
- mediaQuery: 2–4 concrete, filmable stock-video keywords for THIS scene (real people/places/objects, different for every scene).
- visualPrompt: one vivid sentence for an AI video model: subject + action + setting + light (no text in frame).
Also give "style": one sentence describing a consistent visual look (palette, lighting, recurring character if any) for the whole video.

Return JSON: {"title": string, "angle": string, "style": string, "outline": [string], "scenes": [{"narration": string, "caption": string, "shotType": string, "camera": string, "mediaQuery": string, "visualPrompt": string}]}`;
}

export function repairUserPrompt(args: {
  prompt: string;
  scenes: { narration: string; caption: string }[];
  weakScenes: number[];
  issues: string[];
}): string {
  return `Brief: "${args.prompt}"
Current script:
${args.scenes.map((s, i) => `${i + 1}. ${s.narration} [caption: ${s.caption}]`).join("\n")}

Problems found: ${args.issues.slice(0, 8).join(" ")}
Rewrite ONLY scenes ${args.weakScenes.map((i) => i + 1).join(", ")} so every scene says something new, opens differently and avoids the problems. Keep the story flowing.
Return JSON: {"scenes": [{"index": number (1-based), "narration": string, "caption": string, "mediaQuery": string, "visualPrompt": string}]}`;
}

/** Narrative structure per format, so different formats feel different. */
export function structureFor(workflow: string, prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\b(history|origin|evolution|story of|how .* (changed|began|started|became))\b/.test(p)) {
    return "cold-open on a surprising moment → origins → turning point → how it spread → impact on everyday life → where it stands now";
  }
  if (/^\s*(\d+|top \d+)\b|\b\d+ (ways|tips|reasons|mistakes|things|habits)\b/.test(p)) {
    return "hook that teases the best item → one item per scene, each with a concrete example → strongest item last → quick recap";
  }
  if (/\bhow to\b/.test(p)) {
    return "show the end result first → why most people get it wrong → step-by-step (one step per scene) → common mistake to avoid → result";
  }
  if (workflow === "commercial") return "problem the viewer feels → product reveal → key benefit with proof → second benefit → social proof → clear call to action";
  if (workflow === "documentary") return "atmospheric cold open → context → tension or conflict → discovery → consequences → reflective close";
  if (workflow === "shorts") return "3-second scroll-stopping hook (surprising claim or question) → quick context → escalating insights → payoff → short call to action";
  return "hook with a question or surprising fact → context → main insights with examples → practical takeaway → memorable closing line";
}

// ─── Filmable visuals & readable captions ─────────────────────────────────

/** Ideas → concrete, filmable shots (used for stock searches and AI video prompts). */
const VISUAL_LEXICON: [RegExp, string][] = [
  [/\b(notification|phone|scroll|social media|screen)s?\b/i, "hand scrolling smartphone notifications"],
  [/\b(morning|sunrise|wake|dawn)\b/i, "sunrise morning routine window light"],
  [/\b(focus|concentrat|deep work|priority)\w*/i, "person focused writing at desk"],
  [/\b(willpower|motivation|discipline|habit)s?\b/i, "person checking off daily habit tracker"],
  [/\b(friction|clutter|distract)\w*/i, "clearing cluttered desk"],
  [/\b(trade|route|merchant|export|import)s?\b/i, "cargo ship at busy harbor"],
  [/\b(market|bazaar|vendor)s?\b/i, "bustling outdoor market vendors"],
  [/\b(cit(y|ies)|urban|street)\b/i, "busy city street crowd"],
  [/\b(industr(y|ies)|factory|production|manufactur)\w*/i, "factory production line workers"],
  [/\b(business|company|companies|economy|econom)\w*/i, "business people meeting office"],
  [/\b(history|ancient|centur(y|ies)|origin|legend)\w*/i, "old world map and antique artifacts"],
  [/\b(farm|harvest|crop|grow|plant|beans?)\b/i, "farmers harvesting crops in field"],
  [/\b(ritual|tradition|culture|ceremon)\w*/i, "people sharing a traditional ritual"],
  [/\b(research|scien|study|studies|evidence|data)\w*/i, "scientist analyzing data in lab"],
  [/\b(team|people|community|friends|family)\b/i, "group of people laughing together"],
  [/\b(money|price|cost|save|budget)\w*/i, "counting money at kitchen table"],
  [/\b(travel|journey|road|world|global)\b/i, "aerial view winding road landscape"],
  [/\b(learn|school|student|teach)\w*/i, "students learning in classroom"],
  [/\b(tech|software|app|computer|ai|automation)\b/i, "developer coding on laptop"],
  [/\b(health|exercise|workout|fitness|run)\w*/i, "person running at sunrise"],
  [/\b(food|cook|kitchen|meal|recipe)\w*/i, "chef cooking in kitchen close-up"],
  [/\b(cafe|coffee|espresso|barista)\b/i, "barista pouring coffee in cafe"],
];

/** A concrete, filmable visual for a line of narration. */
export function visualForLine(narration: string, subject: string, index: number): string {
  // Use the idea that appears FIRST in the line ("Cities, habits and…" → cities).
  let best: { at: number; shot: string } | null = null;
  for (const [re, shot] of VISUAL_LEXICON) {
    const m = re.exec(narration);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, shot };
  }
  if (best) return best.shot.includes(subject.split(" ")[0]) ? best.shot : `${best.shot}, ${subject}`;
  const fallbacks = ["close-up detail of", "people interacting with", "wide view of", "hands working with"];
  return `${fallbacks[index % fallbacks.length]} ${subject}`;
}

const LEAD_INS = /^(here'?s the trap|what works|the fix is simpler than it sounds|try this instead|it isn'?t theory|sound familiar\??|and the evidence is clear|that'?s when it clicks|do that and|the result is simple|behind it|the numbers back it up)[:,.—-]*\s*/i;

/** A short, readable caption: the key clause of the line, 2–4 words. */
export function captionFromLine(narration: string): string {
  const clauses = narration
    .replace(LEAD_INS, "")
    .split(/[:—–;]|\.\s|,\s(?=and\s)/)
    .map((c) => c.trim())
    .filter((c) => c.split(/\s+/).length >= 2);
  const clause = clauses[0] ?? narration;
  const tokens = clause.replace(/[^A-Za-z0-9'\s-]/g, "").split(/\s+/).filter(Boolean);
  const trimmed = tokens.slice(0, 4);
  const weak = new Set(["whole", "not", "just", "still", "very", "before", "even", "also", "really"]);
  while (trimmed.length > 2 && (STOP.has(trimmed[trimmed.length - 1].toLowerCase()) || weak.has(trimmed[trimmed.length - 1].toLowerCase()))) {
    trimmed.pop();
  }
  return trimmed.map((w) => (STOP.has(w.toLowerCase()) ? w.toLowerCase() : titleWord(w.toLowerCase()))).join(" ").replace(/^./, (c) => c.toUpperCase());
}
