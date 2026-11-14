import { sql } from "drizzle-orm";
import { db, ensureSchema, hasDatabaseUrl } from "@/db";
import { IS_VERCEL, storageDriverLabel } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return Response.json({
      ok: true,
      database: "ephemeral-tmp",
      storage: storageDriverLabel(),
      vercel: IS_VERCEL,
      note: "Running in temporary storage mode. Attach Neon/Postgres in Vercel Storage for permanent persistence.",
    });
  }

  try {
    await db.execute(sql`select 1`);
    await ensureSchema();
    return Response.json({
      ok: true,
      database: "postgresql",
      storage: storageDriverLabel(),
      vercel: IS_VERCEL,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "postgresql",
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 500 },
    );
  }
}
