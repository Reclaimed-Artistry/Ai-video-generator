import { NextResponse } from "next/server";
import { getBrandKit, updateBrandKit } from "@/lib/brandkit";
import { deleteAppArtifact, saveAppArtifact } from "@/lib/storage";
import type { AspectRatio } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function sniffExtension(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "webp";
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const kit = await getBrandKit(id);
  if (!kit) return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No logo file was uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo must be 4 MB or smaller" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = ALLOWED[file.type] ?? sniffExtension(bytes);
  if (!ext) {
    return NextResponse.json(
      { error: "Use a PNG, JPG, or WebP image (SVG is not supported for logo burn-in)" },
      { status: 415 },
    );
  }

  const key = `brand/${id}/logo.${ext}`;
  const stored = await saveAppArtifact(
    key,
    Buffer.from(bytes),
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
  );

  if (kit.logoPath && kit.logoPath !== stored) {
    await deleteAppArtifact(kit.logoPath).catch(() => undefined);
  }

  const updated = await updateBrandKit(id, { logoPath: stored });
  return NextResponse.json({ brandKit: updated, key: stored });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const kit = await getBrandKit(id);
  if (!kit) return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
  if (kit.logoPath) {
    await deleteAppArtifact(kit.logoPath).catch(() => undefined);
  }
  const updated = await updateBrandKit(id, { logoPath: null });
  return NextResponse.json({ brandKit: updated });
}

export type { AspectRatio };
