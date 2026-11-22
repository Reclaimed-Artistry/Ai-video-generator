import { NextResponse } from "next/server";
import { providerStatus, searchStock } from "@/lib/stock";
import { MAX_STOCK_PAGE } from "@/lib/stock-id";
import { PEOPLE_REPRESENTATIONS, type PeopleRepresentation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROVIDERS = new Set(["all", "pexels", "mixkit", "wikimedia", "nasa", "pixabay"]);

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const provider = (url.searchParams.get("provider") ?? "all").trim().toLowerCase();
  const people = (url.searchParams.get("people") ?? "all").trim() as PeopleRepresentation;
  if (!PROVIDERS.has(provider) || !PEOPLE_REPRESENTATIONS.some((option) => option.id === people)) {
    return NextResponse.json({ error: "Invalid stock provider or people filter." }, { status: 400 });
  }
  // At least one slot for each supported provider in an All Sites search.
  const limit = boundedInteger(url.searchParams.get("limit"), 24, 5, 40);
  const page = boundedInteger(url.searchParams.get("page"), 1, 1, MAX_STOCK_PAGE);

  const result = await searchStock(query, {
    type: "video",
    provider,
    peopleRepresentation: people,
    limit,
    page,
    // Hand-picked media can include animation; automatic narration matching
    // still uses its stricter real-footage filter.
    includeAbstract: true,
  });

  return NextResponse.json({ ...result, providers: providerStatus() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
