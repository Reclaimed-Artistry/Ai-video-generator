"use client";

import { ArrowUpRight, CheckCircle2, Download, Film, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { estimateSceneSeconds, formatClock } from "@/components/BrandMark";
import type { Project } from "@/lib/types";

type StatusFilter = "all" | "done" | "drafts";

export default function ProjectsBin({
  initialProjects,
}: {
  initialProjects: Project[];
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      if (statusFilter === "done" && project.status !== "done") return false;
      if (statusFilter === "drafts" && project.status === "done") return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        project.title.toLowerCase().includes(q) ||
        project.prompt.toLowerCase().includes(q)
      );
    });
  }, [projects, statusFilter, query]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (response.ok) {
        setProjects((curr) => curr.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const doneCount = projects.filter((p) => p.status === "done").length;

  return (
    <div>
      {/* Bin Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="inline-flex rounded-[3px] border border-line bg-panel p-0.5 font-tech text-[11px] uppercase tracking-[0.08em]">
          {(
            [
              ["all", `All (${projects.length})`],
              ["done", `Masters (${doneCount})`],
              ["drafts", `Drafts (${projects.length - doneCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={`rounded-[2px] px-3 py-1.5 transition-colors ${
                statusFilter === id
                  ? "bg-elevated font-semibold text-amber-cue shadow-[inset_0_0_0_1px_#3a3832]"
                  : "text-stone-ink hover:text-paper"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ash" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter sequences by title or brief…"
            className="w-full rounded-[3px] border border-line bg-panel py-1.5 pl-8 pr-3 text-xs text-paper outline-none transition-colors focus:border-amber-cue"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="console-surface mt-8 rounded-[4px] px-6 py-14 text-center">
          <p className="text-sm font-semibold text-paper">
            {projects.length === 0
              ? "Sequence bin is empty"
              : "No sequences match the active filter"}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-stone-ink">
            {projects.length === 0
              ? "Return to the Sequence Slate, write a brief, and Cutline will assemble your scene rundown, moving B-roll, and neural voiceover."
              : "Clear the search filter or switch status tabs above."}
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-4 py-2 font-tech text-xs font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Draft New Sequence</span>
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project, index) => {
            const isDone = project.status === "done";
            const hovered = hoveredId === project.id;
            const estSeconds = project.script.scenes.reduce(
              (acc, scene) => acc + estimateSceneSeconds(scene.narration, scene.duration),
              0,
            );
            const previewVideo = isDone
              ? `/api/files/renders/${project.id}/output.mp4`
              : project.script.scenes[0]?.mediaUrl ?? null;
            const poster = project.posterPath
              ? `/api/files/renders/${project.id}/poster.jpg`
              : project.script.scenes[0]?.mediaThumb ?? null;

            return (
              <article
                key={project.id}
                onMouseEnter={() => setHoveredId(project.id)}
                onMouseLeave={() =>
                  setHoveredId((curr) => (curr === project.id ? null : curr))
                }
                className="console-surface flex flex-col justify-between overflow-hidden rounded-[4px] transition-colors hover:border-line-strong"
              >
                <div>
                  {/* Slate strip */}
                  <div className="flex items-center justify-between border-b border-line bg-inset px-3 py-1.5 font-tech text-[10px]">
                    <span className="text-ash">
                      SEQ {String(index + 1).padStart(2, "0")} // {project.resolution} · {project.aspect}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 uppercase ${
                        isDone ? "text-nominal" : "text-amber-cue"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                      {isDone ? "Master Ready" : project.status}
                    </span>
                  </div>

                  {/* Frame preview */}
                  <Link
                    href={`/studio/${project.id}`}
                    className="relative block aspect-video w-full overflow-hidden bg-[#060605]"
                  >
                    {hovered && previewVideo ? (
                      <video
                        src={previewVideo}
                        poster={poster ?? undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={poster}
                        alt={project.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-ash">
                        <Film className="h-5 w-5" />
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 rounded-[2px] border border-white/15 bg-black/80 px-1.5 py-0.5 font-tech text-[10px] text-paper">
                      ~{formatClock(estSeconds)} · {project.script.scenes.length} cues
                    </span>
                  </Link>

                  <div className="p-3.5">
                    <Link
                      href={`/studio/${project.id}`}
                      className="line-clamp-1 text-sm font-semibold text-paper transition-colors hover:text-amber-cue"
                    >
                      {project.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-ink">
                      {project.prompt}
                    </p>
                    <p className="font-tech mt-2 text-[10px] uppercase text-ash">
                      VO: {project.voice} · Tone: {project.tone} ·{" "}
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions footer */}
                <div className="flex items-center justify-between gap-2 border-t border-line bg-inset/60 px-3 py-2">
                  {confirmDeleteId === project.id ? (
                    <div className="flex w-full items-center justify-between font-tech text-[10px]">
                      <span className="text-[#f4b4a8]">Delete sequence?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deletingId === project.id}
                          onClick={() => void handleDelete(project.id)}
                          className="rounded-[2px] bg-tally px-2 py-0.5 font-semibold uppercase text-white"
                        >
                          {deletingId === project.id ? "…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-[2px] border border-line bg-panel px-2 py-0.5 uppercase text-stone-ink hover:text-paper"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/studio/${project.id}`}
                          className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-elevated px-2.5 py-1 font-tech text-[10px] font-medium uppercase tracking-wider text-paper transition-colors hover:border-amber-cue hover:text-amber-cue"
                        >
                          <span>Cut Desk</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                        {isDone ? (
                          <a
                            href={`/api/files/renders/${project.id}/output.mp4?download=1`}
                            download={`cutline-${project.id.slice(0, 8)}.mp4`}
                            className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-panel px-2 py-1 font-tech text-[10px] uppercase text-stone-ink transition-colors hover:border-line-strong hover:text-paper"
                          >
                            <Download className="h-3 w-3" />
                            <span>MP4</span>
                          </a>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(project.id)}
                        aria-label={`Delete ${project.title}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-ash transition-colors hover:text-tally"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
