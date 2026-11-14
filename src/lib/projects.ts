import fs from "node:fs";
import path from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { assertDatabaseConfigured, db } from "@/db";
import { projects, type ProjectRow } from "@/db/schema";
import { hydrateSceneMedia } from "./stock";
import { STORAGE_DIR, deleteFromBlob } from "./storage";
import type { AspectRatio, Project, Resolution, Style, Tone, VideoScript } from "./types";

let schemaReady: Promise<void> | null = null;

/**
 * Create the projects table on first use. Hosts like Vercel never run
 * `drizzle-kit push`, so a fresh database is bootstrapped automatically.
 * Mirrors src/db/schema.ts exactly and is a no-op when the table exists.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      assertDatabaseConfigured();
      await db.execute(sql`
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
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function toProject(row: ProjectRow): Project {
  const script = (row.script ?? {}) as Partial<VideoScript>;
  const scenes = Array.isArray(script.scenes)
    ? script.scenes.map((scene) => hydrateSceneMedia(scene))
    : [];

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    status: row.status as Project["status"],
    progress: row.progress,
    stage: row.stage,
    error: row.error,
    voice: row.voice,
    resolution: row.resolution as Resolution,
    aspect: row.aspect as AspectRatio,
    tone: row.tone as Tone,
    style: row.style as Style,
    language: row.language,
    duration: row.duration,
    script: {
      title: script.title ?? row.title,
      summary: script.summary ?? "",
      scenes,
    },
    outputPath: row.outputPath,
    posterPath: row.posterPath,
    createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureSchema();
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function listProjects(limit = 24): Promise<Project[]> {
  await ensureSchema();
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(limit);
  return rows.map(toProject);
}

export async function updateProject(
  id: string,
  values: Partial<
    Pick<
      ProjectRow,
      | "title"
      | "status"
      | "progress"
      | "stage"
      | "error"
      | "voice"
      | "resolution"
      | "aspect"
      | "tone"
      | "style"
      | "language"
      | "duration"
      | "script"
      | "outputPath"
      | "posterPath"
    >
  >,
): Promise<void> {
  await ensureSchema();
  await db
    .update(projects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(projects.id, id));
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureSchema();
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id, outputPath: projects.outputPath, posterPath: projects.posterPath });
  if (deleted.length === 0) return false;

  await deleteFromBlob([deleted[0].outputPath, deleted[0].posterPath]);

  const renderDir = path.join(STORAGE_DIR, "renders", id);
  try {
    fs.rmSync(renderDir, { recursive: true, force: true });
  } catch {
    // Ignore filesystem cleanup error if directory doesn't exist
  }
  return true;
}
