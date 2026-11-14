import { sql } from "drizzle-orm";
import { databaseUrl, db } from "@/db";
import { ensureSchema } from "@/lib/projects";
import { IS_VERCEL, blobEnabled, storageProblem } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + configuration report (never exposes secret values). */
export async function GET() {
  const config = {
    host: IS_VERCEL ? "vercel" : "server",
    databaseConfigured: Boolean(databaseUrl),
    blobStorage: blobEnabled(),
    storageWarning: storageProblem(),
  };
  try {
    await ensureSchema();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, ...config });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        ...config,
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 500 },
    );
  }
}
