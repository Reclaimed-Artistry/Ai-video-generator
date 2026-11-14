import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

function shouldUseSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("sslmode=require") || lower.includes("sslmode=verify")) {
    return true;
  }
  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "db") {
      return false;
    }
    return true;
  } catch {
    return Boolean(process.env.VERCEL);
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase;
  __cutlineSchemaReady?: Promise<void> | null;
};

function createPool(): Pool {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "Database connection string missing. Set DATABASE_URL (or attach Neon / Vercel Postgres).",
    );
  }
  return new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    max: process.env.VERCEL ? 5 : 10,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = createPool();
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export function getDb(): NodePgDatabase {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

/**
 * Lazy proxy so importing `@/db` during `next build` on Vercel never fails
 * when `DATABASE_URL` is only injected at runtime.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Idempotently ensures the PostgreSQL tables exist on fresh serverless
 * databases (Neon, Vercel Postgres, Supabase) without requiring a shell step.
 */
export async function ensureSchema(): Promise<void> {
  if (!globalForDb.__cutlineSchemaReady) {
    globalForDb.__cutlineSchemaReady = (async () => {
      const client = getPool();
      await client.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL,
          prompt text NOT NULL,
          status text NOT NULL DEFAULT 'draft',
          progress integer NOT NULL DEFAULT 0,
          stage text NOT NULL DEFAULT '',
          error text,
          voice text NOT NULL DEFAULT 'ava',
          resolution text NOT NULL DEFAULT '1080p',
          aspect text NOT NULL DEFAULT '16:9',
          tone text NOT NULL DEFAULT 'energetic',
          style text NOT NULL DEFAULT 'modern',
          language text NOT NULL DEFAULT 'en',
          duration integer NOT NULL DEFAULT 30,
          script jsonb NOT NULL DEFAULT '[]'::jsonb,
          output_path text,
          poster_path text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS project_assets (
          key text PRIMARY KEY,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          content_type text NOT NULL,
          size integer NOT NULL,
          data bytea NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
    })().catch((err) => {
      globalForDb.__cutlineSchemaReady = null;
      throw err;
    });
  }
  await globalForDb.__cutlineSchemaReady;
}
