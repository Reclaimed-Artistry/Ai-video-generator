/**
 * Stable fingerprint of narration text (whitespace/case insensitive). Shared
 * by the server matcher and the studio so both agree on whether a scene's
 * footage was matched to its current narration.
 */
export function narrationFingerprint(narration: string): string {
  const normalized = narration.toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) | 0;
  }
  return `n${(hash >>> 0).toString(36)}-${normalized.length}`;
}

/** The text a scene's footage is matched against: narration, else its headline. */
export function sceneNarrationText(scene: { narration?: string | null; caption?: string | null }): string {
  return (scene.narration ?? "").trim() || (scene.caption ?? "").trim();
}
