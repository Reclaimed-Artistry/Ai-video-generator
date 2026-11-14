import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/** Fonts shipped in the repo so captions render identically on any host (Vercel has no system fonts). */
export const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

let resolvedBinary: string | null = null;

/**
 * Locate a runnable ffmpeg binary. On serverless hosts the traced binary can
 * lose its executable bit, so it is copied to the writable tmp dir and chmod'ed.
 */
function ffmpegBinary(): string {
  if (resolvedBinary) return resolvedBinary;
  const candidate = (ffmpegStatic as unknown as string | null) ?? "ffmpeg";
  if (!path.isAbsolute(candidate)) {
    resolvedBinary = candidate;
    return candidate;
  }
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    resolvedBinary = candidate;
  } catch {
    const copy = path.join(os.tmpdir(), "cutline-ffmpeg");
    if (!fs.existsSync(copy)) fs.copyFileSync(candidate, copy);
    fs.chmodSync(copy, 0o755);
    resolvedBinary = copy;
  }
  return resolvedBinary;
}

let fontconfigFile: string | null = null;

/** Minimal fontconfig config that only knows the bundled fonts and caches in tmp. */
function fontconfigEnv(): NodeJS.ProcessEnv {
  if (!fontconfigFile) {
    const cacheDir = path.join(os.tmpdir(), "cutline-fontconfig-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    fontconfigFile = path.join(os.tmpdir(), "cutline-fonts.conf");
    fs.writeFileSync(
      fontconfigFile,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`,
      "utf8",
    );
  }
  return {
    ...process.env,
    FONTCONFIG_FILE: fontconfigFile,
    FONTCONFIG_PATH: path.dirname(fontconfigFile),
  };
}

export async function runFfmpeg(args: string[]): Promise<string> {
  const { stderr } = await execFileAsync(ffmpegBinary(), ["-hide_banner", ...args], {
    maxBuffer: 1024 * 1024 * 32,
    env: fontconfigEnv(),
  });
  return stderr;
}

/** Read a media file's duration from ffmpeg's own header dump (no ffprobe needed). */
export async function probeDuration(file: string): Promise<number> {
  let stderr = "";
  try {
    const result = await execFileAsync(ffmpegBinary(), ["-hide_banner", "-i", file], {
      maxBuffer: 1024 * 1024 * 8,
    });
    stderr = result.stderr;
  } catch (error) {
    // `ffmpeg -i` without an output always exits non-zero; the header is still on stderr.
    stderr = (error as { stderr?: string }).stderr ?? "";
  }
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}
