import type { Project } from "./types";

const PREFIX = "ra:project:";
const INDEX_KEY = "ra:project-index";

export function saveLocalProject(project: Project): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}${project.id}`, JSON.stringify(project));
    const ids = readIndex().filter((id) => id !== project.id);
    ids.unshift(project.id);
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(ids.slice(0, 30)));
  } catch {
    // Ignore storage quota / private-mode errors
  }
}

export function loadLocalProject(id: string): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export function listLocalProjects(): Project[] {
  if (typeof window === "undefined") return [];
  const items: Project[] = [];
  for (const id of readIndex()) {
    const project = loadLocalProject(id);
    if (project) items.push(project);
  }
  return items;
}

export function deleteLocalProject(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${PREFIX}${id}`);
    const ids = readIndex().filter((item) => item !== id);
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
}

function readIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
