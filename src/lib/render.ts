import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { getFontsDir, probeDuration, runFfmpeg } from "./ffmpeg";
import { defaultMusicForTone, getMusicTrack } from "./music";
import { getProject, updateProject } from "./projects";
import {
  getLocalAsset,
  isAbstractAsset,
  matchLocalAsset,
  matchVideoForNarration,
  pickSource,
  VIDEO_CATALOG,
} from "./stock";
import {
  getProjectScratchDir,
  IS_VERCEL,
  isBlobConfigured,
  loadStoredMedia,
  saveRenderArtifact,
  storesArtifactsExternally,
} from "./storage";
import { estimateWordTimings, synthesizeSpeech, type WordTiming } from "./tts";
import {
  ASPECTS,
  RESOLUTIONS,
  type AspectRatio,
  type CaptionMode,
  type CaptionPosition,
  type MediaFilter,
  type PeopleRepresentation,
  type Project,
  type Resolution,
  type Scene,
  type Style,
  type AiMotion,
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
  const short = Math.min(base.width, base.height);
  let width = short;
  let height = short;
  if (ratio >= 1) {
    height = short;
    width = Math.round(short * ratio);
  } else {
    width = short;
    height = Math.round(short / ratio);
  }
  width = Math.max(64, Math.round(width / 2) * 2);
  height = Math.max(64, Math.round(height / 2) * 2);
  return { width, height };
}

type CaptionStyleConfig = {
  fontname: string;
  fontsize: number;
  primary: string;
  highlight: string; // ASS &H00BBGGRR
  outlineColour: string;
  backColour: string;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  bold: boolean;
};

function captionStyle(
  style: Style,
  width: number,
  height: number,
  captionMode: CaptionMode,
  captionPosition: CaptionPosition = "bottom",
): CaptionStyleConfig {
  const isVertical = height > width;
  const baseFont = Math.max(
    14,
    Math.round(height / (isVertical ? 24 : captionMode === "word-highlight" ? 16 : 18)),
  );
  const posAlignment =
    captionPosition === "top" ? 8 : captionPosition === "center" ? 5 : 2;
  const base: CaptionStyleConfig = {
    fontname: "DejaVu Sans",
    fontsize: baseFont,
    primary: "&H00F2EFE9",
    highlight: "&H003CA9E5", // Warm tungsten amber (#E5A93C in ASS BGR)
    outlineColour: "&H00121210",
    backColour: "&H990B0B0A",
    borderStyle: 1,
    outline: Math.max(1.8, Number((height / 170).toFixed(1))),
    shadow: Math.max(1.0, Number((height / 320).toFixed(1))),
    alignment: posAlignment,
    marginL: Math.max(20, Math.round(width * 0.06)),
    marginR: Math.max(20, Math.round(width * 0.06)),
    marginV:
      captionPosition === "center"
        ? 0
        : Math.max(16, Math.round(height * (isVertical ? 0.14 : 0.09))),
    bold: true,
  };
  switch (style) {
    case "minimal":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(baseFont * 0.88)),
        highlight: "&H00FFFFFF",
        outline: Math.max(1.2, base.outline * 0.6),
        shadow: 0.8,
        alignment:
          captionMode === "headline" && captionPosition === "bottom"
            ? 1
            : posAlignment,
      };
    case "cinematic":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(baseFont * 0.9)),
        highlight: "&H00C4DCE8",
        outlineColour: "&H00000000",
        marginV:
          captionPosition === "center"
            ? 0
            : Math.max(16, Math.round(height * 0.11)),
      };
    case "energetic":
      return {
        ...base,
        primary: "&H00FFFFFF",
        highlight: "&H0066E0FF", // Vibrant yellow-gold
        outline: Math.max(2.2, base.outline * 1.15),
      };
    case "corporate":
      return {
        ...base,
        borderStyle: 3,
        backColour: "&HCC603018",
        highlight: "&H003CA9E5",
        outlineColour: "&H00181818",
      };
    default:
      return base;
  }
}

function ffmpegColorFilter(grade?: MediaFilter | null): string | null {
  switch (grade) {
    case "warm":
      return "eq=contrast=1.06:saturation=1.18,colorbalance=rs=0.06:gs=0.02:bs=-0.05";
    case "cool":
      return "eq=contrast=1.08:saturation=1.12,colorbalance=rs=-0.04:gs=0.01:bs=0.07";
    case "vivid":
      return "eq=contrast=1.2:saturation=1.28:brightness=0.02";
    case "noir":
      return "hue=s=0,eq=contrast=1.24";
    default:
      return null;
  }
}

function assTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function escapeAssText(value: string): string {
  return value
    .replace(/\\/g, "")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

/**
 * Splits spoken word timings into readable 3–5 word subtitle phrases (like
 * InVideo AI), breaking naturally on punctuation or character budget.
 */
function chunkWordTimings(
  words: WordTiming[],
  maxChars: number,
  maxWords: number,
): WordTiming[][] {
  const chunks: WordTiming[][] = [];
  let current: WordTiming[] = [];
  let currentChars = 0;

  for (const word of words) {
    const clean = word.text.trim();
    if (!clean) continue;
    const projected = currentChars + (current.length > 0 ? 1 : 0) + clean.length;
    if (
      current.length > 0 &&
      (current.length >= maxWords || projected > maxChars)
    ) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(word);
    currentChars += (current.length > 1 ? 1 : 0) + clean.length;
    if (/[.!?]$/.test(clean) && current.length >= 2) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function buildAssFile(
  scene: Scene,
  duration: number,
  spokenDuration: number,
  wordTimings: WordTiming[],
  width: number,
  height: number,
  style: Style,
  captionMode: CaptionMode,
  captionPosition: CaptionPosition = "bottom",
): string {
  const cfg = captionStyle(style, width, height, captionMode, captionPosition);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Caption",
      cfg.fontname,
      cfg.fontsize,
      cfg.primary,
      "&H000000FF",
      cfg.outlineColour,
      cfg.backColour,
      cfg.bold ? "-1" : "0",
      "0",
      "0",
      "0",
      "100",
      "100",
      "0",
      "0",
      String(cfg.borderStyle),
      String(cfg.outline),
      String(cfg.shadow),
      String(cfg.alignment),
      String(cfg.marginL),
      String(cfg.marginR),
      String(cfg.marginV),
      "1",
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const dialogues: string[] = [];

  if (captionMode === "headline") {
    const text = escapeAssText(scene.caption || scene.narration) || " ";
    dialogues.push(
      `Dialogue: 0,0:00:00.00,${assTimestamp(duration)},Caption,,0,0,0,,${text}`,
    );
  } else {
    const narrationText = (scene.narration || scene.caption || "").trim();
    const effectiveWords =
      wordTimings.length > 0
        ? wordTimings
        : estimateWordTimings(narrationText, Math.max(1.5, spokenDuration));

    const isVertical = height > width;
    const chunks = chunkWordTimings(
      effectiveWords,
      isVertical ? 22 : 34,
      isVertical ? 4 : 6,
    );

    if (chunks.length === 0) {
      const fallback = escapeAssText(narrationText) || " ";
      dialogues.push(
        `Dialogue: 0,0:00:00.00,${assTimestamp(duration)},Caption,,0,0,0,,${fallback}`,
      );
    } else if (captionMode === "word-highlight") {
      for (let cIdx = 0; cIdx < chunks.length; cIdx += 1) {
        const chunk = chunks[cIdx];
        const nextChunkStart = chunks[cIdx + 1]?.[0]?.startSec;

        for (let wIdx = 0; wIdx < chunk.length; wIdx += 1) {
          const activeWord = chunk[wIdx];
          const start = activeWord.startSec;
          const nextWordStart = chunk[wIdx + 1]?.startSec;
          const naturalEnd =
            nextWordStart ??
            (nextChunkStart
              ? Math.min(activeWord.endSec + 0.25, nextChunkStart)
              : Math.min(duration, activeWord.endSec + 0.35));
          const end = Math.max(start + 0.08, Math.min(duration, naturalEnd));

          const renderedLine = chunk
            .map((word, idx) => {
              const safe = escapeAssText(word.text);
              if (idx === wIdx) {
                return `{\\c${cfg.highlight}\\b1}${safe}{\\r}`;
              }
              return safe;
            })
            .join(" ");

          dialogues.push(
            `Dialogue: 0,${assTimestamp(start)},${assTimestamp(end)},Caption,,0,0,0,,${renderedLine}`,
          );
        }
      }
    } else {
      // Clean broadcast timed subtitle phrases
      for (let cIdx = 0; cIdx < chunks.length; cIdx += 1) {
        const chunk = chunks[cIdx];
        const start = chunk[0].startSec;
        const lastEnd = chunk[chunk.length - 1].endSec;
        const nextStart = chunks[cIdx + 1]?.[0]?.startSec;
        const end = Math.max(
          start + 0.2,
          Math.min(duration, nextStart ?? lastEnd + 0.3),
        );
        const line = chunk.map((w) => escapeAssText(w.text)).join(" ");
        dialogues.push(
          `Dialogue: 0,${assTimestamp(start)},${assTimestamp(end)},Caption,,0,0,0,,${line}`,
        );
      }
    }
  }

  return [...header, ...dialogues, ""].join("\n");
}

async function download(url: string, destination: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  const out = fs.createWriteStream(/* turbopackIgnore: true */ destination);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "ReclaimedArtistry/1.0 (https://github.com/Reclaimed-Artistry/Ai-video-generator)",
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Could not download media (${response.status})`);
    }
    // Explicit read loop (instead of Readable.fromWeb + pipeline): an abort or
    // dropped connection rejects here as a normal, catchable error and can
    // never surface as an uncaught "ReadableStream is already closed".
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(value)) await once(out, "drain");
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
  } finally {
    clearTimeout(timer);
    out.end();
    await finished(out).catch(() => undefined);
  }
}

const MOTION_CYCLE: AiMotion[] = ["push-in", "pan-right", "pull-out", "pan-left"];

function defaultMotion(index: number): AiMotion {
  return MOTION_CYCLE[index % MOTION_CYCLE.length];
}

/**
 * Turn a still (AI-generated) image into a moving shot: upscale 1.5x for
 * smooth sub-pixel motion, then push in / pull out / pan across the scene.
 */
function cameraMotionFilters(
  motion: AiMotion,
  width: number,
  height: number,
  duration: number,
): string[] {
  const frames = Math.max(1, Math.round(duration * 30));
  const sw = Math.round((width * 1.5) / 2) * 2;
  const sh = Math.round((height * 1.5) / 2) * 2;
  const amount = 0.18;
  let zoom: string;
  let x = "iw/2-(iw/zoom/2)";
  const y = "ih/2-(ih/zoom/2)";
  switch (motion) {
    case "pull-out":
      zoom = `${1 + amount}-${amount}*on/${frames}`;
      break;
    case "pan-left":
      zoom = "1.15";
      x = `(iw-iw/zoom)*(1-on/${frames})`;
      break;
    case "pan-right":
      zoom = "1.15";
      x = `(iw-iw/zoom)*on/${frames}`;
      break;
    default:
      zoom = `1+${amount}*on/${frames}`;
  }
  return [
    `scale=${sw}:${sh}:force_original_aspect_ratio=increase`,
    `crop=${sw}:${sh}`,
    `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=30`,
    "setsar=1",
  ];
}

type ResolvedMedia = { url: string; fallbackUrl?: string; kind: "video" | "image" | "generated" };

async function resolveMedia(
  scene: Scene,
  targetHeight: number,
  topicContext = "",
  peopleRepresentation: PeopleRepresentation = "all",
  usedIds: string[] = [],
): Promise<ResolvedMedia> {
  const localFallbackAsset =
    matchLocalAsset(
      scene.mediaQuery || scene.narration || scene.caption || topicContext || "office",
      "video",
      usedIds,
      peopleRepresentation,
    ) ?? VIDEO_CATALOG[0];
  const fallbackUrl = localFallbackAsset
    ? pickSource(localFallbackAsset, targetHeight)?.url
    : undefined;

  // Generated (AI) visual: AI video clips play as footage; AI images get camera motion.
  if (scene.mediaSource === "ai" && scene.mediaUrl) {
    return {
      url: scene.mediaUrl,
      fallbackUrl,
      kind: scene.mediaType === "video" ? "video" : "image",
    };
  }

  // Reject any stale abstract clip attached to an old project and replace with real footage
  const existingIsAbstract = Boolean(
    scene.mediaTitle &&
      isAbstractAsset({
        title: scene.mediaTitle,
        tags: [],
        pageUrl: scene.mediaUrl ?? "",
      }),
  );

  if (!existingIsAbstract && scene.mediaId) {
    const asset = getLocalAsset(scene.mediaId);
    if (asset && asset.type === "video" && !isAbstractAsset(asset)) {
      const source = pickSource(asset, targetHeight);
      if (source) return { url: source.url, fallbackUrl, kind: "video" };
    }
  }
  if (!existingIsAbstract && scene.mediaUrl && scene.mediaType !== "photo") {
    let renderUrl = scene.mediaUrl;
    if (
      targetHeight >= 720 &&
      renderUrl.includes("assets.mixkit.co/videos/") &&
      renderUrl.endsWith("-360.mp4")
    ) {
      renderUrl = renderUrl.replace(/-360\.mp4$/, "-720.mp4");
    }
    return { url: renderUrl, fallbackUrl, kind: "video" };
  }

  // Match real-world footage directly to narration + chosen people/race option
  const live = await matchVideoForNarration({
    narration: scene.narration || scene.mediaQuery || scene.caption,
    caption: scene.caption,
    topicContext,
    excludeIds: usedIds,
    peopleRepresentation,
  }).catch(() => ({ asset: null, mediaQuery: "" }));
  if (live.asset && !isAbstractAsset(live.asset)) {
    const src = pickSource(live.asset, targetHeight);
    if (src) return { url: src.url, fallbackUrl, kind: "video" };
  }

  if (fallbackUrl) {
    return { url: fallbackUrl, kind: "video" };
  }
  return { url: "", kind: "generated" };
}

async function renderSceneVideo(
  scene: Scene,
  index: number,
  totalScenes: number,
  dir: string,
  width: number,
  height: number,
  style: Style,
  captionMode: CaptionMode,
  captionPosition: CaptionPosition,
  duration: number,
  spokenDuration: number,
  wordTimings: WordTiming[],
  topicContext: string,
  peopleRepresentation: PeopleRepresentation,
  usedIds: string[],
): Promise<string> {
  const output = path.join(dir, `scene-${String(index).padStart(2, "0")}.mp4`);
  const captionFile = path.join(dir, `caption-${String(index).padStart(2, "0")}.ass`);

  let captionFilter: string | null = null;
  if (captionMode !== "off") {
    fs.writeFileSync(
      captionFile,
      buildAssFile(
        scene,
        duration,
        spokenDuration,
        wordTimings,
        width,
        height,
        style,
        captionMode,
        captionPosition,
      ),
      "utf8",
    );
    const fontsDir = getFontsDir();
    const escapedAss = captionFile.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontsDir = fontsDir
      ? fontsDir.replace(/\\/g, "/").replace(/:/g, "\\:")
      : null;
    captionFilter = escapedFontsDir
      ? `ass=filename=${escapedAss}:fontsdir=${escapedFontsDir}`
      : `ass=${escapedAss}`;
  }

  const media = await resolveMedia(
    scene,
    height,
    topicContext,
    peopleRepresentation,
    usedIds,
  );

  if (media.kind === "generated" || !media.url) {
    const gradient = `gradients=s=${width}x${height}:c0=0x121210:c1=0x262521:x0=0:y0=0:x1=${width}:y1=${height}:d=${Math.ceil(duration)}:r=30`;
    const vfParts = captionFilter ? [captionFilter] : ["null"];
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      gradient,
      "-t",
      duration.toFixed(3),
      "-vf",
      vfParts.join(","),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      output,
    ]);
    return output;
  }

  let chosenUrl = media.url;
  let isImage = media.kind === "image";
  const guessExt = (u: string) =>
    u.toLowerCase().includes(".webm") ? "webm" : "mp4";
  let mediaFile = path.join(
    dir,
    `media-${String(index).padStart(2, "0")}.${isImage ? "img" : guessExt(chosenUrl)}`,
  );

  try {
    // Stored references (/api/files/..., data:) load locally; remote URLs download.
    const loaded = await loadStoredMedia(chosenUrl, mediaFile);
    if (!loaded) await download(chosenUrl, mediaFile);
  } catch (err) {
    isImage = false;
    if (media.fallbackUrl && media.fallbackUrl !== chosenUrl) {
      console.warn(
        `Scene ${index + 1} clip download failed (${err instanceof Error ? err.message : err}); using verified fallback clip`,
      );
      chosenUrl = media.fallbackUrl;
      mediaFile = path.join(
        dir,
        `media-${String(index).padStart(2, "0")}.${guessExt(chosenUrl)}`,
      );
      await download(chosenUrl, mediaFile);
    } else {
      throw err;
    }
  }

  let clipSpeed =
    typeof scene.mediaSpeed === "number" &&
    scene.mediaSpeed >= 0.5 &&
    scene.mediaSpeed <= 2.0
      ? scene.mediaSpeed
      : 1;

  // AI video clips are short (~5s): ease them into slow motion to fill the
  // scene instead of visibly looping (loops only beyond a 0.6x slowdown).
  const isAiVideo = scene.mediaSource === "ai" && !isImage && chosenUrl === media.url;
  if (isAiVideo && typeof scene.mediaSpeed !== "number") {
    const clipLength = await probeDuration(mediaFile).catch(() => 0);
    if (clipLength > 0 && clipLength < duration) {
      clipSpeed = Math.max(0.6, clipLength / duration);
    }
  }
  const clipStart =
    typeof scene.mediaStart === "number" && scene.mediaStart > 0
      ? Math.min(60, scene.mediaStart)
      : 0;

  const filters: string[] = [];
  if (isImage) {
    filters.push(...cameraMotionFilters(scene.aiMotion ?? defaultMotion(index), width, height, duration));
  } else {
    if (Math.abs(clipSpeed - 1) > 0.01) {
      filters.push(`setpts=PTS/${clipSpeed.toFixed(2)}`);
    }
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      "setsar=1",
      "fps=30",
    );
  }

  const colorGrade = ffmpegColorFilter(scene.mediaFilter);
  if (colorGrade) {
    filters.push(colorGrade);
  }

  // Subtle scene transitions when enabled
  if (scene.transition === "fade" || index === 0) {
    filters.push("fade=t=in:st=0:d=0.32");
  }
  if (index === totalScenes - 1 && duration > 1.0) {
    filters.push(`fade=t=out:st=${Math.max(0, duration - 0.4).toFixed(2)}:d=0.38`);
  }

  if (captionFilter) {
    filters.push(captionFilter);
  }

  const inputArgs = isImage
    ? ["-framerate", "30", "-loop", "1", "-i", mediaFile]
    : [
        "-stream_loop",
        "-1",
        ...(clipStart > 0 ? ["-ss", clipStart.toFixed(2)] : []),
        "-i",
        mediaFile,
      ];
  const args: string[] = [
    "-y",
    ...inputArgs,
    "-t",
    duration.toFixed(3),
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-r",
    "30",
    ...(IS_VERCEL ? ["-threads", "2"] : []),
    "-an",
    output,
  ];

  try {
    await runFfmpeg(args);
  } finally {
    fs.rmSync(/* turbopackIgnore: true */ mediaFile, { force: true });
    fs.rmSync(/* turbopackIgnore: true */ captionFile, { force: true });
  }
  return output;
}

async function renderProjectInternal(
  projectId: string,
  overrideProject?: Project,
): Promise<{ mp4?: Buffer }> {
  const inline = Boolean(overrideProject);
  const project = overrideProject ?? (await getProject(projectId));
  if (!project) throw new Error("Project not found");

  const dir = inline
    ? projectDir(`${projectId}-inline-${Date.now()}`)
    : projectDir(projectId);
  fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

  const { width, height } = targetSize(project.resolution, project.aspect);
  const scenes = project.script.scenes ?? [];
  if (scenes.length === 0) throw new Error("The script has no scenes");

  const captionMode: CaptionMode =
    project.script.options?.captionMode ?? "word-highlight";
  const captionPosition: CaptionPosition =
    project.script.options?.captionPosition ?? "bottom";
  const voiceRateOffset =
    typeof project.script.options?.voiceRateOffset === "number"
      ? project.script.options.voiceRateOffset
      : 0;
  const musicTrackId =
    project.script.options?.musicTrack ?? defaultMusicForTone(project.tone);
  const musicVolume = Math.min(
    0.45,
    Math.max(0, project.script.options?.musicVolume ?? 0.16),
  );

  if (!inline) {
    await updateProject(projectId, {
      status: "rendering",
      progress: 3,
      stage: "Preparing neural voiceover & script cues",
      error: null,
    });
  }

  const sceneFiles: string[] = [];
  const sceneAudioSpecs: { file: string; duration: number }[] = [];
  let totalTargetDuration = 0;

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (!inline) {
      await updateProject(projectId, {
        progress: Math.round(5 + (index / scenes.length) * 72),
        stage: `Scene ${index + 1} of ${scenes.length}: recording neural voiceover`,
      });
    }

    const speechText = (scene.narration?.trim() || scene.caption?.trim() || "").trim();
    let audioFile: string;
    let spoken = 0;
    let wordTimings: WordTiming[] = [];

    if (speechText.length > 0) {
      const speech = await synthesizeSpeech(
        speechText,
        project.voice,
        project.language,
        voiceRateOffset,
      );
      audioFile = path.join(
        dir,
        `audio-${String(index).padStart(2, "0")}.${speech.ext}`,
      );
      fs.writeFileSync(audioFile, speech.data);
      const probed = await probeDuration(audioFile);
      spoken = probed > 0 ? probed : speech.durationSec || 3.2;
      wordTimings = speech.wordTimings;
    } else {
      const silentDur = Math.max(3, scene.duration ?? 3);
      audioFile = path.join(dir, `audio-${String(index).padStart(2, "0")}.wav`);
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        silentDur.toFixed(2),
        audioFile,
      ]);
      spoken = silentDur;
    }

    const manual = scene.duration ?? 0;
    const duration = Math.min(
      45,
      Math.max(2.6, spoken + 0.42, manual > 0 ? manual : 0),
    );
    totalTargetDuration += duration;
    sceneAudioSpecs.push({ file: audioFile, duration });

    if (!inline) {
      await updateProject(projectId, {
        progress: Math.round(5 + ((index + 0.5) / scenes.length) * 72),
        stage: `Scene ${index + 1} of ${scenes.length}: cutting footage & burning captions`,
      });
    }

    const usedIds = scenes
      .slice(0, index)
      .map((item) => item.mediaId)
      .filter((id): id is string => Boolean(id));
    const file = await renderSceneVideo(
      scene,
      index,
      scenes.length,
      dir,
      width,
      height,
      project.style,
      captionMode,
      captionPosition,
      duration,
      spoken,
      wordTimings,
      project.prompt || project.title,
      project.script.options?.peopleRepresentation ?? "all",
      usedIds,
    );
    sceneFiles.push(file);
  }

  await updateProject(projectId, {
    progress: 82,
    stage: "Mixing voiceover, music bed & assembling master MP4",
  });

  // 1. Concatenate video scenes
  const videoList = path.join(dir, "scenes.txt");
  fs.writeFileSync(
    videoList,
    sceneFiles.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  const silentVideo = path.join(dir, "video.mp4");
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    videoList,
    "-c",
    "copy",
    silentVideo,
  ]);

  // 2. Pad each scene's audio to match its exact video duration so narration &
  //    captions stay locked in frame-accurate sync across every cut!
  const audioInputs: string[] = [];
  const padChains: string[] = [];
  sceneAudioSpecs.forEach((spec, index) => {
    audioInputs.push("-i", spec.file);
    padChains.push(
      `[${index}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${spec.duration.toFixed(3)},atrim=0:${spec.duration.toFixed(3)}[a${index}]`,
    );
  });

  const concatInputs = sceneAudioSpecs.map((_, idx) => `[a${idx}]`).join("");
  const voiceTrack = path.join(dir, "voice.m4a");
  await runFfmpeg([
    "-y",
    ...audioInputs,
    "-filter_complex",
    `${padChains.join(";")};${concatInputs}concat=n=${sceneAudioSpecs.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[vo]`,
    "-map",
    "[vo]",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    voiceTrack,
  ]);

  // 3. Mix optional background music gently ducked underneath the voiceover
  let finalAudioTrack = voiceTrack;
  const musicMeta = getMusicTrack(musicTrackId);
  if (musicMeta.url && musicVolume > 0.01) {
    const musicFile = path.join(dir, "music.mp3");
    try {
      await download(musicMeta.url, musicFile);
      const mixedTrack = path.join(dir, "audio-mix.m4a");
      const fadeOutStart = Math.max(0.5, totalTargetDuration - 1.5).toFixed(2);
      await runFfmpeg([
        "-y",
        "-i",
        voiceTrack,
        "-stream_loop",
        "-1",
        "-i",
        musicFile,
        "-filter_complex",
        `[1:a]atrim=0:${totalTargetDuration.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.7,afade=t=out:st=${fadeOutStart}:d=1.4,volume=${musicVolume.toFixed(3)}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95[mix]`,
        "-map",
        "[mix]",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        mixedTrack,
      ]);
      finalAudioTrack = mixedTrack;
    } catch (err) {
      console.warn(
        "Background music mix skipped:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      fs.rmSync(/* turbopackIgnore: true */ musicFile, { force: true });
    }
  }

  // 4. Final MP4 mux (+faststart for instant browser streaming)
  const output = path.join(dir, "output.mp4");
  await runFfmpeg([
    "-y",
    "-i",
    silentVideo,
    "-i",
    finalAudioTrack,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-shortest",
    "-movflags",
    "+faststart",
    output,
  ]);

  const poster = path.join(dir, "poster.jpg");
  try {
    await runFfmpeg([
      "-y",
      "-ss",
      "0.5",
      "-i",
      output,
      "-frames:v",
      "1",
      "-vf",
      "scale=720:-2",
      "-q:v",
      "4",
      poster,
    ]);
  } catch {
    // poster is optional
  }

  if (inline) {
    const mp4 = fs.readFileSync(/* turbopackIgnore: true */ output);
    fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
    return { mp4 };
  }

  await updateProject(projectId, {
    progress: 94,
    stage: isBlobConfigured()
      ? "Uploading master to Vercel Blob"
      : "Saving rendered master",
  });

  const savedOutputPath = await saveRenderArtifact(
    projectId,
    "output.mp4",
    output,
    "video/mp4",
  );
  const hasPoster = fs.existsSync(/* turbopackIgnore: true */ poster);
  const savedPosterPath = hasPoster
    ? await saveRenderArtifact(projectId, "poster.jpg", poster, "image/jpeg")
    : null;

  if (storesArtifactsExternally()) {
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
    stage: "Master ready",
    error: null,
    outputPath: savedOutputPath,
    posterPath: savedPosterPath,
  });
  return {};
}

export async function renderProject(projectId: string): Promise<void> {
  await renderProjectInternal(projectId);
}

export async function renderProjectInline(project: Project): Promise<Buffer> {
  const res = await renderProjectInternal(project.id, project);
  if (!res.mp4) throw new Error("Inline render produced no MP4 output");
  return res.mp4;
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
  return (
    jobMap().get(projectId) ?? {
      status: "idle",
      error: null,
      startedAt: 0,
    }
  );
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

export function startRender(projectId: string): boolean {
  const jobs = jobMap();
  const existing = jobs.get(projectId);
  if (existing?.status === "running") return false;
  void runRenderJob(projectId);
  return true;
}
