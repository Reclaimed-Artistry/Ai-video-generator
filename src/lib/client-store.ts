import type { Project } from "./types";

const PREFIX = "ra:project:";
const INDEX_KEY = "ra:project-index";
const IDB_NAME = "reclaimed-artistry-cache";
const IDB_STORE = "renders";

const globalMemory = globalThis as typeof globalThis & {
  __raProjectMemory?: Map<string, Project>;
};

function memoryMap(): Map<string, Project> {
  if (!globalMemory.__raProjectMemory) {
    globalMemory.__raProjectMemory = new Map();
  }
  return globalMemory.__raProjectMemory;
}

function safeReadStorage(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore quota / privacy mode errors
  }
}

function safeRemoveStorage(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function readIndex(): string[] {
  if (typeof window === "undefined") return [];
  const raw =
    safeReadStorage(window.localStorage, INDEX_KEY) ??
    safeReadStorage(window.sessionStorage, INDEX_KEY);
  if (!raw) return Array.from(memoryMap().keys());
  try {
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
    for (const memId of memoryMap().keys()) {
      if (!ids.includes(memId)) ids.unshift(memId);
    }
    return ids;
  } catch {
    return Array.from(memoryMap().keys());
  }
}

export function saveLocalProject(project: Project): void {
  if (!project?.id) return;
  memoryMap().set(project.id, project);

  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(project);
  safeWriteStorage(window.localStorage, `${PREFIX}${project.id}`, serialized);
  safeWriteStorage(window.sessionStorage, `${PREFIX}${project.id}`, serialized);

  const ids = readIndex().filter((id) => id !== project.id);
  ids.unshift(project.id);
  const indexJson = JSON.stringify(ids.slice(0, 40));
  safeWriteStorage(window.localStorage, INDEX_KEY, indexJson);
  safeWriteStorage(window.sessionStorage, INDEX_KEY, indexJson);
}

export function loadLocalProject(id: string): Project | null {
  if (!id) return null;
  const inMemory = memoryMap().get(id);
  if (inMemory) return inMemory;

  if (typeof window === "undefined") return null;
  const raw =
    safeReadStorage(window.localStorage, `${PREFIX}${id}`) ??
    safeReadStorage(window.sessionStorage, `${PREFIX}${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Project;
    if (parsed?.id) {
      memoryMap().set(parsed.id, parsed);
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function listLocalProjects(): Project[] {
  if (typeof window === "undefined") return [];
  const seen = new Set<string>();
  const items: Project[] = [];
  for (const id of readIndex()) {
    if (seen.has(id)) continue;
    const project = loadLocalProject(id);
    if (project) {
      seen.add(id);
      items.push(project);
    }
  }
  return items.sort(
    (a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""),
  );
}

export function deleteLocalProject(id: string): void {
  memoryMap().delete(id);
  if (typeof window === "undefined") return;
  safeRemoveStorage(window.localStorage, `${PREFIX}${id}`);
  safeRemoveStorage(window.sessionStorage, `${PREFIX}${id}`);

  const ids = readIndex().filter((item) => item !== id);
  const indexJson = JSON.stringify(ids);
  safeWriteStorage(window.localStorage, INDEX_KEY, indexJson);
  safeWriteStorage(window.sessionStorage, INDEX_KEY, indexJson);
  void deleteLocalVideoBlob(id);
}

// ---------------------------------------------------------------------------
// IndexedDB cache for rendered MP4 Blobs in zero-DB Vercel mode
// ---------------------------------------------------------------------------

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveLocalVideoBlob(projectId: string, blob: Blob): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadLocalVideoBlob(projectId: string): Promise<Blob | null> {
  const db = await openMediaDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(projectId);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteLocalVideoBlob(projectId: string): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
