import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { brandKits, type BrandKitRow } from "@/db/schema";
import { isUuidLike } from "./id";
import { resolveMediaUrl } from "./media-url";
import type { BrandFontId, BrandKit } from "./types";

export const BRAND_KIT_DEFAULTS: Omit<
  BrandKit,
  "id" | "createdAt" | "updatedAt" | "logoUrl"
> = {
  name: "My Brand",
  logoPath: null,
  primaryColor: "#6D4AFF",
  accentColor: "#FFFFFF",
  font: "dejavu" as BrandFontId,
  introTitle: null,
  introSubtitle: null,
  outroText: null,
  website: null,
  showLogo: true,
  isDefault: false,
};

export function toBrandKit(row: BrandKitRow): BrandKit {
  return {
    id: row.id,
    name: row.name,
    logoPath: row.logoPath,
    logoUrl: resolveMediaUrl(row.logoPath, undefined, row.updatedAt?.getTime?.() ?? undefined),
    primaryColor: row.primaryColor || BRAND_KIT_DEFAULTS.primaryColor,
    accentColor: row.accentColor || BRAND_KIT_DEFAULTS.accentColor,
    font: (row.font as BrandFontId) ?? "dejavu",
    introTitle: row.introTitle,
    introSubtitle: row.introSubtitle,
    outroText: row.outroText,
    website: row.website,
    showLogo: row.showLogo,
    isDefault: row.isDefault,
    createdAt: row.createdAt?.toISOString?.(),
    updatedAt: row.updatedAt?.toISOString?.(),
  };
}

export async function listBrandKits(): Promise<BrandKit[]> {
  await ensureSchema();
  const rows = await db
    .select()
    .from(brandKits)
    .orderBy(desc(brandKits.isDefault), desc(brandKits.updatedAt))
    .limit(50);
  return rows.map(toBrandKit);
}

export async function getBrandKit(id: string): Promise<BrandKit | null> {
  if (!isUuidLike(id)) return null;
  await ensureSchema();
  const rows = await db.select().from(brandKits).where(eq(brandKits.id, id)).limit(1);
  return rows[0] ? toBrandKit(rows[0]) : null;
}

/** The kit auto-applied to new projects: the flagged default, else the newest. */
export async function getDefaultBrandKit(): Promise<BrandKit | null> {
  await ensureSchema();
  const flagged = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.isDefault, true))
    .limit(1);
  if (flagged[0]) return toBrandKit(flagged[0]);
  const newest = await db
    .select()
    .from(brandKits)
    .orderBy(desc(brandKits.updatedAt))
    .limit(1);
  return newest[0] ? toBrandKit(newest[0]) : null;
}

export type BrandKitInput = Partial<
  Pick<
    BrandKit,
    | "name"
    | "logoPath"
    | "primaryColor"
    | "accentColor"
    | "font"
    | "introTitle"
    | "introSubtitle"
    | "outroText"
    | "website"
    | "showLogo"
    | "isDefault"
  >
>;

const HEX = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return fallback;
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function sanitize(input: BrandKitInput) {
  const patch: Partial<typeof brandKits.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 80) || "My Brand";
  if (input.logoPath !== undefined) patch.logoPath = input.logoPath || null;
  if (input.primaryColor !== undefined) {
    patch.primaryColor = normalizeHex(input.primaryColor, BRAND_KIT_DEFAULTS.primaryColor);
  }
  if (input.accentColor !== undefined) {
    patch.accentColor = normalizeHex(input.accentColor, BRAND_KIT_DEFAULTS.accentColor);
  }
  if (input.font !== undefined) patch.font = input.font;
  if (input.introTitle !== undefined) patch.introTitle = input.introTitle?.slice(0, 90) ?? null;
  if (input.introSubtitle !== undefined) {
    patch.introSubtitle = input.introSubtitle?.slice(0, 120) ?? null;
  }
  if (input.outroText !== undefined) patch.outroText = input.outroText?.slice(0, 120) ?? null;
  if (input.website !== undefined) patch.website = input.website?.slice(0, 120) ?? null;
  if (input.showLogo !== undefined) patch.showLogo = Boolean(input.showLogo);
  return patch;
}

export async function createBrandKit(input: BrandKitInput = {}): Promise<BrandKit> {
  await ensureSchema();
  const patch = sanitize(input);

  // Only one kit can be the workspace default.
  if (patch.isDefault) {
    await db
      .update(brandKits)
      .set({ isDefault: false })
      .where(eq(brandKits.isDefault, true));
  }

  const inserted = await db
    .insert(brandKits)
    .values({
      name: patch.name ?? BRAND_KIT_DEFAULTS.name,
      logoPath: patch.logoPath ?? null,
      primaryColor: patch.primaryColor ?? BRAND_KIT_DEFAULTS.primaryColor,
      accentColor: patch.accentColor ?? BRAND_KIT_DEFAULTS.accentColor,
      font: patch.font ?? BRAND_KIT_DEFAULTS.font,
      introTitle: patch.introTitle ?? null,
      introSubtitle: patch.introSubtitle ?? null,
      outroText: patch.outroText ?? null,
      website: patch.website ?? null,
      showLogo: patch.showLogo ?? true,
      isDefault: Boolean(input.isDefault) || !(await hasAnyKit()),
    })
    .returning();
  return toBrandKit(inserted[0]);
}

async function hasAnyKit(): Promise<boolean> {
  const rows = await db.select({ id: brandKits.id }).from(brandKits).limit(1);
  return rows.length > 0;
}

export async function updateBrandKit(
  id: string,
  input: BrandKitInput,
): Promise<BrandKit | null> {
  await ensureSchema();
  const patch = sanitize(input);
  if (Object.keys(patch).length === 0 && input.isDefault === undefined) {
    return getBrandKit(id);
  }

  if (input.isDefault) {
    await db
      .update(brandKits)
      .set({ isDefault: false })
      .where(eq(brandKits.isDefault, true));
  }
  const next: Partial<typeof brandKits.$inferInsert> = { ...patch, updatedAt: new Date() };
  if (input.isDefault !== undefined) next.isDefault = Boolean(input.isDefault);

  const updated = await db
    .update(brandKits)
    .set(next)
    .where(eq(brandKits.id, id))
    .returning();
  return updated[0] ? toBrandKit(updated[0]) : null;
}

export async function deleteBrandKit(id: string): Promise<BrandKit | null> {
  await ensureSchema();
  const deleted = await db.delete(brandKits).where(eq(brandKits.id, id)).returning();
  if (deleted.length === 0) return null;
  // Promote another kit to default so new projects always have branding.
  if (deleted[0].isDefault) {
    const next = await db.select({ id: brandKits.id }).from(brandKits).limit(1);
    if (next[0]) {
      await db
        .update(brandKits)
        .set({ isDefault: true })
        .where(eq(brandKits.id, next[0].id));
    }
  }
  return toBrandKit(deleted[0]);
}

/* --------------------------------------------------------------- rendering */

/** Converts a `#rrggbb` hex into the `&H00BBGGRR` colour literal libass wants. */
export function hexToAssColor(hex: string, fallback = "FFFFFF"): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  const raw = match ? match[1] : fallback;
  const r = raw.slice(0, 2);
  const g = raw.slice(2, 4);
  const b = raw.slice(4, 6);
  return `&H00${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

/** Converts a `#rrggbb` hex into ffmpeg's `0xRRGGBB` colour syntax. */
export function hexToFfmpegColor(hex: string, fallback = "6D4AFF"): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  return `0x${match ? match[1].toUpperCase() : fallback}`;
}

export function hexToRgb(hex: string, fallback = "109,74,255"): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!match) return fallback;
  const raw = match[1];
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ].join(",");
}
