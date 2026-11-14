import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { synthesizeSpeech } from "./tts";
import { LOCAL_CATALOG, getLocalAsset, matchLocalAsset, pickSource } from "./stock";
import { FONTS_DIR, probeDuration, runFfmpeg } from "./ffmpeg";
import { getProject, updateProject } from "./projects";
import {
  STORAGE_DIR,
  blobEnabled,
  deleteFromBlob,
  storageProblem,
  uploadToBlob,
} from "./storage";
import { ASPECTS, RESOLUTIONS, type AspectRatio, type Resolution, type Scene, type Style } from "./types";

export function projectDir(id: string): string {
  return path.join(STORAGE_DIR, "renders", id);
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

type CaptionStyle = {
  fontname: string;
  fontsize: number;
  primary: string;
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
): CaptionStyle {
  const base: CaptionStyle = {
    fontname: "DejaVu Sans",
    fontsize: Math.max(14, Math.round(height / 17)),
    primary: "&H00FFFFFF",
    outlineColour: "&H00202020",
    backColour: "&H80000000",
    borderStyle: 1,
    outline: 2.4,
    shadow: 1.2,
    alignment: 2,
    marginL: 40,
    marginR: 40,
    marginV: Math.max(14, Math.round(height * 0.09)),
    bold: true,
  };
  switch (style) {
    case "minimal":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(height / 20)),
        outline: 0,
        shadow: 0,
        alignment: 1,
        marginL: Math.max(16, Math.round(width * 0.06)),
        marginV: Math.max(14, Math.round(height * 0.1)),
      };
    case "cinematic":
      return {
        ...base,
        fontsize: Math.max(12, Math.round(height / 21)),
        outline: 3,
        shadow: 1.6,
        outlineColour: "&H00000000",
        marginV: Math.max(14, Math.round(height * 0.12)),
      };
    case "energetic":
      return {
        ...base,
        primary: "&H0066E0FF",
        outline: 3,
        shadow: 1.4,
        marginV: Math.max(14, Math.round(height * 0.08)),
      };
    case "corporate":
      return {
        ...base,
        borderStyle: 3,
        backColour: "&HCC8A3A1E",
        outlineColour: "&H00203060",
        marginV: Math.max(14, Math.round(height * 0.08)),
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

function buildAssFile(
  caption: string,
  duration: number,
  width: number,
  height: number,
  style: Style,
): string {
  const captionStyleConfig = captionStyle(style, width, height);
  const text = escapeAssText(caption) || " ";
  return [
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
      captionStyleConfig.fontname,
      captionStyleConfig.fontsize,
      captionStyleConfig.primary,
      "&H000000FF",
      captionStyleConfig.outlineColour,
      captionStyleConfig.backColour,
      captionStyleConfig.bold ? "-1" : "0",
      "0",
      "0",
      "0",
      "100",
      "100",
      "0",
      "0",
      String(captionStyleConfig.borderStyle),
      String(captionStyleConfig.outline),
      String(captionStyleConfig.shadow),
      String(captionStyleConfig.alignment),
      String(captionStyleConfig.marginL),
      String(captionStyleConfig.marginR),
      String(captionStyleConfig.marginV),
      "1",
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,${assTimestamp(duration + 0.4)},Caption,,0,0,0,,${text}`,
    "",
  ].join("\n");
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download media (${response.status})`);
  }
  const stream = Readable.fromWeb(
    response.body as unknown as WebReadableStream<Uint8Array>,
  );
  await pipeline(stream, fs.createWriteStream(destination));
}

type ResolvedMedia = { url: string; kind: "video" | "generated" };

/**
 * Scenes always end up with real stock footage — still images are never used
 * for a scene, so a video clip is matched (or swapped in) when needed.
 */
async function resolveMedia(
  scene: Scene,
  targetHeight: number,
): Promise<ResolvedMedia> {
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

async function renderSceneVideo(
  scene: Scene,
  index: number,
  dir: string,
  width: number,
  height: number,
  style: Style,
  duration: number,
): Promise<string> {
  const output = path.join(dir, `scene-${String(index).padStart(2, "0")}.mp4`);
  const captionFile = path.join(dir, `caption-${String(index).padStart(2, "0")}.ass`);
  fs.writeFileSync(
    captionFile,
    buildAssFile(scene.caption ?? "", duration, width, height, style),
    "utf8",
  );

  const captionFilter = `ass=filename=${captionFile}:fontsdir=${FONTS_DIR}`;

  const media = await resolveMedia(scene, height);

  if (media.kind === "generated" || !media.url) {
    const gradient = `gradients=s=${width}x${height}:c0=0x1e1b4b:c1=0x0ea5e9:x0=0:y0=0:x1=${width}:y1=${height}:d=${Math.ceil(duration)}:r=${30}`;
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      gradient,
      "-t",
      duration.toFixed(2),
      "-vf",
      captionFilter,
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

  const extension = media.url.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
  const mediaFile = path.join(dir, `media-${String(index).padStart(2, "0")}.${extension}`);
  await download(media.url, mediaFile);

  const args: string[] = ["-y", "-stream_loop", "-1", "-i", mediaFile];

  const filters: string[] = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    "setsar=1",
    "fps=30",
  ];
  filters.push(captionFilter);

  args.push(
    "-t",
    duration.toFixed(2),
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
    "-an",
    output,
  );

  await runFfmpeg(args);
  return output;
}

export async function renderProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  const problem = storageProblem();
  if (problem) throw new Error(problem);
  const previousOutput = project.outputPath;
  const previousPoster = project.posterPath;

  const dir = projectDir(projectId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const { width, height } = targetSize(project.resolution, project.aspect);
  const scenes = project.script.scenes ?? [];
  if (scenes.length === 0) throw new Error("The script has no scenes");

  await updateProject(projectId, {
    status: "rendering",
    progress: 2,
    stage: "Preparing voiceover",
    error: null,
  });

  const sceneFiles: string[] = [];
  const audioFiles: string[] = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    await updateProject(projectId, {
      progress: Math.round(5 + (index / scenes.length) * 75),
      stage: `Scene ${index + 1} of ${scenes.length}: generating voiceover`,
    });

    const speech = await synthesizeSpeech(
      scene.narration?.length ? scene.narration : scene.caption,
      project.voice,
      project.language,
    );
    const audioFile = path.join(
      dir,
      `audio-${String(index).padStart(2, "0")}.${speech.ext}`,
    );
    fs.writeFileSync(audioFile, speech.data);
    audioFiles.push(audioFile);

    const spoken = await probeDuration(audioFile);
    const manual = scene.duration ?? 0;
    const duration = Math.min(
      45,
      Math.max(2.6, spoken + 0.45, manual > 0 ? manual : 0),
    );

    await updateProject(projectId, {
      progress: Math.round(5 + ((index + 0.5) / scenes.length) * 75),
      stage: `Scene ${index + 1} of ${scenes.length}: compositing visuals`,
    });

    const file = await renderSceneVideo(
      scene,
      index,
      dir,
      width,
      height,
      project.style,
      duration,
    );
    sceneFiles.push(file);
  }

  await updateProject(projectId, {
    progress: 85,
    stage: "Assembling final video",
  });

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

  const audioInputs: string[] = [];
  audioFiles.forEach((file) => {
    audioInputs.push("-i", file);
  });
  const filter = `${audioFiles
    .map((_, index) => `[${index}:a]`)
    .join("")}concat=n=${audioFiles.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  const audioTrack = path.join(dir, "audio.m4a");
  await runFfmpeg([
    "-y",
    ...audioInputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-ac",
    "2",
    "-ar",
    "44100",
    audioTrack,
  ]);

  const output = path.join(dir, "output.mp4");
  await runFfmpeg([
    "-y",
    "-i",
    silentVideo,
    "-i",
    audioTrack,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
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
      "0.4",
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

  const hasPoster = fs.existsSync(poster);
  let outputPath = path.join("renders", projectId, "output.mp4");
  let posterPath: string | null = hasPoster
    ? path.join("renders", projectId, "poster.jpg")
    : null;

  if (blobEnabled()) {
    // Serverless hosts (Vercel) keep nothing on disk between requests, so the
    // master and poster are published to Vercel Blob and the URLs stored.
    await updateProject(projectId, { progress: 96, stage: "Uploading master to storage" });
    outputPath = await uploadToBlob(`renders/${projectId}/output.mp4`, output, "video/mp4");
    posterPath = hasPoster
      ? await uploadToBlob(`renders/${projectId}/poster.jpg`, poster, "image/jpeg")
      : null;
    fs.rmSync(dir, { recursive: true, force: true });
    await deleteFromBlob([previousOutput, previousPoster]);
  } else {
    // Keep only the deliverables; the downloaded source clips and intermediates
    // can be tens of megabytes each.
    for (const file of fs.readdirSync(dir)) {
      if (file === "output.mp4" || file === "poster.jpg") continue;
      fs.rmSync(path.join(dir, file), { force: true });
    }
  }

  await updateProject(projectId, {
    status: "done",
    progress: 100,
    stage: "Ready to share",
    error: null,
    outputPath,
    posterPath,
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

/**
 * Start a render and return its promise (or null if one is already running in
 * this instance). Route handlers pass the promise to `after()` so serverless
 * platforms keep the function alive until the encode finishes.
 */
export function startRender(projectId: string): Promise<void> | null {
  const jobs = jobMap();
  const existing = jobs.get(projectId);
  if (existing?.status === "running") return null;
  jobs.set(projectId, { status: "running", error: null, startedAt: Date.now() });

  return (async () => {
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
    } finally {
      // On Blob-backed hosts nothing in the tmp working dir is needed afterwards.
      if (blobEnabled()) {
        fs.rmSync(projectDir(projectId), { recursive: true, force: true });
      }
    }
  })();
}
