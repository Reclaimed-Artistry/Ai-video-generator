import { NextResponse } from "next/server";
import { VOICES, activeTtsProvider } from "@/lib/voices";
import { providerStatus } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    voices: VOICES,
    provider: activeTtsProvider(),
    providers: providerStatus(),
  });
}
