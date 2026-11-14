import { ArrowRight, ArrowUpRight, CheckCircle2, Download, Film } from "lucide-react";
import Link from "next/link";
import { ReclaimedMark, Wordmark } from "@/components/BrandMark";
import Composer from "@/components/Composer";
import FootageContactSheet from "@/components/FootageContactSheet";
import ReferenceMonitor from "@/components/ReferenceMonitor";
import { resolveMediaUrl } from "@/lib/media-url";
import { listProjects } from "@/lib/projects";
import { providerStatus, VIDEO_CATALOG } from "@/lib/stock";
import { VOICES } from "@/lib/voices";

export const dynamic = "force-dynamic";

const PIPELINE_STAGES = [
  {
    code: "01",
    title: "Beat-structured script desk",
    spec: "HOOK → CONTEXT → STEPS → PAYOFF → CTA",
    body: "Turns a plain-English brief into timed narration cues, burned-in lower-third supers, and shot queries. Every line stays editable in the studio before a single frame is encoded.",
  },
  {
    code: "02",
    title: "Moving footage only — zero static slideshows",
    spec: "PEXELS POOL + LIVE PEXELS / PIXABAY VIDEO API",
    body: "Matches each cue against verified multi-rendition stock video clips so adjacent scenes never repeat the same shot. Swap any clip from the studio bin with live hover playback.",
  },
  {
    code: "03",
    title: "24kHz neural voice booth",
    spec: `${VOICES.length} PERSONAS · US / UK / AU · 10 LANGUAGES`,
    body: "Synthesizes natural neural voiceover with per-persona speaking rate and pitch contours, normalized to -16 LUFS broadcast loudness (EBU R128). Supports ElevenLabs and OpenAI keys when configured.",
  },
  {
    code: "04",
    title: "Server-side FFmpeg H.264 master",
    spec: "LIBX264 HIGH · LIBASS SUPERS · AAC-LC 160K",
    body: "Crops and scales source footage to 16:9, 9:16, or 1:1, burns styled ASS subtitles, concatenates scene masters, and writes a fast-start MP4 ready for immediate playback or download.",
  },
];

const RASTER_SPECS = [
  {
    badge: "240p",
    role: "Timing Proxy",
    landscape: "426×240",
    vertical: "240×426",
    square: "240×240",
    use: "Rapid VO pacing & caption placement checks",
  },
  {
    badge: "360p",
    role: "Lightweight Web",
    landscape: "640×360",
    vertical: "360×640",
    square: "360×360",
    use: "Fast review links, chat embeds & low-bandwidth feeds",
  },
  {
    badge: "1080p",
    role: "Full HD Master",
    landscape: "1920×1080",
    vertical: "1080×1920",
    square: "1080×1080",
    use: "Final delivery for YouTube, Reels, Shorts & client handoff",
  },
];

export default async function HomePage() {
  const projects = await listProjects(8).catch(() => []);
  const renderedProjects = projects.filter((project) => project.status === "done");
  const providers = providerStatus();

  return (
    <div className="min-h-screen bg-canvas text-paper">
      {/* Studio Masthead */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1380px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 text-paper">
              <ReclaimedMark className="h-5 w-5 text-paper" />
              <Wordmark />
            </Link>
            <span className="font-tech hidden border-l border-line pl-4 text-[11px] text-ash lg:inline">
              FFMPEG 7.0 · H.264 / AAC · {VOICES.length} NEURAL VOICES
            </span>
          </div>

          <nav className="flex items-center gap-5 text-xs">
            <a
              href="#pipeline"
              className="hidden text-stone-ink transition-colors hover:text-paper sm:inline"
            >
              Architecture & Specs
            </a>
            <a
              href="#broll"
              className="hidden text-stone-ink transition-colors hover:text-paper sm:inline"
            >
              Footage Pool ({providers.bundledLibrary})
            </a>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-[3px] border border-line bg-panel px-3 py-1.5 font-tech text-[11px] font-medium text-paper transition-colors hover:border-line-strong hover:bg-elevated"
            >
              <span>Sequence Bin</span>
              <span className="rounded-[2px] bg-inset px-1.5 py-0.2 text-[10px] text-amber-cue">
                {projects.length}
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 sm:px-6">
        {/* Asymmetric Hero Workbench */}
        <section className="border-b border-line py-10 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            {/* Left 7 columns: Editorial lead + Sequence Slate */}
            <div className="lg:col-span-7">
              <div className="font-tech inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-amber-cue">
                <span>Prompt-to-Picture Assembly</span>
                <span className="text-line-strong">//</span>
                <span className="text-stone-ink">240p · 360p · 1080p</span>
              </div>

              <h1 className="font-editorial mt-3 max-w-2xl text-[2.5rem] leading-[1.02] tracking-[-0.01em] text-paper sm:text-[3.55rem]">
                Write a brief. Cut a narrated{" "}
                <span className="italic text-[#e8dcc4]">H.264 master</span>{" "}
                before the kettle boils.
              </h1>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-stone-ink">
                Paste rough talking points or a one-line concept. Reclaimed Artistry drafts
                the scene rundown, pulls licensed moving B-roll from Pexels and
                Pixabay, records a 24kHz neural voiceover, and muxes a finished
                MP4 on the server.
              </p>

              <div className="mt-7">
                <Composer />
              </div>
            </div>

            {/* Right 5 columns: Live Broadcast Reference Monitor */}
            <div className="lg:col-span-5 lg:pt-1">
              <ReferenceMonitor
                renderedProjects={renderedProjects}
                fallbackClip={VIDEO_CATALOG[0] ?? null}
              />
            </div>
          </div>
        </section>

        {/* Recent Sequences Ledger (if workspace has projects) */}
        {projects.length > 0 ? (
          <section className="border-b border-line py-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="font-tech text-xs font-semibold uppercase tracking-[0.14em] text-paper">
                  Workspace Sequence Ledger
                </h2>
                <span className="font-tech text-[11px] text-ash">
                  Latest {Math.min(projects.length, 6)} cuts in PostgreSQL
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
                  ? resolveMediaUrl(
                      project.posterPath,
                      `renders/${project.id}/poster.jpg`,
                    )
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
        ) : null}

        {/* Asymmetric Technical Pipeline & Raster Spec Sheet */}
        <section id="pipeline" className="border-b border-line py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:sticky lg:top-20 lg:col-span-4 lg:self-start">
              <p className="font-tech text-[11px] uppercase tracking-[0.16em] text-amber-cue">
                Pipeline Specification
              </p>
              <h2 className="font-editorial mt-2.5 text-3xl leading-[1.08] text-paper sm:text-[2.5rem]">
                Built like a post house, wired like a build server.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-ink">
                Most prompt-to-video tools hide the timeline behind a black box.
                Reclaimed Artistry exposes every cue, spoken line, lower-third super, and
                source video file before running a deterministic FFmpeg encode.
              </p>

              <dl className="mt-6 divide-y divide-line border-y border-line font-tech text-xs">
                <div className="flex justify-between py-2.5">
                  <dt className="text-ash">Video Encoder</dt>
                  <dd className="text-paper">libx264 · High · CRF 23</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-ash">Audio Master</dt>
                  <dd className="text-paper">AAC-LC · 44.1kHz · -16 LUFS</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-ash">Subtitles</dt>
                  <dd className="text-paper">libass vector burn-in</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-ash">Container</dt>
                  <dd className="text-paper">ISO MP4 (+faststart)</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-8">
              <div className="divide-y divide-line border-y border-line">
                {PIPELINE_STAGES.map((stage) => (
                  <div
                    key={stage.code}
                    className="grid gap-3 py-6 sm:grid-cols-[56px_1fr]"
                  >
                    <span className="font-tech text-xs font-medium text-amber-cue">
                      /{stage.code}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold text-paper">
                          {stage.title}
                        </h3>
                        <span className="font-tech text-[10px] uppercase tracking-[0.12em] text-ash">
                          {stage.spec}
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-ink">
                        {stage.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Deliverable Raster Table (240p / 360p / 1080p) */}
              <div className="mt-8">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-tech text-xs font-semibold uppercase tracking-[0.14em] text-paper">
                    Deliverable Raster Matrix
                  </h3>
                  <span className="font-tech text-[11px] text-ash">
                    Switchable per sequence in Studio
                  </span>
                </div>
                <div className="console-surface overflow-x-auto rounded-[4px]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-inset font-tech text-[10px] uppercase tracking-[0.12em] text-ash">
                        <th className="px-3.5 py-2.5">Profile</th>
                        <th className="px-3.5 py-2.5">16:9 Wide</th>
                        <th className="px-3.5 py-2.5">9:16 Reel</th>
                        <th className="px-3.5 py-2.5">1:1 Square</th>
                        <th className="px-3.5 py-2.5">Intended Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {RASTER_SPECS.map((row) => (
                        <tr key={row.badge} className="hover:bg-inset/50">
                          <td className="px-3.5 py-3">
                            <span className="font-tech font-semibold text-amber-cue">
                              {row.badge}
                            </span>
                            <span className="ml-2 text-stone-ink">{row.role}</span>
                          </td>
                          <td className="px-3.5 py-3 font-tech text-paper">
                            {row.landscape}
                          </td>
                          <td className="px-3.5 py-3 font-tech text-paper">
                            {row.vertical}
                          </td>
                          <td className="px-3.5 py-3 font-tech text-paper">
                            {row.square}
                          </td>
                          <td className="px-3.5 py-3 text-stone-ink">{row.use}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Verified Moving Footage Contact Sheet */}
        <section id="broll" className="py-14 lg:py-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-tech text-[11px] uppercase tracking-[0.16em] text-amber-cue">
                Licensed B-Roll Contact Sheet
              </p>
              <h2 className="font-editorial mt-2 text-3xl leading-tight text-paper sm:text-[2.5rem]">
                Every cue resolves to moving footage.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-stone-ink">
                {providers.bundledLibrary} multi-rendition Pexels video clips
                ship pre-indexed out of the box. Connect{" "}
                <code className="rounded-[2px] border border-line bg-inset px-1.5 py-0.5 font-tech text-xs text-paper">
                  PEXELS_API_KEY
                </code>{" "}
                or{" "}
                <code className="rounded-[2px] border border-line bg-inset px-1.5 py-0.5 font-tech text-xs text-paper">
                  PIXABAY_API_KEY
                </code>{" "}
                to query millions of live clips directly from the Studio bin.
              </p>
            </div>

            <div className="font-tech flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
              <span className="rounded-[2px] border border-nominal/35 bg-nominal/10 px-2 py-1 text-nominal">
                Pexels Pool · Ready
              </span>
              <span className="rounded-[2px] border border-line bg-panel px-2 py-1 text-stone-ink">
                Pexels Live · {providers.pexels ? "Key Active" : "Optional Key"}
              </span>
              <span className="rounded-[2px] border border-line bg-panel px-2 py-1 text-stone-ink">
                Pixabay Video · {providers.pixabay ? "Key Active" : "Optional Key"}
              </span>
            </div>
          </div>

          <FootageContactSheet clips={VIDEO_CATALOG} />
        </section>
      </main>

      {/* Studio Colophon Footer */}
      <footer className="border-t border-line bg-panel/60">
        <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-4 px-4 py-7 text-xs text-ash sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <ReclaimedMark className="h-4 w-4 text-stone-ink" />
            <Wordmark className="text-stone-ink opacity-90" />
            <span className="font-tech text-[11px]">
              · PostgreSQL + Drizzle · FFmpeg libx264/libass · 24kHz Neural TTS
            </span>
          </div>
          <div className="font-tech flex items-center gap-5 text-[11px]">
            <Link href="/projects" className="text-stone-ink hover:text-paper">
              Sequence Bin
            </Link>
            <a href="#pipeline" className="text-stone-ink hover:text-paper">
              Raster Matrix
            </a>
            <a href="#broll" className="text-stone-ink hover:text-paper">
              B-Roll Pool
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
