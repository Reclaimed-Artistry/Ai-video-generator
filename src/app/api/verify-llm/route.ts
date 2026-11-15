import { NextResponse } from "next/server";

import { llmProbe } from "@/lib/ai";

/**
 * Diagnostic: runs one real script request through the configured LLM and
 * reports the result, so a bad key, a retired model name or truncated JSON is
 * provable rather than guessed at.
 *
 * Off in production unless ENABLE_LLM_PROBE=1, because it is unauthenticated
 * and spends tokens.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LLM_PROBE !== "1") {
    return NextResponse.json(
      { error: "Not found. Set ENABLE_LLM_PROBE=1 to enable this diagnostic." },
      { status: 404 },
    );
  }

  const report = await llmProbe();
  return NextResponse.json(report, { status: report.ok === false ? 502 : 200 });
}
