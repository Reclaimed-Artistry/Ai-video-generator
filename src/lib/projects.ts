import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { projects, type ProjectRow } from "@/db/schema";
import { getBrandKit, getDefaultBrandKit } from "./brandkit";
import { defaultMusicForTone } from "./music";
import { hydrateSceneMedia } from "./stock";
import { deleteProjectArtifacts } from "./storage";
import type { AspectRatio, Project, Resolution, Style, Tone, VideoScript } from "./types";

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
      options: {
        workflow: script.options?.workflow ?? "explainer",
        musicTrack:
          script.options?.musicTrack ??
          defaultMusicForTone((row.tone as Tone) || "cinematic"),
        musicVolume:
          typeof script.options?.musicVolume === "number"
            ? script.options.musicVolume
            : 0.16,
        captionMode: script.options?.captionMode ?? "word-highlight",
      },
    },
    outputPath: row.outputPath,
    posterPath: row.posterPath,
    brandKitId: row.brandKitId ?? null,
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
      | "brandKitId"
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
    .returning({
      id: projects.id,
      outputPath: projects.outputPath,
      posterPath: projects.posterPath,
    });
  if (deleted.length === 0) return false;

  await deleteProjectArtifacts(id, [deleted[0].outputPath, deleted[0].posterPath]);
  return true;
}

/**
 * Loads a project with its brand kit attached. Falls back to the workspace
 * default kit when the project has no explicit brand, matching what the render
 * pipeline will apply.
 */
export async function getProjectWithBrand(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (!project) return null;

  let kit = project.brandKitId ? await getBrandKit(project.brandKitId) : null;
  if (!kit) {
    kit = await getDefaultBrandKit();
  }
  return { ...project, brandKit: kit };
}
