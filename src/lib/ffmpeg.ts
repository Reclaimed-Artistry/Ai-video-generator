import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

function resolveFfmpegBin(): string {
  const candidates = [
    typeof ffmpegStatic === "string" ? ffmpegStatic : "",
    path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ candidate)) {
        return candidate;
      }
    } catch {
      // keep probing
    }
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
