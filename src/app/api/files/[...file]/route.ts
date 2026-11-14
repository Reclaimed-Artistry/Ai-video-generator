import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getStorageRoot, readDbArtifact } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function serveBuffer(data: Buffer, contentType: string, range: string | null) {
  const size = data.length;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      const safeEnd = Math.min(end, size - 1);
      if (start <= safeEnd && start >= 0) {
        const slice = data.subarray(start, safeEnd + 1);
        return new Response(new Uint8Array(slice), {
          status: 206,
          headers: {
            "content-type": contentType,
            "content-length": String(slice.length),
            "content-range": `bytes ${start}-${safeEnd}/${size}`,
            "accept-ranges": "bytes",
            "cache-control": "no-store",
          },
        });
      }
    }
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
  });
}

/**
 * Adapts a Node read stream into a web `ReadableStream` for the `Response`.
 *
 * A plain `fs.createReadStream` handed straight to `Response` throws
 * `ERR_INVALID_STATE: ReadableStream is already closed` as an *uncaught*
 * exception whenever the client hangs up early — a video seeking, an `<img>`
 * re-rendering, a closed tab — which is fatal to the whole server process.
 * `Readable.toWeb()` propagates cancellation properly, and the extra error
 * listener plus abort teardown guarantee nothing escapes unhandled.
 */
function toWebStream(
  stream: fs.ReadStream,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const web = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  // Swallow late errors (e.g. ENOENT on a file cleaned up mid-transfer).
  stream.on("error", () => {
    try {
      stream.destroy();
    } catch {
      // already destroyed
    }
  });

  if (signal.aborted) {
    stream.destroy();
  } else {
    signal.addEventListener("abort", () => stream.destroy(), { once: true });
  }

  return web;
}

export async function GET(request: Request, context: Context) {
  const { file: segments } = await context.params;
  if (segments.some((segment) => segment === ".." || segment.includes("\\"))) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }
  const relative = segments
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  const root = path.resolve(/* turbopackIgnore: true */ getStorageRoot());
  const target = path.resolve(/* turbopackIgnore: true */ root, relative);

  if (!target.startsWith(root)) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  const range = request.headers.get("range");

  // 1. Local disk (Docker / Railway / dev / warm scratch)
  if (
    fs.existsSync(/* turbopackIgnore: true */ target) &&
    fs.statSync(/* turbopackIgnore: true */ target).isFile()
  ) {
    const stat = fs.statSync(/* turbopackIgnore: true */ target);
    const type =
      MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream";

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stat.size - 1;
        const safeEnd = Math.min(end, stat.size - 1);
        if (start <= safeEnd && start >= 0) {
          const chunk = fs.createReadStream(/* turbopackIgnore: true */ target, {
            start,
            end: safeEnd,
          });
          return new Response(toWebStream(chunk, request.signal), {
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

    const stream = fs.createReadStream(/* turbopackIgnore: true */ target);
    return new Response(toWebStream(stream, request.signal), {
      headers: {
        "content-type": type,
        "content-length": String(stat.size),
        "accept-ranges": "bytes",
        "cache-control": "no-store",
      },
    });
  }

  // 2. Serverless PostgreSQL fallback (Vercel without BLOB_READ_WRITE_TOKEN)
  const stored = await readDbArtifact(relative).catch(() => null);
  if (stored) {
    return serveBuffer(stored.data, stored.contentType, range);
  }

  return Response.json({ error: "File not found" }, { status: 404 });
}
