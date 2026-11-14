import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Vercel's Postgres (Neon) integration exposes POSTGRES_URL / DATABASE_URL;
 * Docker and local setups use DATABASE_URL.
 */
export const databaseUrl =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL;

const isServerless = Boolean(process.env.VERCEL);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * The pool is created eagerly but only connects on the first query, so builds
 * (where no database is attached yet) never fail at import time.
 */
export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // Serverless instances are short-lived and numerous: keep each pool small.
    max: isServerless ? 3 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

export function assertDatabaseConfigured(): void {
  if (!databaseUrl) {
    throw new Error(
      "No database configured. Set DATABASE_URL (or connect Vercel Postgres / Neon, which sets POSTGRES_URL).",
    );
  }
}
