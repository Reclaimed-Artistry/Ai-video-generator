import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { synthesizeSpeech, type SpokenWord } from "./tts";
import { LOCAL_CATALOG, getLocalAsset, matchLocalAsset, pickSource } from "./stock";
import { getFontsDir, probeDuration, runFfmpeg } from "./ffmpeg";
import { musicFilePath, resolveMusicTrack } from "./music";
import { getProject, updateProject } from "./projects";
import {
  getProjectScratchDir,
  IS_VERCEL,
  isBlobConfigured,
  saveRenderArtifact,
} from "./storage";
import {
  ASPECTS,
  RESOLUTIONS,
  resolveSettings,
  type AspectRatio,
  type Resolution,
  type Scene,
  type Style,
  type Tone,
  type VideoSettings,
} from "./types";

export function projectDir(id: string): string {
  return getProjectScratchDir(id);
}

export function fileUrl(...parts: string[]): string {
  return `/api/files/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

export function outputUrl(id: string): string {
  return fileUrl("renders", id, "output.mp4");
}

export function posterUrl(id: string): string {
  return fileUrl("renders", id, "poster.jpg");
}

function targetSize(resolution: Resolution, aspect: AspectRatio) {
  const base = RESOLUTIONS[resolution] ?? RESOLUTIONS["1080p"];
  const ratio = ASPECTS[aspect]?.ratio ?? 16 / 9;
  // The short side of the resolution badge (240 / 360 / 1080) drives the size.
  const short = Math.min(base.width, base.height);
  let width = short;
  let height = short;
  if (ratio >= 1) {
    width = Math.round(short * ratio);
  } else {
    height = Math.round(short / ratio);
  }
  width = Math.max(64, Math.round(width / 2) * 2);
  height = Math.max(64, Math.round(height / 2) * 2);
  return { width, height };
}

/* ────────────────────────── Subtitles (ASS) ────────────────────────── */

type SubStyle = {
  fontsize: number;
  /** Colour a word turns once it has been spoken (karaoke highlight). */
  spoken: string;
  /** Colour of words not yet spoken. */
  upcoming: string;
  outline: string;
  back: string;
  borderStyle: number;
  outlineWidth: number;
  shadow: number;
  alignment: number;
  marginV: number;
  marginH: number;
  uppercase: boolean;
};

function subtitleStyle(style: Style, width: number, height: number): SubStyle {
  const minDim = Math.min(width, height);
  const vertical = height > width;
  const base: SubStyle = {
    fontsize: Math.max(13, Math.round(minDim / (vertical ? 12 : 14))),
    spoken: "&H0000D7FF", // gold (ASS colours are &HAABBGGRR)
    upcoming: "&H00FFFFFF",
    outline: "&H00101010",
    back: "&H90000000",
    borderStyle: 1,
    outlineWidth: Math.max(1.5, minDim / 220),
    shadow: Math.max(0.8, minDim / 500),
    alignment: 2,
    marginV: Math.round(height * (vertical ? 0.2 : 0.09)),
    marginH: Math.round(width * 0.07),
    uppercase: false,
  };
  switch (style) {
    case "energetic":
      return { ...base, fontsize: Math.round(base.fontsize * 1.12), spoken: "&H0033FF66", uppercase: true };
    case "cinematic":
      return { ...base, fontsize: Math.round(base.fontsize * 0.88), spoken: "&H00FFFFFF", outlineWidth: base.outlineWidth * 0.8 };
    case "corporate":
      return { ...base, borderStyle: 3, back: "&H40552A12", outline: "&H40552A12", spoken: "&H00FFD9A6", outlineWidth: Math.max(4, minDim / 90), shadow: 0 };
    case "minimal":
      return { ...base, fontsize: Math.round(base.fontsize * 0.9), spoken: "&H00FFFFFF", upcoming: "&H00D0D0D0", outlineWidth: 0, shadow: Math.max(1, minDim / 300), alignment: 1 };
    default:
      return base;
  }
}

function assTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function cleanAssText(value: string): string {
  return value.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
}

/** Estimate word timings when the voice engine does not report them. */
function estimateWords(narration: string, spokenSeconds: number): SpokenWord[] {
  const tokens = narration.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const weights = tokens.map((token) => token.length + 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const usable = Math.max(0.5, spokenSeconds - 0.1);
  let cursor = 0.05;
  return tokens.map((token, index) => {
    const span = (weights[index] / total) * usable;
    const word = { text: token, start: cursor, end: cursor + span * 0.92 };
    cursor += span;
    return word;
  });
}

/** Group words into short readable lines, breaking on pauses and length. */
function chunkWords(words: SpokenWord[], maxWords: number, maxChars: number): SpokenWord[][] {
  const chunks: SpokenWord[][] = [];
  let current: SpokenWord[] = [];
  let chars = 0;
  words.forEach((word, index) => {
    const previous = words[index - 1];
    const pause = previous ? word.start - previous.end : 0;
    const sentenceEnd = previous ? /[.!?…:;]$/.test(previous.text) : false;
    if (
      current.length > 0 &&
      (current.length >= maxWords || chars + word.text.length > maxChars || pause > 0.38 || sentenceEnd)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(word);
    chars += word.text.length + 1;
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function buildSceneAss(options: {
  scene: Scene;
  words: SpokenWord[];
  sceneSeconds: number;
  width: number;
  height: number;
  style: Style;
  subtitles: boolean;
  headlines: boolean;
}): string {
  const { scene, words, sceneSeconds, width, height, style } = options;
  const sub = subtitleStyle(style, width, height);
  const minDim = Math.min(width, height);
  const vertical = height > width;
  const headSize = Math.max(11, Math.round(minDim / (vertical ? 18 : 20)));
  const styleLine = (name: string, s: Partial<SubStyle> & { fontsize: number }) =>
    [
      `Style: ${name}`,
      "DejaVu Sans",
      s.fontsize,
      s.spoken ?? sub.spoken,
      s.upcoming ?? sub.upcoming,
      s.outline ?? sub.outline,
      s.back ?? sub.back,
      "-1",
      "0",
      "0",
      "0",
      "100",
      "100",
      "0",
      "0",
      String(s.borderStyle ?? sub.borderStyle),
      String(s.outlineWidth ?? sub.outlineWidth),
      String(s.shadow ?? sub.shadow),
      String(s.alignment ?? sub.alignment),
      String(s.marginH ?? sub.marginH),
      String(s.marginH ?? sub.marginH),
      String(s.marginV ?? sub.marginV),
      "1",
    ].join(",");

  const events: string[] = [];

  if (options.headlines && scene.caption?.trim()) {
    const headText = cleanAssText(scene.caption);
    const end = Math.min(2.4, Math.max(1.2, sceneSeconds - 0.3));
    events.push(`Dialogue: 1,${assTime(0.15)},${assTime(end)},Head,,0,0,0,,{\\fad(250,350)}${headText}`);
  }

  if (options.subtitles && words.length) {
    const chunks = chunkWords(words, vertical ? 3 : 6, vertical ? 18 : 34);
    chunks.forEach((chunk, index) => {
      const start = chunk[0].start;
      const nextStart = chunks[index + 1]?.[0].start;
      const end = Math.min(sceneSeconds, nextStart ?? chunk[chunk.length - 1].end + 0.35);
      const text = chunk
        .map((word, wordIndex) => {
          const next = chunk[wordIndex + 1];
          const centis = Math.max(1, Math.round(((next ? next.start : word.end) - word.start) * 100));
          const label = cleanAssText(sub.uppercase ? word.text.toUpperCase() : word.text);
          return `{\\k${centis}}${label}`;
        })
        .join(" ");
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Sub,,0,0,0,,${text}`);
    });
  } else if (!options.headlines && scene.caption?.trim()) {
    // Subtitles off and no headline: keep the caption visible for the scene.
    events.push(`Dialogue: 0,${assTime(0)},${assTime(sceneSeconds)},Sub,,0,0,0,,${cleanAssText(scene.caption)}`);
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    styleLine("Sub", { fontsize: sub.fontsize }),
    styleLine("Head", {
      fontsize: headSize,
      spoken: "&H00FFFFFF",
      upcoming: "&H00FFFFFF",
      back: "&H66000000",
      outline: "&H66000000",
      borderStyle: 3,
      outlineWidth: Math.max(3, minDim / 80),
      shadow: 0,
      alignment: style === "minimal" ? 7 : 8,
      marginV: Math.round(height * (vertical ? 0.1 : 0.07)),
      marginH: Math.round(width * 0.06),
    }),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

/* ─────────────────────────── Media helpers ─────────────────────────── */

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download media (${response.status})`);
  }
  const stream = Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>);
  await pipeline(stream, fs.createWriteStream(destination));
}

type ResolvedMedia = { url: string; kind: "video" | "generated" };

/** Scenes always end up with real stock video footage. */
async function resolveMedia(scene: Scene, targetHeight: number): Promise<ResolvedMedia> {
  if (scene.mediaId) {
    const asset = getLocalAsset(scene.mediaId);
    if (asset && asset.type === "video") {
      const source = pickSource(asset, targetHeight);
      if (source) return { url: source.url, kind: "video" };
    }
  }
  if (scene.mediaUrl && scene.mediaType !== "photo") {
    return { url: scene.mediaUrl, kind: "video" };
  }
  const matched = matchLocalAsset(scene.mediaQuery, "video");
  if (matched) {
    const source = pickSource(matched, targetHeight);
    if (source) return { url: source.url, kind: "video" };
  }
  const fallback = LOCAL_CATALOG.find((asset) => asset.type === "video");
  if (fallback) {
    const source = pickSource(fallback, targetHeight);
    if (source) return { url: source.url, kind: "video" };
  }
  return { url: "", kind: "generated" };
}

function escapeFilterPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function renderSceneVideo(options: {
  scene: Scene;
  index: number;
  dir: string;
  width: number;
  height: number;
  seconds: number;
  ass: string;
}): Promise<string> {
  const { scene, index, dir, width, height, seconds } = options;
  const tag = String(index).padStart(2, "0");
  const output = path.join(dir, `scene-${tag}.mp4`);
  const captionFile = path.join(dir, `subs-${tag}.ass`);
  fs.writeFileSync(captionFile, options.ass, "utf8");

  const fontsDir = getFontsDir();
  const captionFilter = fontsDir
    ? `ass=filename=${escapeFilterPath(captionFile)}:fontsdir=${escapeFilterPath(fontsDir)}`
    : `ass=${escapeFilterPath(captionFile)}`;
  const encode = [
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-r", "30", ...(IS_VERCEL ? ["-threads", "2"] : []), "-an", output,
  ];

  const media = await resolveMedia(scene, height);
  try {
    if (media.kind === "generated" || !media.url) {
      await runFfmpeg([
        "-y", "-f", "lavfi",
        "-i", `gradients=s=${width}x${height}:c0=0x121210:c1=0x262521:d=${Math.ceil(seconds)}:r=30`,
        "-t", seconds.toFixed(3), "-vf", captionFilter, ...encode,
      ]);
      return output;
    }

    const extension = media.url.toLowerCase().includes(".webm") ? "webm" : "mp4";
    const mediaFile = path.join(dir, `media-${tag}.${extension}`);
    await download(media.url, mediaFile);
    try {
      await runFfmpeg([
        "-y", "-stream_loop", "-1", "-i", mediaFile,
        "-t", seconds.toFixed(3),
        "-vf", [
          `scale=${width}:${height}:force_original_aspect_ratio=increase`,
          `crop=${width}:${height}`,
          "setsar=1",
          "fps=30",
          captionFilter,
        ].join(","),
        ...encode,
      ]);
    } finally {
      fs.rmSync(/* turbopackIgnore: true */ mediaFile, { force: true });
    }
    return output;
  } finally {
    fs.rmSync(/* turbopackIgnore: true */ captionFile, { force: true });
  }
}

function transitionFor(settings: Required<VideoSettings>, style: Style, tone: Tone) {
  if (settings.transition === "none") return null;
  if (settings.transition === "slide") return { name: "slideleft", seconds: 0.45 };
  if (settings.transition === "fade") return { name: "fade", seconds: 0.5 };
  if (style === "energetic" || tone === "energetic") return { name: "smoothleft", seconds: 0.4 };
  if (style === "cinematic" || tone === "cinematic") return { name: "fade", seconds: 0.7 };
  return { name: "fade", seconds: 0.5 };
}

/* ─────────────────────────── Main pipeline ─────────────────────────── */

export async function renderProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const dir = projectDir(projectId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const { width, height } = targetSize(project.resolution, project.aspect);
  const scenes = project.script.scenes ?? [];
  if (scenes.length === 0) throw new Error("The script has no scenes");
  const settings = resolveSettings(project.script.settings);
  const transition = scenes.length > 1 ? transitionFor(settings, project.style, project.tone) : null;
  const overlap = transition?.seconds ?? 0;

  await updateProject(projectId, {
    status: "rendering",
    progress: 2,
    stage: "Recording voiceover",
    error: null,
  });

  // 1. Voiceover for every scene (word timings drive subtitles and scene length).
  const voices: { file: string; seconds: number; words: SpokenWord[] }[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    await updateProject(projectId, {
      progress: Math.round(3 + (index / scenes.length) * 22),
      stage: `Recording voiceover ${index + 1} of ${scenes.length}`,
    });
    const text = scene.narration?.trim() ? scene.narration : scene.caption || " ";
    const speech = await synthesizeSpeech(text, project.voice, project.language);
    const file = path.join(dir, `voice-${String(index).padStart(2, "0")}.${speech.ext}`);
    fs.writeFileSync(file, speech.data);
    const spoken = await probeDuration(file);
    const manual = scene.duration ?? 0;
    const seconds = Math.min(45, Math.max(2.6, spoken + 0.45, manual > 0 ? manual : 0));
    voices.push({
      file,
      seconds,
      words: speech.words?.length ? speech.words : estimateWords(text, spoken),
    });
  }

  // 2. Visuals: each scene is rendered `overlap` longer so crossfades never shift the voice.
  const sceneFiles: string[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    await updateProject(projectId, {
      progress: Math.round(25 + (index / scenes.length) * 55),
      stage: `Compositing scene ${index + 1} of ${scenes.length}`,
    });
    const isLast = index === scenes.length - 1;
    const seconds = voices[index].seconds + (isLast ? 0 : overlap);
    const ass = buildSceneAss({
      scene: scenes[index],
      words: voices[index].words,
      sceneSeconds: seconds,
      width,
      height,
      style: project.style,
      subtitles: settings.subtitles,
      headlines: settings.headlines,
    });
    sceneFiles.push(
      await renderSceneVideo({ scene: scenes[index], index, dir, width, height, seconds, ass }),
    );
  }

  // 3. One final pass: crossfaded picture + voice (padded per scene) + ducked music.
  await updateProject(projectId, {
    progress: 82,
    stage: transition ? "Adding transitions, music and final mix" : "Adding music and final mix",
  });

  const total = voices.reduce((sum, voice) => sum + voice.seconds, 0);
  const track = resolveMusicTrack(settings.music, project.tone);
  const musicFile = track ? musicFilePath(track) : null;

  const inputs: string[] = [];
  sceneFiles.forEach((file) => inputs.push("-i", file));
  voices.forEach((voice) => inputs.push("-i", voice.file));
  if (musicFile) inputs.push("-stream_loop", "-1", "-i", musicFile);

  const n = scenes.length;
  const filters: string[] = [];
  for (let index = 0; index < n; index += 1) {
    filters.push(`[${index}:v]settb=AVTB,fps=30,format=yuv420p,setsar=1[v${index}]`);
  }
  if (transition && n > 1) {
    let previous = "v0";
    let offset = 0;
    for (let index = 1; index < n; index += 1) {
      offset += voices[index - 1].seconds;
      const label = index === n - 1 ? "vout" : `x${index}`;
      filters.push(
        `[${previous}][v${index}]xfade=transition=${transition.name}:duration=${overlap}:offset=${offset.toFixed(3)}[${label}]`,
      );
      previous = label;
    }
  } else {
    filters.push(`${Array.from({ length: n }, (_, index) => `[v${index}]`).join("")}concat=n=${n}:v=1:a=0[vout]`);
  }

  voices.forEach((voice, index) => {
    filters.push(
      `[${n + index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${voice.seconds.toFixed(3)},atrim=0:${voice.seconds.toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`,
    );
  });
  filters.push(`${voices.map((_, index) => `[a${index}]`).join("")}concat=n=${n}:v=0:a=1[voice]`);

  if (musicFile) {
    const fadeOutStart = Math.max(0, total - 2.5);
    const level = Math.min(1, Math.max(0, settings.musicVolume));
    filters.push(
      `[${2 * n}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=${level.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=2.5[music]`,
      "[voice]asplit=2[vmain][vkey]",
      "[music][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=400[ducked]",
      "[vmain][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[aout]",
    );
  } else {
    filters.push("[voice]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[aout]");
  }

  const output = path.join(dir, "output.mp4");
  await runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-r", "30",
    ...(IS_VERCEL ? ["-threads", "2"] : []),
    "-c:a", "aac", "-b:a", "160k", "-ac", "2",
    "-movflags", "+faststart",
    output,
  ]);

  for (const file of [...sceneFiles, ...voices.map((voice) => voice.file)]) {
    fs.rmSync(/* turbopackIgnore: true */ file, { force: true });
  }

  const poster = path.join(dir, "poster.jpg");
  try {
    await runFfmpeg([
      "-y", "-ss", Math.min(1.2, total / 3).toFixed(2), "-i", output,
      "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", poster,
    ]);
  } catch {
    // poster is optional
  }

  await updateProject(projectId, {
    progress: 94,
    stage: isBlobConfigured() ? "Uploading master to Vercel Blob" : "Saving rendered master",
  });

  const savedOutputPath = await saveRenderArtifact(projectId, "output.mp4", output, "video/mp4");
  const hasPoster = fs.existsSync(/* turbopackIgnore: true */ poster);
  const savedPosterPath = hasPoster
    ? await saveRenderArtifact(projectId, "poster.jpg", poster, "image/jpeg")
    : null;

  // On Vercel or when Blob owns the deliverables, wipe the /tmp scratch dir.
  if (IS_VERCEL || isBlobConfigured()) {
    fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  } else {
    for (const file of fs.readdirSync(/* turbopackIgnore: true */ dir)) {
      if (file === "output.mp4" || file === "poster.jpg") continue;
      fs.rmSync(/* turbopackIgnore: true */ path.join(dir, file), { force: true });
    }
  }

  await updateProject(projectId, {
    status: "done",
    progress: 100,
    stage: "Ready to share",
    error: null,
    outputPath: savedOutputPath,
    posterPath: savedPosterPath,
  });
}

export async function runRenderJob(projectId: string): Promise<void> {
  const jobs = jobMap();
  jobs.set(projectId, { status: "running", error: null, startedAt: Date.now() });
  try {
    await renderProject(projectId);
    jobs.set(projectId, { status: "done", error: null, startedAt: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render failed";
    jobs.set(projectId, { status: "error", error: message, startedAt: Date.now() });
    await updateProject(projectId, {
      status: "error",
      stage: "Render failed",
      error: message,
    }).catch(() => undefined);
  }
}

type JobState = {
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  startedAt: number;
};

const globalForJobs = globalThis as typeof globalThis & {
  __renderJobs?: Map<string, JobState>;
};

function jobMap(): Map<string, JobState> {
  if (!globalForJobs.__renderJobs) globalForJobs.__renderJobs = new Map();
  return globalForJobs.__renderJobs;
}

export function getJobState(projectId: string): JobState {
  return jobMap().get(projectId) ?? { status: "idle", error: null, startedAt: 0 };
}

export function startRender(projectId: string): boolean {
  const existing = jobMap().get(projectId);
  if (existing?.status === "running") return false;
  void runRenderJob(projectId);
  return true;
}
