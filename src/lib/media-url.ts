/**
 * Resolves a stored render path (either a Vercel Blob https:// URL or a
 * relative storage key like `renders/<id>/output.mp4`) into a browser URL.
 */
export function resolveMediaUrl(
  storedPath: string | null | undefined,
  fallbackRelative?: string,
  cacheBust?: string | number,
): string | null {
  const raw = storedPath || fallbackRelative;
  if (!raw) return null;

  const base =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `/api/files/${raw
          .replace(/^\/+/, "")
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/")}`;

  if (cacheBust === undefined || cacheBust === null || cacheBust === "") {
    return base;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}
