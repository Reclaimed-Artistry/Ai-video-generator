import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Resolves an FFmpeg binary across every deployment target.
 *
 * Order of preference:
 *  1. `FFMPEG_PATH` — explicit operator override.
 *  2. `@ffmpeg-installer/ffmpeg` — ships the binary inside the npm tarball, so
 *     it needs no postinstall download and cannot fail behind a proxy.
 *  3. `ffmpeg-static` — pinned binary downloaded by its postinstall script.
 *  4. Whatever `ffmpeg` is on `PATH`.
 */
function resolveFfmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const candidates: string[] = [];
  candidates.push(
    path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "linux-x64",
      "ffmpeg",
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "darwin-arm64",
      "ffmpeg",
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "win32-x64",
      "ffmpeg.exe",
    ),
  );

  // `ffmpeg-static` resolves its path at import time; require it lazily so a
  // package that failed to download its binary can never break this module.
  try {
    const ffmpegStatic = require("ffmpeg-static") as unknown;
    if (typeof ffmpegStatic === "string") candidates.push(ffmpegStatic);
  } catch {
    // Package not installed — the @ffmpeg-installer paths above cover us.
  }

  candidates.push(
    path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/var/task/node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
  );

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ candidate)) {
        return candidate;
      }
    } catch {
      // keep probing
    }
  }

  // Fall back to a PATH lookup so system-installed FFmpeg is still usable.
  try {
    const found = execFileSync("which", ["ffmpeg"], { encoding: "utf8" }).trim().split("\n")[0];
    if (found) return found;
  } catch {
    // No system ffmpeg.
  }

  return "ffmpeg";
}

export const FFMPEG_BIN = resolveFfmpegBin();

/**
 * Locate bundled TrueType fonts shipped inside `src/assets/fonts` so `libass`
 * burns captions reliably on Vercel's bare Amazon Linux runtime as well as
 * local Debian/Docker hosts.
 */
export function getFontsDir(): string | null {
  const candidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), "src", "assets", "fonts"),
    "/var/task/src/assets/fonts",
    "/usr/share/fonts/truetype/dejavu",
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ dir)) return dir;
    } catch {
      // keep probing
    }
  }
  return null;
}

function ensureFontconfigPath(): string | undefined {
  const fontsDir = getFontsDir();
  if (!fontsDir) return undefined;
  const confPath = path.join(os.tmpdir(), "reclaimed-artistry-fonts.conf");
  const cacheDir = path.join(os.tmpdir(), "reclaimed-artistry-fc-cache");
  try {
    fs.mkdirSync(/* turbopackIgnore: true */ cacheDir, { recursive: true });
    const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`;
    fs.writeFileSync(/* turbopackIgnore: true */ confPath, xml, "utf8");
    return confPath;
  } catch {
    return undefined;
  }
}

export async function runFfmpeg(args: string[]): Promise<string> {
  const fontconfig = ensureFontconfigPath();
  const env = fontconfig
    ? { ...process.env, FONTCONFIG_FILE: fontconfig }
    : process.env;
  const { stderr } = await execFileAsync(FFMPEG_BIN, args, {
    maxBuffer: 1024 * 1024 * 32,
    env,
  });
  return stderr;
}

/**
 * Probes media duration using `ffmpeg -i` stderr output — avoids bundling the
 * 336 MB multi-platform `ffprobe-static` package into Vercel Functions.
 */
export async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      /* turbopackIgnore: true */ FFMPEG_BIN,
      ["-hide_banner", "-i", file],
      { maxBuffer: 1024 * 1024 * 8 },
      (_err, _stdout, stderr) => {
        const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(
          stderr || "",
        );
        if (!match) {
          resolve(0);
          return;
        }
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        const total = hours * 3600 + minutes * 60 + seconds;
        resolve(Number.isFinite(total) ? total : 0);
      },
    );
  });
}

/**
 * Run FFmpeg with raw RGBA frames streamed to stdin (used by the stickman
 * animation engine). Respects pipe backpressure so memory stays flat.
 */
export async function runFfmpegFrames(
  args: string[],
  frameCount: number,
  renderFrame: (index: number) => Uint8Array,
): Promise<void> {
  const fontconfig = ensureFontconfigPath();
  const env = fontconfig ? { ...process.env, FONTCONFIG_FILE: fontconfig } : process.env;
  const child = spawn(FFMPEG_BIN, args, { env, stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  // A broken pipe (FFmpeg exited early) is reported via the exit code below.
  child.stdin.on("error", () => undefined);

  for (let i = 0; i < frameCount; i += 1) {
    if (child.exitCode !== null) break;
    const ok = child.stdin.write(Buffer.from(renderFrame(i)));
    if (!ok) {
      await new Promise<void>((resolve) => {
        const done = () => {
          child.stdin.off("drain", done);
          child.off("close", done);
          resolve();
        };
        child.stdin.once("drain", done);
        child.once("close", done);
      });
    }
  }
  child.stdin.end();
  const code = await exited;
  if (code !== 0) {
    throw new Error(`FFmpeg failed while encoding animation: ${stderr.split("\n").slice(-4).join(" ").trim()}`);
  }
}

/**
 * Loudness of an audio file sampled `fps` times per second (RMS in dBFS).
 * Drives audio-synced mouth movement for the stickman engine.
 */
export async function audioLoudnessPerFrame(file: string, fps = 30): Promise<number[]> {
  const rate = 16000;
  const samplesPerFrame = Math.round(rate / fps);
  const stderr = await runFfmpeg([
    "-hide_banner",
    "-nostats",
    "-i",
    file,
    "-af",
    `aresample=${rate},aformat=channel_layouts=mono,asetnsamples=n=${samplesPerFrame}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level`,
    "-f",
    "null",
    "-",
  ]);
  const values: number[] = [];
  const re = /lavfi\.astats\.Overall\.RMS_level=(-?inf|-?[0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stderr)) !== null) {
    values.push(match[1].includes("inf") ? -120 : Number(match[1]));
  }
  return values;
}
