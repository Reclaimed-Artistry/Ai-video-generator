import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

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

export async function GET(request: Request, context: Context) {
  const { file: segments } = await context.params;
  const relative = segments.map((segment) => decodeURIComponent(segment)).join("/");
  const target = path.resolve(STORAGE_DIR, relative);

  if (!target.startsWith(path.resolve(STORAGE_DIR))) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
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
