import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema, hasDatabaseUrl } from "@/db";
import { projects, type ProjectRow } from "@/db/schema";
import { defaultMusicForTone } from "./music";
import { hydrateSceneMedia } from "./stock";
import { deleteProjectArtifacts, getStorageRoot } from "./storage";
import type { AspectRatio, Project, Resolution, Style, Tone, VideoScript } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

const globalForFallback = globalThis as typeof globalThis & {
  __ephemeralProjects?: Map<string, Project>;
};

function fallbackFile(): string {
  return path.join(getStorageRoot(), "projects.json");
}

function readFallbackStore(): Map<string, Project> {
  if (!globalForFallback.__ephemeralProjects) {
    globalForFallback.__ephemeralProjects = new Map();
  }
  const map = globalForFallback.__ephemeralProjects;
  try {
    const file = fallbackFile();
    if (fs.existsSync(/* turbopackIgnore: true */ file)) {
      const parsed = JSON.parse(
        fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"),
      ) as Project[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.id) map.set(item.id, item);
        }
      }
    }
  } catch {
    // Ignore unreadable temp cache
  }
  return map;
}

function writeFallbackStore(map: Map<string, Project>): void {
  try {
    const file = fallbackFile();
    fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
    fs.writeFileSync(
      /* turbopackIgnore: true */ file,
      JSON.stringify(Array.from(map.values())),
      "utf8",
    );
  } catch {
    // Keep in-memory state if disk write fails
  }
}

function hydrateProject(project: Project): Project {
  const scenes = Array.isArray(project.script?.scenes)
    ? project.script.scenes.map((scene) => hydrateSceneMedia(scene))
    : [];
  const opts = project.script?.options;
  return {
    ...project,
    script: {
      title: project.script?.title ?? project.title,
      summary: project.script?.summary ?? "",
      scenes,
      options: {
        workflow: opts?.workflow ?? "explainer",
        musicTrack: opts?.musicTrack ?? defaultMusicForTone(project.tone || "cinematic"),
        musicVolume: typeof opts?.musicVolume === "number" ? opts.musicVolume : 0.16,
        captionMode: opts?.captionMode ?? "word-highlight",
        captionPosition: opts?.captionPosition ?? "bottom",
        voiceRateOffset:
          typeof opts?.voiceRateOffset === "number" ? opts.voiceRateOffset : 0,
        autoMatchMedia: opts?.autoMatchMedia ?? true,
      },
    },
  };
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
        captionPosition: script.options?.captionPosition ?? "bottom",
        voiceRateOffset:
          typeof script.options?.voiceRateOffset === "number"
            ? script.options.voiceRateOffset
            : 0,
        autoMatchMedia: script.options?.autoMatchMedia ?? true,
      },
    },
    outputPath: row.outputPath,
    posterPath: row.posterPath,
    createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export type CreateProjectInput = {
  title: string;
  prompt: string;
  tone: Tone;
  style: Style;
  resolution: Resolution;
  aspect: AspectRatio;
  voice: string;
  language: string;
  duration: number;
  script: VideoScript;
};

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (!hasDatabaseUrl()) {
    const now = new Date().toISOString();
    const project = hydrateProject({
      id: randomUUID(),
      title: input.title,
      prompt: input.prompt,
      status: "ready",
      progress: 0,
      stage: "Script ready",
      error: null,
      voice: input.voice,
      resolution: input.resolution,
      aspect: input.aspect,
      tone: input.tone,
      style: input.style,
      language: input.language,
      duration: input.duration,
      script: input.script,
      outputPath: null,
      posterPath: null,
      createdAt: now,
      updatedAt: now,
    });
    const map = readFallbackStore();
    map.set(project.id, project);
    writeFallbackStore(map);
    return project;
  }

  await ensureSchema();
  const inserted = await db
    .insert(projects)
    .values({
      title: input.title,
      prompt: input.prompt,
      status: "ready",
      progress: 0,
      stage: "Script ready",
      tone: input.tone,
      style: input.style,
      resolution: input.resolution,
      aspect: input.aspect,
      voice: input.voice,
      language: input.language,
      duration: input.duration,
      script: input.script,
    })
    .returning();

  return toProject(inserted[0]);
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isValidUuid(id)) return null;

  if (!hasDatabaseUrl()) {
    const found = readFallbackStore().get(id);
    return found ? hydrateProject(found) : null;
  }

  await ensureSchema();
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function listProjects(limit = 24): Promise<Project[]> {
  if (!hasDatabaseUrl()) {
    // On Vercel without a DB, each serverless instance has isolated /tmp, so
    // never advertise instance-local IDs that another container can't reopen;
    // browser client-store hydrates the user's real sequence bin instead.
    if (process.env.VERCEL === "1") return [];
    return Array.from(readFallbackStore().values())
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit)
      .map(hydrateProject);
  }

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
      | "prompt"
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
  if (!isValidUuid(id)) return;

  if (!hasDatabaseUrl()) {
    const map = readFallbackStore();
    const existing = map.get(id);
    if (!existing) return;
    const updated: Project = {
      ...existing,
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.prompt !== undefined ? { prompt: values.prompt } : {}),
      ...(values.status !== undefined
        ? { status: values.status as Project["status"] }
        : {}),
      ...(values.progress !== undefined ? { progress: values.progress } : {}),
      ...(values.stage !== undefined ? { stage: values.stage } : {}),
      ...(values.error !== undefined ? { error: values.error } : {}),
      ...(values.voice !== undefined ? { voice: values.voice } : {}),
      ...(values.resolution !== undefined
        ? { resolution: values.resolution as Resolution }
        : {}),
      ...(values.aspect !== undefined
        ? { aspect: values.aspect as AspectRatio }
        : {}),
      ...(values.tone !== undefined ? { tone: values.tone as Tone } : {}),
      ...(values.style !== undefined ? { style: values.style as Style } : {}),
      ...(values.language !== undefined ? { language: values.language } : {}),
      ...(values.duration !== undefined ? { duration: values.duration } : {}),
      ...(values.script !== undefined
        ? { script: values.script as VideoScript }
        : {}),
      ...(values.outputPath !== undefined ? { outputPath: values.outputPath } : {}),
      ...(values.posterPath !== undefined ? { posterPath: values.posterPath } : {}),
      updatedAt: new Date().toISOString(),
    };
    map.set(id, hydrateProject(updated));
    writeFallbackStore(map);
    return;
  }

  await ensureSchema();
  await db
    .update(projects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(projects.id, id));
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!isValidUuid(id)) return false;

  if (!hasDatabaseUrl()) {
    const map = readFallbackStore();
    const existing = map.get(id);
    if (!existing) return false;
    map.delete(id);
    writeFallbackStore(map);
    await deleteProjectArtifacts(id, [existing.outputPath, existing.posterPath]);
    return true;
  }

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
