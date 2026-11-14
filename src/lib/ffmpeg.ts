import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);

export const FFMPEG_BIN = (ffmpegStatic as unknown as string) ?? "ffmpeg";
export const FFPROBE_BIN =
  (ffprobeStatic as unknown as { path: string })?.path ?? "ffprobe";

export async function runFfmpeg(args: string[]): Promise<string> {
  const { stderr } = await execFileAsync(FFMPEG_BIN, args, {
    maxBuffer: 1024 * 1024 * 32,
  });
  return stderr;
}

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync(
    FFPROBE_BIN,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { maxBuffer: 1024 * 1024 * 8 },
  );
  const value = Number.parseFloat(stdout.trim());
  return Number.isFinite(value) ? value : 0;
}

export function fontFile(): string | null {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
  ];
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      return null;
    }
  }
  return null;
}
