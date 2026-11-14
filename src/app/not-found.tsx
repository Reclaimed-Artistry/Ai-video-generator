import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CutlineMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 text-paper">
      <div className="console-surface w-full max-w-md rounded-[4px]">
        <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.14em] text-ash">
          <span className="inline-flex items-center gap-2 text-paper">
            <CutlineMark className="h-4 w-4" />
            Cutline
          </span>
          <span className="text-tally">ERR 404</span>
        </div>
        <div className="p-6">
          <h1 className="font-editorial text-3xl text-paper">
            Sequence not found in bin.
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-stone-ink">
            The requested reel ID does not exist in PostgreSQL or was removed
            from the workspace archive.
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
