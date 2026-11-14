import fs from "node:fs";
import { MUSIC_TRACKS, musicFilePath } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ track: string }> };

/** Stream a bundled background-music track for in-studio preview. */
export async function GET(_request: Request, context: Context) {
  const { track: id } = await context.params;
  const track = MUSIC_TRACKS.find((item) => item.id === id);
  const file = track ? musicFilePath(track) : null;
  if (!file) return Response.json({ error: "Track not found" }, { status: 404 });
  const stat = fs.statSync(/* turbopackIgnore: true */ file);
  const stream = fs.createReadStream(/* turbopackIgnore: true */ file);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(stat.size),
      "cache-control": "public, max-age=86400",
    },
  });
}
