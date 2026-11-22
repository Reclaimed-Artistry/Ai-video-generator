import type { StockAsset } from "./types";

/** Safety bound, high enough to browse the provider's own available pages. */
export const MAX_STOCK_PAGE = 10_000;

/** Treat the bundled and live Pexels records for the same video as one clip. */
export function stockAssetKey(asset: Pick<StockAsset, "id" | "provider">): string {
  if (asset.provider === "pexels") {
    const match = /^(?:v|pexels-video-)(\d+)$/.exec(asset.id);
    if (match) return `pexels:${match[1]}`;
  }
  return `${asset.provider}:${asset.id}`;
}
