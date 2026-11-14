"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import Studio from "@/components/Studio";
import { loadLocalProject, saveLocalProject } from "@/lib/client-store";
import type { Project } from "@/lib/types";

export default function StudioClientFallback({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 1. This browser's saved copy (the source of truth without a database).
      let found = loadLocalProject(id);
      // 2. Otherwise the server instance may still hold it in memory.
      if (!found) {
        try {
          const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { project?: Project };
            if (data.project?.id === id) {
              found = data.project;
              saveLocalProject(found);
            }
          }
        } catch {
          // Network/instance miss: fall through to the not-found screen.
        }
      }
      if (!cancelled) {
        setProject(found);
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!checked) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 font-tech text-xs text-stone-ink">
        Loading sequence…
      </main>
    );
  }

  if (!project) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 text-paper">
        <div className="console-surface w-full max-w-md rounded-[4px]">
          <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
            <span className="inline-flex items-center gap-2 text-paper">
              <BrandMark className="h-4 w-4" />
              Reclaimed Artistry
            </span>
            <span className="text-tally">ERR 404</span>
          </div>
          <div className="p-6">
            <h1 className="font-editorial text-3xl text-paper">
              Sequence not found in bin.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-stone-ink">
              This site has no database connected, so sequences are saved only
              in the browser that created them. It may have been made in another
              browser or device, or this browser&apos;s storage was cleared. Connect a
              database (Vercel → Storage → Neon Postgres, then redeploy) to keep
              sequences everywhere.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-3.5 py-2 font-tech text-[11px] font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Sequence Slate</span>
              </Link>
              <Link
                href="/projects"
                className="rounded-[3px] border border-line bg-inset px-3.5 py-2 font-tech text-[11px] uppercase tracking-[0.08em] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
              >
                Open Bin
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <Studio initialProject={project} ephemeralMode />;
}
