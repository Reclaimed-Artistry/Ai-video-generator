import { Plus } from "lucide-react";
import Link from "next/link";
import { CutlineMark } from "@/components/BrandMark";
import ProjectsBin from "@/components/ProjectsBin";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects(60).catch(() => []);

  return (
    <div className="min-h-screen bg-canvas text-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1380px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 text-paper">
              <CutlineMark className="h-5 w-5 text-paper" />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">
                Cutline
              </span>
            </Link>
            <span className="font-tech text-xs text-ash">/</span>
            <span className="font-tech text-xs uppercase tracking-[0.12em] text-stone-ink">
              Sequence Bin
            </span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-cue px-3.5 py-1.5 font-tech text-[11px] font-semibold uppercase tracking-[0.08em] text-[#14110A] transition-colors hover:bg-amber-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Sequence</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-tech text-[11px] uppercase tracking-[0.16em] text-amber-cue">
              PostgreSQL Workspace Archive
            </p>
            <h1 className="font-editorial mt-2 text-3xl leading-tight text-paper sm:text-[2.6rem]">
              Sequence Bin & Rendered Masters
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-stone-ink">
              Hover any slate to scrub moving footage, jump back into the Cut
              Desk to revise cues or resolution, or pull a finished H.264 MP4.
            </p>
          </div>
        </div>

        <ProjectsBin initialProjects={projects} />
      </main>
    </div>
  );
}
