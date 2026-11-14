import fs from "node:fs";
import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type DatabaseKind = "postgres" | "pglite";

type PgliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<unknown>;
  waitReady?: Promise<void>;
};

function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function databaseKind(): DatabaseKind {
  return resolveDatabaseUrl() ? "postgres" : "pglite";
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
  __arenaNextJsPgliteClient?: PgliteLike;
  __appSchemaReady?: Promise<void> | null;
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

/**
 * Zero-setup embedded PostgreSQL (real Postgres compiled to WASM) used when no
 * `DATABASE_URL` is configured, so `npm run dev` works out of the box. Data
 * persists to `.pglite/` in the project root.
 */
function createPgliteClient(): PgliteLike {
  const { PGlite } = require("@electric-sql/pglite") as {
    PGlite: new (dataDir?: string) => PgliteLike;
  };
  const dataDir =
    process.env.PGLITE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".pglite");
  try {
    fs.mkdirSync(/* turbopackIgnore: true */ dataDir, { recursive: true });
  } catch {
    // Best effort — PGlite also supports in-memory when a directory is unavailable.
  }
  return new PGlite(dataDir);
}

function getPgliteClient(): PgliteLike {
  if (!globalForDb.__arenaNextJsPgliteClient) {
    globalForDb.__arenaNextJsPgliteClient = createPgliteClient();
  }
  return globalForDb.__arenaNextJsPgliteClient;
}

export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = createPool();
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export function getDb(): NodePgDatabase {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    if (databaseKind() === "pglite") {
      const { drizzle: drizzlePglite } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
      globalForDb.__arenaNextJsPostgresqlDb = drizzlePglite(
        getPgliteClient() as never,
      ) as unknown as NodePgDatabase;
    } else {
      globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
    }
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

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
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
    brand_kit_id uuid,
    output_path text,
    poster_path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS project_assets (
    key text PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content_type text NOT NULL,
    size integer NOT NULL,
    data bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS app_assets (
    key text PRIMARY KEY,
    content_type text NOT NULL,
    size integer NOT NULL,
    data bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS brand_kits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    logo_path text,
    primary_color text NOT NULL DEFAULT '#6D4AFF',
    accent_color text NOT NULL DEFAULT '#FFFFFF',
    font text NOT NULL DEFAULT 'DejaVu Sans',
    intro_title text,
    intro_subtitle text,
    outro_text text,
    website text,
    show_logo boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS cloned_voices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    provider text NOT NULL DEFAULT 'elevenlabs',
    provider_voice_id text NOT NULL,
    gender text NOT NULL DEFAULT 'neutral',
    accent text NOT NULL DEFAULT 'Cloned',
    description text,
    sample_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Safe, idempotent forward migrations for databases created by earlier versions.
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_kit_id uuid`,
];

/**
 * Idempotently ensures the PostgreSQL tables exist on fresh databases (Neon,
 * Vercel Postgres, Supabase, or the embedded PGlite instance) without
 * requiring a shell step.
 */
export async function ensureSchema(): Promise<void> {
  if (!globalForDb.__appSchemaReady) {
    globalForDb.__appSchemaReady = (async () => {
      if (databaseKind() === "pglite") {
        const client = getPgliteClient();
        if (client.waitReady) await client.waitReady;
        for (const statement of SCHEMA_STATEMENTS) {
          await client.exec(statement);
        }
        return;
      }
      const client = getPool();
      for (const statement of SCHEMA_STATEMENTS) {
        await client.query(statement);
      }
    })().catch((err) => {
      globalForDb.__appSchemaReady = null;
      throw err;
    });
  }
  await globalForDb.__appSchemaReady;
}
