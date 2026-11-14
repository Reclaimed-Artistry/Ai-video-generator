import { NextResponse } from "next/server";
import { deleteBrandKit, getBrandKit, updateBrandKit } from "@/lib/brandkit";
import { deleteAppArtifact } from "@/lib/storage";
import type { BrandFontId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type PatchBody = {
  name?: string;
  logoPath?: string | null;
  primaryColor?: string;
  accentColor?: string;
  font?: BrandFontId;
  introTitle?: string | null;
  introSubtitle?: string | null;
  outroText?: string | null;
  website?: string | null;
  showLogo?: boolean;
  isDefault?: boolean;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const kit = await getBrandKit(id);
  if (!kit) return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
  return NextResponse.json({ brandKit: kit });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const existing = await getBrandKit(id);
  if (!existing) {
    return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
  }

  // Dropping the logo should also reclaim its stored bytes.
  if (body.logoPath === null && existing.logoPath) {
    await deleteAppArtifact(existing.logoPath).catch(() => undefined);
  }

  const updated = await updateBrandKit(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
  }
  return NextResponse.json({ brandKit: updated });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const kit = await getBrandKit(id);
  if (!kit) return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
  if (kit.logoPath) {
    await deleteAppArtifact(kit.logoPath).catch(() => undefined);
  }
  await deleteBrandKit(id);
  return NextResponse.json({ deleted: true });
}
