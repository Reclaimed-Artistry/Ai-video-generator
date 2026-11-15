"use client";

import { ArrowRight, ArrowUpRight, CheckCircle2, Download, Film } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listLocalProjects } from "@/lib/client-store";
import { resolveMediaUrl } from "@/lib/media-url";
import type { Project } from "@/lib/types";

export default function LocalProjectsLedger({
  serverProjects,
}: {
  serverProjects: Project[];
}) {
  const [projects, setProjects] = useState<Project[]>(serverProjects);

  useEffect(() => {
    if (serverProjects.length > 0) return;
    const timer = setTimeout(() => {
      const local = listLocalProjects();
      if (local.length > 0) setProjects(local);
    }, 0);
    return () => clearTimeout(timer);
  }, [serverProjects.length]);

  if (projects.length === 0) return null;

  return (
    <section className="border-b border-line py-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-tech text-xs font-semibold uppercase tracking-[0.14em] text-paper">
            Workspace Sequence Ledger
          </h2>
          <span className="font-tech text-[11px] text-ash">
            Latest {Math.min(projects.length, 6)} cuts
          </span>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 font-tech text-xs text-amber-cue transition-colors hover:text-amber-hover"
        >
          <span>Open full bin ({projects.length})</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="console-surface divide-y divide-line overflow-hidden rounded-[4px]">
        {projects.slice(0, 6).map((project) => {
          const isDone = project.status === "done";
          const leadThumb = project.posterPath
            ? resolveMediaUrl(project.posterPath, `renders/${project.id}/poster.jpg`)
            : project.script.scenes[0]?.mediaThumb ?? null;
          const masterDownloadUrl = resolveMediaUrl(
            project.outputPath,
            `renders/${project.id}/output.mp4`,
          );

          return (
            <div
              key={project.id}
              className="grid gap-3 p-3 transition-colors hover:bg-inset/70 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center"
            >
              <Link
                href={`/studio/${project.id}`}
                className="relative aspect-video w-28 overflow-hidden rounded-[2px] border border-line bg-[#060605]"
              >
                {leadThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={leadThumb}
                    alt={project.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center font-tech text-[10px] text-ash">
                    <Film className="h-3.5 w-3.5" />
                  </div>
                )}
              </Link>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/studio/${project.id}`}
                    className="truncate text-sm font-semibold text-paper hover:text-amber-cue"
                  >
                    {project.title}
                  </Link>
                  <span
                    className={`inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-tech text-[10px] uppercase tracking-wider ${
                      isDone
                        ? "border border-nominal/35 bg-nominal/10 text-nominal"
                        : project.status === "rendering"
                          ? "border border-tally/40 bg-tally/15 text-[#f4b4a8]"
                          : "border border-line bg-inset text-stone-ink"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                    {project.status}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-ink">
                  {project.prompt}
                </p>
                <div className="font-tech mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ash">
                  <span>{project.resolution}</span>
                  <span>·</span>
                  <span>{project.aspect}</span>
                  <span>·</span>
                  <span>{project.script.scenes.length} scenes</span>
                  <span>·</span>
                  <span>VO: {project.voice}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isDone && masterDownloadUrl ? (
                  <a
                    href={masterDownloadUrl}
                    download={`reclaimed-artistry-${project.id.slice(0, 8)}.mp4`}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-inset px-2.5 py-1.5 font-tech text-[11px] text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
                  >
                    <Download className="h-3 w-3" />
                    <span>MP4</span>
                  </a>
                ) : null}
                <Link
                  href={`/studio/${project.id}`}
                  className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-elevated px-3 py-1.5 font-tech text-[11px] font-medium text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
                >
                  <span>Cut Desk</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
