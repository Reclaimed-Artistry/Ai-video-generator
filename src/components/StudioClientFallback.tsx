"use client";

import { ArrowLeft, ArrowUpRight, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import Studio from "@/components/Studio";
import {
  listLocalProjects,
  loadLocalProject,
  saveLocalProject,
} from "@/lib/client-store";
import type { Project } from "@/lib/types";

export default function StudioClientFallback({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(() => loadLocalProject(id));
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [checked, setChecked] = useState<boolean>(() => Boolean(loadLocalProject(id)));
  const [quickPrompt, setQuickPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (project) return;
    let active = true;

    async function recover() {
      const local = loadLocalProject(id);
      if (local) {
        if (active) {
          setProject(local);
          setChecked(true);
        }
        return;
      }

      // Check API in case a warm instance or newly connected Postgres has it
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            project?: Project;
          };
          if (active && data.project) {
            saveLocalProject(data.project);
            setProject(data.project);
            setChecked(true);
            return;
          }
        }
      } catch {
        // Fall through to workspace recovery view
      }

      if (active) {
        setRecentProjects(listLocalProjects().slice(0, 6));
        setChecked(true);
      }
    }

    void recover();
    return () => {
      active = false;
    };
  }, [id, project]);

  async function startFreshSequence(promptText?: string) {
    const clean = (promptText ?? quickPrompt).trim();
    if (!clean || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          resolution: "360p",
          aspect: "16:9",
          tone: "cinematic",
          duration: 30,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        project?: Project;
        error?: string;
      };
      if (!response.ok || !data.project) {
        throw new Error(data.error ?? "Could not create sequence");
      }
      saveLocalProject(data.project);
      setProject(data.project);
      router.replace(`/studio/${data.project.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to start sequence");
      setCreating(false);
    }
  }

  if (!checked) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 font-tech text-xs text-stone-ink">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-cue" />
          Loading sequence into Cut Desk…
        </span>
      </main>
    );
  }

  if (project) {
    return <Studio initialProject={project} ephemeralMode />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-paper">
      <div className="console-surface w-full max-w-xl rounded-[4px]">
        <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
          <span className="inline-flex items-center gap-2 text-paper">
            <BrandMark className="h-4 w-4" />
            Reclaimed Artistry
          </span>
          <span className="text-amber-cue">WORKSPACE RECOVERY</span>
        </div>

        <div className="p-6">
          <h1 className="font-editorial text-3xl text-paper">
            Start or reopen a sequence right here.
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-stone-ink">
            This sequence link was created in a different browser session (no
            shared database is connected yet). Start a fresh editable cut below
            or reopen a saved sequence from this browser.
          </p>

          <div className="mt-4 space-y-2">
            <textarea
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the video you want to create & edit (e.g., '30-second promo for a specialty mountain coffee roastery')…"
              className="w-full resize-none rounded-[3px] border border-line bg-canvas px-3 py-2.5 text-sm text-paper outline-none focus:border-amber-cue"
            />
            {createError ? (
              <p className="font-tech text-xs text-[#f4b4a8]">{createError}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={creating || !quickPrompt.trim()}
                onClick={() => void startFreshSequence()}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-4 py-2 font-tech text-[11px] font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover disabled:opacity-45"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 fill-current" />
                )}
                <span>Open in Studio</span>
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() =>
                  void startFreshSequence(
                    "A 30 second launch film for a small-batch mountain coffee roastery sourcing single-origin beans",
                  )
                }
                className="rounded-[3px] border border-line bg-inset px-3 py-2 font-tech text-[11px] text-paper transition-colors hover:border-amber-cue hover:text-amber-cue disabled:opacity-45"
              >
                Load Demo Cut
              </button>
              <Link
                href="/"
                className="ml-auto inline-flex items-center gap-1 font-tech text-[11px] text-stone-ink hover:text-paper"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Home Slate</span>
              </Link>
            </div>
          </div>

          {recentProjects.length > 0 ? (
            <div className="mt-6 border-t border-line pt-4">
              <p className="font-tech mb-2 text-[10px] uppercase tracking-[0.14em] text-ash">
                Saved in this browser ({recentProjects.length})
              </p>
              <div className="divide-y divide-line rounded-[3px] border border-line bg-inset/60">
                {recentProjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setProject(item);
                      router.replace(`/studio/${item.id}`);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-elevated"
                  >
                    <span className="truncate font-medium text-paper">
                      {item.title}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-tech text-[10px] text-amber-cue">
                      {item.resolution} · Open
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
