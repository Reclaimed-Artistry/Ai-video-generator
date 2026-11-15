import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * Shared failure surface for route-level errors.
 *
 * Used both by `error.tsx` boundaries and by server components that catch a
 * data-layer failure themselves. Showing a readable page matters: an unhandled
 * server error makes Next return an HTML error document with a 500, so the user
 * gets an unreadable page and no way to recover.
 */
export function ErrorState({
  code = "ERR",
  title,
  description,
  detail,
  retry,
}: {
  code?: string;
  title: string;
  description: string;
  detail?: string | null;
  retry?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-paper">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-soft">
        <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-paper">
            <BrandMark className="h-5 w-5" />
            Reclaimed Artistry
          </span>
          <span className="rounded-full bg-tally/12 px-2 py-0.5 text-[11px] font-semibold text-tally">
            {code}
          </span>
        </div>

        <div className="p-6">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-paper">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-ink">{description}</p>

          {detail ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-line bg-inset p-3 text-[11px] leading-relaxed text-ash">
              {detail}
            </pre>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {retry}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-inset px-3.5 py-2 text-xs font-semibold text-stone-ink transition-colors hover:border-brand-ring hover:text-paper"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to the studio
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-cue px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-hover"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Try again
    </button>
  );
}
