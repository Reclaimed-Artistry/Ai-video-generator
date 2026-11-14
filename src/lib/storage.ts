import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db, ensureSchema, hasDatabaseUrl } from "@/db";
import { projectAssets } from "@/db/schema";

export const IS_VERCEL = process.env.VERCEL === "1";

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Writable scratch directory for FFmpeg scene rendering. On Vercel `/var/task`
 * is read-only, so scratch files always live under `/tmp/reclaimed-artistry-storage`.
 */
export function getStorageRoot(): string {
  if (process.env.STORAGE_DIR) return process.env.STORAGE_DIR;
  if (IS_VERCEL) return path.join(os.tmpdir(), "reclaimed-artistry-storage");
  return path.join(/* turbopackIgnore: true */ process.cwd(), "storage");
}

export function getProjectScratchDir(projectId: string): string {
  return path.join(getStorageRoot(), "renders", projectId);
}

export function storageDriverLabel():
  | "vercel-blob"
  | "postgres-bytea"
  | "ephemeral-tmp"
  | "local-disk" {
  if (isBlobConfigured()) return "vercel-blob";
  if (IS_VERCEL && hasDatabaseUrl()) return "postgres-bytea";
  if (IS_VERCEL) return "ephemeral-tmp";
  return "local-disk";
}

export function storesArtifactsExternally(): boolean {
  return isBlobConfigured() || (IS_VERCEL && hasDatabaseUrl());
}

/**
 * Persists a rendered deliverable (`output.mp4` or `poster.jpg`) to the best
 * available backend and returns the stored reference (either a Vercel Blob
 * HTTPS CDN URL or a relative key like `renders/<id>/output.mp4`).
 */
export async function saveRenderArtifact(
  projectId: string,
  filename: string,
  localFilePath: string,
  contentType: string,
): Promise<string> {
  const key = `renders/${projectId}/${filename}`;

  // Tier 1: Vercel Blob (fast global CDN + native Range requests)
  if (isBlobConfigured()) {
    const buffer = fs.readFileSync(/* turbopackIgnore: true */ localFilePath);
    const blob = await put(key, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return blob.url;
  }

  // Tier 2: Serverless Vercel with Postgres (without Blob token) -> persist in PostgreSQL
  if (IS_VERCEL && hasDatabaseUrl()) {
    await ensureSchema();
    const buffer = fs.readFileSync(/* turbopackIgnore: true */ localFilePath);
    await db
      .insert(projectAssets)
      .values({
        key,
        projectId,
        contentType,
        size: buffer.length,
        data: buffer,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: projectAssets.key,
        set: {
          contentType,
          size: buffer.length,
          data: buffer,
          updatedAt: new Date(),
        },
      });
    return key;
  }

  // Tier 3: Local / Docker / Railway persistent volume (or Vercel /tmp fallback without DB)
  return key;
}

export async function readDbArtifact(key: string): Promise<{
  data: Buffer;
  contentType: string;
  size: number;
} | null> {
  if (!hasDatabaseUrl()) return null;
  await ensureSchema();
  const rows = await db
    .select({
      data: projectAssets.data,
      contentType: projectAssets.contentType,
      size: projectAssets.size,
    })
    .from(projectAssets)
    .where(eq(projectAssets.key, key))
    .limit(1);

  if (!rows[0]) return null;
  return rows[0];
}

export async function deleteProjectArtifacts(
  projectId: string,
  urls: (string | null | undefined)[] = [],
): Promise<void> {
  const dir = getProjectScratchDir(projectId);
  try {
    fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  } catch {
    // Ignore missing directory
  }

  if (isBlobConfigured()) {
    const blobUrls = urls.filter(
      (value): value is string =>
        typeof value === "string" &&
        (value.startsWith("https://") || value.startsWith("http://")),
    );
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
      } catch {
        // Ignore already-deleted blobs
      }
    }
  }
}
