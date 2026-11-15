import { NextResponse } from "next/server";
import { saveGeneratedMedia } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request body limit

/** Trust the bytes, not the declared content type. */
function sniffImageType(data: Buffer): string | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.length > 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Upload a character / reference image (JPEG, PNG or WebP, max 4 MB). */
export async function POST(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 4 MB)." }, { status: 413 });
  }
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is empty or too large (max 4 MB)." }, { status: 413 });
  }
  const contentType = sniffImageType(data);
  if (!contentType) {
    return NextResponse.json({ error: "Please upload a JPEG, PNG or WebP image." }, { status: 415 });
  }
  try {
    const url = await saveGeneratedMedia(projectId, data, contentType);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not store the image" },
      { status: 500 },
    );
  }
}
