import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import ProjectsBin from "@/components/ProjectsBin";
import { SectionTitle } from "@/components/ui";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects(60).catch(() => []);

  return (
    <div className="min-h-screen bg-canvas text-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 text-paper">
              <BrandMark className="h-6 w-6" />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">
                Reclaimed Artistry
              </span>
            </Link>
          </div>

          <Link href="/#composer" className="btn btn-primary py-1.5">
            <Plus className="h-3.5 w-3.5" />
            New video
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
        <SectionTitle
          eyebrow="Workspace"
          title="My videos"
          description="Every sequence drafted in this workspace. Open one to keep editing, or download a finished master."
          action={
            <Link href="/#composer" className="btn btn-secondary">
              <Sparkles className="h-3.5 w-3.5" />
              Start from a prompt
            </Link>
          }
        />

        <ProjectsBin initialProjects={projects} />
      </main>
    </div>
  );
}
