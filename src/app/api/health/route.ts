import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { storageDriverLabel } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureSchema();
    return Response.json({
      ok: true,
      storage: storageDriverLabel(),
      vercel: process.env.VERCEL === "1",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database unavailable",
      },
      { status: 500 },
    );
  }
}
