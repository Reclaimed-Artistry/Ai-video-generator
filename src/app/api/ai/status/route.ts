import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which generative engines are active (never exposes key values). */
export async function GET() {
  return NextResponse.json(aiStatus());
}
