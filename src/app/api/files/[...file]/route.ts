import fs from "node:fs";
import path from "node:path";
import { getProject } from "@/lib/projects";
import { STORAGE_DIR, blobDownloadUrl, isRemoteUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

type Context = { params: Promise<{ file: string[] }> };

/**
 * On Vercel, masters live in Vercel Blob rather than on disk. Resolve
 * `renders/<projectId>/output.mp4|poster.jpg` to the stored Blob URL.
 */
async function remoteRenderUrl(segments: string[]): Promise<string | null> {
  if (segments.length !== 3 || segments[0] !== "renders") return null;
  const [, projectId, fileName] = segments;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const project = await getProject(projectId).catch(() => null);
  if (!project) return null;
  if (fileName === "output.mp4" && isRemoteUrl(project.outputPath)) return project.outputPath;
  if (fileName === "poster.jpg" && isRemoteUrl(project.posterPath)) return project.posterPath;
  return null;
}

export async function GET(request: Request, context: Context) {
  const { file: rawSegments } = await context.params;
  const segments = rawSegments.map((segment) => decodeURIComponent(segment));
  const root = path.resolve(STORAGE_DIR);
  const target = path.resolve(root, segments.join("/"));

  if (target !== root && !target.startsWith(root + path.sep)) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    const remote = await remoteRenderUrl(segments);
    if (remote) {
      const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
      return Response.redirect(wantsDownload ? blobDownloadUrl(remote) : remote, 307);
    }
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(target);
  const type = MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream";
  const range = request.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      const safeEnd = Math.min(end, stat.size - 1);
      if (start <= safeEnd) {
        const chunk = fs.createReadStream(target, { start, end: safeEnd });
        return new Response(chunk as unknown as ReadableStream, {
          status: 206,
          headers: {
            "content-type": type,
            "content-length": String(safeEnd - start + 1),
            "content-range": `bytes ${start}-${safeEnd}/${stat.size}`,
            "accept-ranges": "bytes",
            "cache-control": "no-store",
          },
        });
      }
    }
  }

  const stream = fs.createReadStream(target);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "content-type": type,
      "content-length": String(stat.size),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
  });
}
