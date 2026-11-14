import { NextResponse } from "next/server";
import { providerStatus, searchStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const provider = (url.searchParams.get("provider") ?? "all").trim();
  const limit = Math.min(40, Math.max(4, Number(url.searchParams.get("limit") ?? 24)));

  const { assets, source } = await searchStock(query, {
    type: "video",
    provider,
    limit,
  });

  return NextResponse.json({
    assets: assets.filter((asset) => asset.type === "video"),
    source,
    providers: providerStatus(),
  });
}
