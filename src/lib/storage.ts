import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { del, put } from "@vercel/blob";

export const IS_VERCEL = Boolean(process.env.VERCEL);

/**
 * Working directory for renders. Vercel functions only have a writable,
 * ephemeral /tmp, so finished masters are uploaded to Vercel Blob from there.
 * Docker / VPS hosts keep files on a persistent STORAGE_DIR volume instead.
 */
export const STORAGE_DIR =
  process.env.STORAGE_DIR ??
  (IS_VERCEL
    ? path.join(os.tmpdir(), "cutline-storage")
    : path.join(process.cwd(), "storage"));

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Vercel without Blob has nowhere durable to keep rendered videos. */
export function storageProblem(): string | null {
  if (IS_VERCEL && !blobEnabled()) {
    return "Rendered videos need Vercel Blob storage on Vercel. In your Vercel project open Storage → Create → Blob, connect it to this project (this adds BLOB_READ_WRITE_TOKEN), then redeploy.";
  }
  return null;
}

export function isRemoteUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

/** Upload a finished file to Vercel Blob and return its public URL. */
export async function uploadToBlob(
  pathname: string,
  file: string,
  contentType: string,
): Promise<string> {
  try {
    const result = await put(pathname, fs.createReadStream(file), {
      access: "public",
      contentType,
      addRandomSuffix: true,
      multipart: fs.statSync(file).size > 8 * 1024 * 1024,
    });
    return result.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/private/i.test(message)) {
      throw new Error(
        "Your Vercel Blob store is private. Videos are shared by public URL, so create a Blob store with Public access (Storage → Create → Blob → Public), connect it to this project and redeploy.",
      );
    }
    throw new Error(`Uploading the finished video to Vercel Blob failed: ${message}`);
  }
}

export async function deleteFromBlob(urls: (string | null | undefined)[]): Promise<void> {
  const remote = urls.filter(isRemoteUrl);
  if (!blobEnabled() || remote.length === 0) return;
  try {
    await del(remote);
  } catch {
    // Best effort: a missing blob should never block deleting a project.
  }
}

/** Append Blob's download flag so browsers save instead of playing inline. */
export function blobDownloadUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("download", "1");
  return parsed.toString();
}
