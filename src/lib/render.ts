import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
  getBrandKit,
  getDefaultBrandKit,
  hexToAssColor,
  hexToFfmpegColor,
} from "./brandkit";
import { getFontsDir, probeDuration, runFfmpeg } from "./ffmpeg";
import { renderProceduralPlate as renderProceduralPlateImage } from "./imagen";
import { defaultMusicForTone, getMusicTrack } from "./music";
import { getProject, updateProject } from "./projects";
import {
  getLocalAsset,
  matchLocalAsset,
  pickSource,
  VIDEO_CATALOG,
} from "./stock";
import {
  getProjectScratchDir,
  getStorageRoot,
  IS_VERCEL,
  isBlobConfigured,
  saveRenderArtifact,
} from "./storage";
import { estimateWordTimings, synthesizeSpeech, type WordTiming } from "./tts";
import { aiVideoEnabled, generateSceneVideo } from "./video";
import {
  ASPECTS,
  BRAND_FONT_ASS_NAME,
  RESOLUTIONS,
  type AspectRatio,
  type BrandKit,
  type CaptionMode,
  type Resolution,
  type Scene,
  type Style,
} from "./types";

export const FPS = 30;

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

/* ------------------------------------------------------------ brand helpers */

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

function isImageFile(file: string): boolean {
  return IMAGE_EXT.has(path.extname(file).toLowerCase());
}

/** Extracts the storage key from an `/api/files/<key>` URL. */
function mediaKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return null;
  const match = /\/api\/files\/(.+)$/.exec(url);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function resolveLocalAsset(file: string | null | undefined): string | null {
  if (!file) return null;
  const key = mediaKeyFromUrl(file) ?? (file.startsWith("/") ? null : file);
  if (!key) return null;
  const candidate = path.join(/* turbopackIgnore: true */ getStorageRoot(), key);
  try {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  } catch {
    // ignore
  }
  return null;
}

function resolveLogoFile(brandKit: BrandKit | null | undefined): string | null {
  if (!brandKit?.showLogo || !brandKit.logoPath) return null;
  return resolveLocalAsset(brandKit.logoPath);
}

/** Resolves a TrueType file for `drawtext` inside `src/assets/fonts`. */
function fontFileFor(kit: BrandKit | null | undefined, bold: boolean): string | null {
  const fontsDir = getFontsDir();
  if (!fontsDir) return null;
  const assName = BRAND_FONT_ASS_NAME[kit?.font ?? "dejavu"] ?? "DejaVu Sans";
  const file =
    assName === "DejaVu Serif"
      ? "DejaVuSerif.ttf"
      : assName === "DejaVu Sans Mono"
        ? "DejaVuSansMono.ttf"
        : bold
          ? "DejaVuSans-Bold.ttf"
          : "DejaVuSans.ttf";
  const candidate = path.join(/* turbopackIgnore: true */ fontsDir, file);
  try {
    return fs.existsSync(/* turbopackIgnore: true */ candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ")
    .trim();
}

/* ------------------------------------------------------------- captions */

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
  brandKit?: BrandKit | null,
): CaptionStyleConfig {
  const isVertical = height > width;
  const baseFont = Math.max(
    14,
    Math.round(height / (isVertical ? 24 : captionMode === "word-highlight" ? 16 : 18)),
  );
  const brandHighlight = brandKit?.primaryColor
    ? hexToAssColor(brandKit.primaryColor)
    : null;

  const base: CaptionStyleConfig = {
    fontname: BRAND_FONT_ASS_NAME[brandKit?.font ?? "dejavu"] ?? "DejaVu Sans",
    fontsize: baseFont,
    primary: brandKit?.accentColor ? hexToAssColor(brandKit.accentColor) : "&H00F2EFE9",
    highlight: brandHighlight ?? "&H003CA9E5",
    outlineColour: "&H00121210",
    backColour: "&H990B0B0A",
    borderStyle: 1,
    outline: Math.max(1.8, Number((height / 170).toFixed(1))),
    shadow: Math.max(1.0, Number((height / 320).toFixed(1))),
    alignment: 2,
    marginL: Math.max(20, Math.round(width * 0.06)),
    marginR: Math.max(20, Math.round(width * 0.06)),
    marginV: Math.max(16, Math.round(height * (isVertical ? 0.14 : 0.09))),
    bold: true,
  };
  switch (style) {
    case "minimal":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(baseFont * 0.88)),
        highlight: brandHighlight ?? "&H00FFFFFF",
        outline: Math.max(1.2, base.outline * 0.6),
        shadow: 0.8,
        alignment: captionMode === "headline" ? 1 : 2,
      };
    case "cinematic":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(baseFont * 0.9)),
        highlight: brandHighlight ?? "&H00C4DCE8",
        outlineColour: "&H00000000",
        marginV: Math.max(16, Math.round(height * 0.11)),
      };
    case "energetic":
      return {
        ...base,
        primary: brandKit?.accentColor ? hexToAssColor(brandKit.accentColor) : "&H00FFFFFF",
        highlight: brandHighlight ?? "&H0066E0FF",
        outline: Math.max(2.2, base.outline * 1.15),
      };
    case "corporate":
      return {
        ...base,
        borderStyle: 3,
        backColour: "&HCC603018",
        highlight: brandHighlight ?? "&H003CA9E5",
        outlineColour: "&H00181818",
      };
    default:
      return base;
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
  brandKit?: BrandKit | null,
): string {
  const cfg = captionStyle(style, width, height, captionMode, brandKit);
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

/* --------------------------------------------------------------- fetching */

async function download(url: string, destination: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
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
    const stream = Readable.fromWeb(
      response.body as unknown as WebReadableStream<Uint8Array>,
    );
    await pipeline(stream, fs.createWriteStream(destination));
  } finally {
    clearTimeout(timer);
  }
}

type StockResolution = { url: string; fallbackUrl?: string };

function resolveStockMedia(scene: Scene, targetHeight: number): StockResolution {
  const localFallbackAsset =
    matchLocalAsset(scene.mediaQuery || scene.caption || "city", "video") ??
    VIDEO_CATALOG[0];
  const fallbackUrl = localFallbackAsset
    ? pickSource(localFallbackAsset, targetHeight)?.url
    : undefined;

  if (scene.mediaId) {
    const asset = getLocalAsset(scene.mediaId);
    if (asset && asset.type === "video") {
      const source = pickSource(asset, targetHeight);
      if (source) return { url: source.url, fallbackUrl };
    }
  }
  if (scene.mediaUrl && scene.mediaType !== "photo" && !isImageFile(scene.mediaUrl)) {
    // Mixkit previews ship a 720p rendition we can upgrade to for HD masters.
    let renderUrl = scene.mediaUrl;
    if (
      targetHeight >= 720 &&
      renderUrl.includes("assets.mixkit.co/videos/") &&
      renderUrl.endsWith("-360.mp4")
    ) {
      renderUrl = renderUrl.replace(/-360\.mp4$/, "-720.mp4");
    }
    return { url: renderUrl, fallbackUrl };
  }
  if (fallbackUrl) return { url: fallbackUrl };
  return { url: "" };
}

/* ------------------------------------------------- on-device background gen */

/**
 * Composes a brand-tinted abstract plate with FFmpeg. Used when a stock clip
 * can't be fetched (offline, rate limited, or a dead CDN link) so a project
 * always renders instead of failing. The returned still is then animated by the
 * same Ken Burns push applied to AI-generated imagery.
 */
async function renderProceduralPlate(
  dir: string,
  tag: string,
  width: number,
  height: number,
  brandColor: string,
  seed: number,
): Promise<string> {
  const output = path.join(dir, `procedural-${tag}.jpg`);
  try {
    await renderProceduralPlateImage(output, {
      seed,
      width: Math.max(320, Math.min(1280, width)),
      height: Math.max(180, Math.round((Math.max(320, Math.min(1280, width)) * height) / width / 2) * 2),
      primaryColor: brandColor,
    });
  } catch {
    // Last-resort flat brand wash so the encode still completes.
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${hexToFfmpegColor(brandColor)}:s=${width}x${height}:d=1:r=1`,
      "-vf",
      "noise=alls=6:allf=u,vignette=PI/5",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ]);
  }
  return output;
}

/* ------------------------------------------------------------- media prep */

type PreparedMedia = { file: string; isImage: boolean; procedural: boolean };

async function prepareMedia(
  scene: Scene,
  index: number,
  dir: string,
  height: number,
  duration: number,
  width: number,
  brandColor: string,
): Promise<PreparedMedia> {
  // 1. A generated image or uploaded asset already living in our storage root.
  const local = resolveLocalAsset(scene.mediaUrl);
  if (local) return { file: local, isImage: isImageFile(local), procedural: false };

  // 2. Licensed stock clip (downloaded from the provider CDN).
  const stock = resolveStockMedia(scene, height);
  const candidates = [stock.url, stock.fallbackUrl].filter(
    (url): url is string => Boolean(url),
  );
  for (const url of candidates) {
    const ext = url.toLowerCase().includes(".webm") ? "webm" : "mp4";
    const mediaFile = path.join(
      dir,
      `media-${String(index).padStart(2, "0")}-${candidates.indexOf(url)}.${ext}`,
    );
    try {
      await download(url, mediaFile);
      if (fs.statSync(/* turbopackIgnore: true */ mediaFile).size > 1024) {
        return { file: mediaFile, isImage: false, procedural: false };
      }
    } catch (error) {
      console.warn(
        `[render] scene ${index + 1} clip download failed (${
          error instanceof Error ? error.message : error
        }); using on-device background`,
      );
      try {
        fs.rmSync(/* turbopackIgnore: true */ mediaFile, { force: true });
      } catch {
        // ignore
      }
    }
  }

  // 2b. AI-generated footage (HunyuanVideo via a hosted replica of the model).
  //     Only reached when the scene has no usable stock clip, so it replaces the
  //     on-device plate below instead of displacing cheap, already-licensed
  //     footage. generateSceneVideo() never throws, so a video API outage still
  //     falls through to the plate and the render completes.
  if (aiVideoEnabled()) {
    const aspect: AspectRatio =
      width === height ? "1:1" : width > height ? "16:9" : "9:16";
    const video = await generateSceneVideo({
      prompt: scene.mediaQuery || scene.narration || "",
      duration,
      width,
      height,
      aspect,
      seed: index * 137 + 29,
    });
    if (video) return { file: video.file, isImage: false, procedural: false };
  }

  // 3. On-device abstract plate — guarantees the render still completes. It is
  //    returned as an image so the Ken Burns push below gives it real motion.
  const file = await renderProceduralPlate(
    dir,
    String(index).padStart(2, "0"),
    width,
    height,
    brandColor,
    index * 137 + 29,
  );
  return { file, isImage: true, procedural: true };
}

/* ---------------------------------------------------------- title cards */

async function renderTitleCard(
  dir: string,
  name: string,
  width: number,
  height: number,
  duration: number,
  opts: {
    title: string;
    subtitle?: string | null;
    footnote?: string | null;
    brandColor: string;
    accentColor: string;
    brandKit?: BrandKit | null;
  },
): Promise<string> {
  const output = path.join(dir, `card-${name}.mp4`);
  const font = fontFileFor(opts.brandKit, true);
  const fontArg = font ? `fontfile=${font.replace(/\\/g, "/").replace(/:/g, "\\:")}:` : "";
  const brand = hexToFfmpegColor(opts.brandColor);
  const accent = hexToFfmpegColor(opts.accentColor);

  const titleSize = Math.max(18, Math.round(height * 0.082));
  const subSize = Math.max(12, Math.round(height * 0.036));
  const footSize = Math.max(10, Math.round(height * 0.028));

  const lines: string[] = [
    `color=c=${brand}:s=${width}x${height}:d=${duration.toFixed(3)}:r=${FPS}`,
  ];

  const title = escapeDrawtext(opts.title).slice(0, 90);
  const subtitle = opts.subtitle ? escapeDrawtext(opts.subtitle).slice(0, 110) : "";
  const footnote = opts.footnote ? escapeDrawtext(opts.footnote).slice(0, 110) : "";

  // Vertical centring that accounts for whichever lines are present.
  const blockHeight =
    titleSize * 1.25 + (subtitle ? subSize * 1.9 : 0) + (footnote ? footSize * 2.4 : 0);
  let cursor = Math.max(0, (height - blockHeight) / 2);

  lines.push(
    `drawtext=${fontArg}text='${title}':fontcolor=${accent}:fontsize=${titleSize}:x=(w-tw)/2:y=${Math.round(cursor)}`,
  );
  cursor += titleSize * 1.25;
  if (subtitle) {
    lines.push(
      `drawtext=${fontArg}text='${subtitle}':fontcolor=${accent}:fontsize=${subSize}:x=(w-tw)/2:y=${Math.round(cursor)}`,
    );
    cursor += subSize * 1.9;
  }
  if (footnote) {
    lines.push(
      `drawtext=${fontArg}text='${footnote}':fontcolor=${accent}:fontsize=${footSize}:x=(w-tw)/2:y=${Math.round(cursor + footSize * 0.4)}`,
    );
  }

  lines.push(`fade=t=in:st=0:d=0.42`);
  lines.push(`fade=t=out:st=${Math.max(0.2, duration - 0.7).toFixed(2)}:d=0.66`);
  lines.push(`setsar=1,fps=${FPS}`);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-filter_complex",
    lines.join(","),
    "-t",
    duration.toFixed(3),
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
    String(FPS),
    "-an",
    output,
  ]);
  return output;
}

/* ------------------------------------------------------------ scene encode */

async function renderSceneVideo(
  scene: Scene,
  index: number,
  totalScenes: number,
  dir: string,
  width: number,
  height: number,
  style: Style,
  captionMode: CaptionMode,
  duration: number,
  spokenDuration: number,
  wordTimings: WordTiming[],
  brandKit: BrandKit | null,
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
        brandKit,
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

  const prepared = await prepareMedia(
    scene,
    index,
    dir,
    height,
    duration,
    width,
    brandKit?.primaryColor ?? "#6D4AFF",
  );
  const isImage = prepared.isImage;

  const logoFile = resolveLogoFile(brandKit);
  const logoWidth = Math.max(48, Math.round(width * 0.13));
  const margin = Math.max(12, Math.round(width * 0.035));

  const complex: string[] = [];
  if (isImage) {
    // Ken Burns: a slow push plus a gentle drift, so AI-generated stills and
    // on-device plates always read as moving footage rather than a slideshow.
    // The per-frame zoom step is derived from the scene length so every scene
    // gets the same ~30% push regardless of how long it runs.
    const frames = Math.max(2, Math.round(duration * FPS));
    const zoomStep = (0.3 / frames).toFixed(6);
    const overW = Math.round((width * 1.45) / 2) * 2;
    const overH = Math.round((height * 1.45) / 2) * 2;
    complex.push(
      `[0:v]scale=${overW}:${overH}:force_original_aspect_ratio=increase,crop=${overW}:${overH},` +
        `zoompan=z='min(zoom+${zoomStep},1.34)':d=${frames}` +
        `:x='iw/2-(iw/zoom/2)+(iw/zoom)*0.05*sin(on/60)'` +
        `:y='ih/2-(ih/zoom/2)+(ih/zoom)*0.035*cos(on/80)'` +
        `:s=${width}x${height}:fps=${FPS},` +
        `trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,setsar=1[base]`,
    );
  } else {
    complex.push(
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${FPS}[base]`,
    );
  }

  let cursor = "base";
  let step = 0;
  const next = () => `s${step++}`;

  // Subtle scene transitions.
  if (scene.transition === "fade" || index === 0) {
    const out = next();
    complex.push(`[${cursor}]fade=t=in:st=0:d=0.32[${out}]`);
    cursor = out;
  }
  if (index === totalScenes - 1 && duration > 1.0) {
    const out = next();
    complex.push(
      `[${cursor}]fade=t=out:st=${Math.max(0, duration - 0.4).toFixed(2)}:d=0.38[${out}]`,
    );
    cursor = out;
  }

  if (captionFilter) {
    const out = next();
    complex.push(`[${cursor}]${captionFilter}[${out}]`);
    cursor = out;
  }

  // Brand logo bug, faded in shortly after the cut.
  if (logoFile) {
    const logoLabel = next();
    complex.push(
      `[1:v]format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1,scale=${logoWidth}:-1[${logoLabel}]`,
    );
    const out = next();
    complex.push(
      `[${cursor}][${logoLabel}]overlay=${width - logoWidth - margin}:${margin}[${out}]`,
    );
    cursor = out;
  }

  complex.push(`[${cursor}]null[out]`);

  const args: string[] = ["-y"];
  if (isImage) {
    args.push("-i", prepared.file);
  } else {
    args.push("-stream_loop", "-1", "-i", prepared.file);
  }
  if (logoFile) {
    args.push("-i", logoFile);
  }
  args.push(
    "-filter_complex",
    complex.join(";"),
    "-map",
    "[out]",
    "-t",
    duration.toFixed(3),
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
    String(FPS),
    ...(IS_VERCEL ? ["-threads", "2"] : []),
    "-an",
    output,
  );

  try {
    await runFfmpeg(args);
  } catch (error) {
    // Ken Burns can fail on unusual stills — retry as a straight scale/crop.
    if (isImage) {
      const fallbackComplex = [
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${FPS}[base]`,
      ];
      let fbCursor = "base";
      if (captionFilter) {
        fallbackComplex.push(`[${fbCursor}]${captionFilter}[capped]`);
        fbCursor = "capped";
      }
      fallbackComplex.push(`[${fbCursor}]null[out]`);
      await runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-i",
        prepared.file,
        "-filter_complex",
        fallbackComplex.join(";"),
        "-map",
        "[out]",
        "-t",
        duration.toFixed(3),
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
        String(FPS),
        "-an",
        output,
      ]);
    } else {
      throw error;
    }
  } finally {
    fs.rmSync(/* turbopackIgnore: true */ captionFile, { force: true });
    if (!prepared.procedural) {
      // Downloaded clips are scratch; generated plates live in storage.
      if (prepared.file.startsWith(dir)) {
        fs.rmSync(/* turbopackIgnore: true */ prepared.file, { force: true });
      }
    }
  }
  return output;
}

/* ------------------------------------------------------------- the render */

type Segment = {
  video: string;
  /** Local narration file, or `null` for a silent brand card. */
  audio: string | null;
  duration: number;
};

export async function renderProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const brandKit = project.brandKitId
    ? await getBrandKit(project.brandKitId)
    : await getDefaultBrandKit();

  const dir = projectDir(projectId);
  fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

  const { width, height } = targetSize(project.resolution, project.aspect);
  const scenes = project.script.scenes ?? [];
  if (scenes.length === 0) throw new Error("The script has no scenes");

  const captionMode: CaptionMode =
    project.script.options?.captionMode ?? "word-highlight";
  const musicTrackId =
    project.script.options?.musicTrack ?? defaultMusicForTone(project.tone);
  const musicVolume = Math.min(
    0.45,
    Math.max(0, project.script.options?.musicVolume ?? 0.16),
  );

  await updateProject(projectId, {
    status: "rendering",
    progress: 3,
    stage: "Preparing neural voiceover & script cues",
    error: null,
  });

  const segments: Segment[] = [];
  const brandColor = brandKit?.primaryColor ?? "#6D4AFF";
  const accentColor = brandKit?.accentColor ?? "#FFFFFF";

  // ── Branded intro card ─────────────────────────────────────────────────
  const introTitle = (brandKit?.introTitle ?? "").trim();
  if (introTitle) {
    await updateProject(projectId, { progress: 4, stage: "Rendering branded intro card" });
    const cardDuration = 3.4;
    const file = await renderTitleCard(
      dir,
      "intro",
      width,
      height,
      cardDuration,
      {
        title: introTitle,
        subtitle: brandKit?.introSubtitle ?? null,
        brandColor,
        accentColor,
        brandKit,
      },
    );
    segments.push({ video: file, audio: null, duration: cardDuration });
  }

  // ── Narrated scenes ────────────────────────────────────────────────────
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    await updateProject(projectId, {
      progress: Math.round(6 + (index / scenes.length) * 70),
      stage: `Scene ${index + 1} of ${scenes.length}: recording neural voiceover`,
    });

    const speechText = scene.narration?.trim().length
      ? scene.narration
      : scene.caption || " ";
    const speech = await synthesizeSpeech(
      speechText,
      project.voice,
      project.language,
    );
    const audioFile = path.join(
      dir,
      `audio-${String(index).padStart(2, "0")}.${speech.ext}`,
    );
    fs.writeFileSync(audioFile, speech.data);

    const probed = await probeDuration(audioFile);
    const spoken = probed > 0 ? probed : speech.durationSec || 3.2;
    const manual = scene.duration ?? 0;
    const duration = Math.min(
      45,
      Math.max(2.6, spoken + 0.42, manual > 0 ? manual : 0),
    );

    await updateProject(projectId, {
      progress: Math.round(6 + ((index + 0.5) / scenes.length) * 70),
      stage: `Scene ${index + 1} of ${scenes.length}: cutting footage & burning captions`,
    });

    const file = await renderSceneVideo(
      scene,
      index,
      scenes.length,
      dir,
      width,
      height,
      project.style,
      captionMode,
      duration,
      spoken,
      speech.wordTimings,
      brandKit,
    );
    segments.push({ video: file, audio: audioFile, duration });
  }

  // ── Branded outro card ─────────────────────────────────────────────────
  const outroText = (brandKit?.outroText ?? "").trim();
  if (outroText) {
    await updateProject(projectId, { progress: 80, stage: "Rendering branded outro card" });
    const cardDuration = 3.6;
    const file = await renderTitleCard(
      dir,
      "outro",
      width,
      height,
      cardDuration,
      {
        title: outroText,
        subtitle: brandKit?.website ?? null,
        brandColor,
        accentColor,
        brandKit,
      },
    );
    segments.push({ video: file, audio: null, duration: cardDuration });
  }

  const totalTargetDuration = segments.reduce((acc, seg) => acc + seg.duration, 0);

  await updateProject(projectId, {
    progress: 84,
    stage: "Mixing voiceover, music bed & assembling master MP4",
  });

  // 1. Concatenate the video segments.
  const videoList = path.join(dir, "scenes.txt");
  fs.writeFileSync(
    videoList,
    segments.map((segment) => `file '${segment.video.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  const silentVideo = path.join(dir, "video.mp4");
  try {
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
  } catch {
    // Card and scene encodes can differ in minor SPS details — re-encode.
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      videoList,
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
      String(FPS),
      silentVideo,
    ]);
  }

  // 2. Build the narration bed: real audio per scene, silence under cards.
  const audioInputs: string[] = [];
  const padChains: string[] = [];
  segments.forEach((segment, index) => {
    const dur = segment.duration.toFixed(3);
    if (segment.audio) {
      const inputIndex = audioInputs.length / 2;
      audioInputs.push("-i", segment.audio);
      // Plain `apad` + `atrim` is portable across FFmpeg 4.x → 7.x, unlike
      // `apad=whole_dur=` which only exists on newer builds.
      padChains.push(
        `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,apad,atrim=0:${dur}[a${index}]`,
      );
    } else {
      padChains.push(
        `anullsrc=r=44100:cl=stereo,atrim=0:${dur},asetpts=PTS-STARTPTS[a${index}]`,
      );
    }
  });

  const concatInputs = segments.map((_, idx) => `[a${idx}]`).join("");
  const voiceTrack = path.join(dir, "voice.m4a");
  await runFfmpeg([
    "-y",
    ...audioInputs,
    "-filter_complex",
    `${padChains.join(";")};${concatInputs}concat=n=${segments.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[vo]`,
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

  // 3. Mix an optional, ducked background score underneath the voiceover.
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

  // 4. Final MP4 mux (+faststart for instant browser streaming).
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

  // Branded first frame makes a much better library thumbnail than a cut.
  const posterTime = Math.min(
    Math.max(0.8, totalTargetDuration * 0.12),
    Math.max(1, totalTargetDuration - 0.6),
  );
  const poster = path.join(dir, "poster.jpg");
  try {
    await runFfmpeg([
      "-y",
      "-ss",
      posterTime.toFixed(2),
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

  await updateProject(projectId, {
    progress: 96,
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
    stage: "Master ready",
    error: null,
    outputPath: savedOutputPath,
    posterPath: savedPosterPath,
  });
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
