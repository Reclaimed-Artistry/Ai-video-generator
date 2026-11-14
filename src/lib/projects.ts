import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, type ProjectRow } from "@/db/schema";
import { hydrateSceneMedia } from "./stock";
import type { AspectRatio, Project, Resolution, Style, Tone, VideoScript } from "./types";

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

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
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function listProjects(limit = 24): Promise<Project[]> {
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
  await db
    .update(projects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(projects.id, id));
}

export async function deleteProject(id: string): Promise<boolean> {
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  if (deleted.length === 0) return false;

  const renderDir = path.join(STORAGE_DIR, "renders", id);
  try {
    fs.rmSync(renderDir, { recursive: true, force: true });
  } catch {
    // Ignore filesystem cleanup error if directory doesn't exist
  }
  return true;
}
