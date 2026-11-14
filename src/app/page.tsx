import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import Composer from "@/components/Composer";
import FootageContactSheet from "@/components/FootageContactSheet";
import LocalProjectsLedger from "@/components/LocalProjectsLedger";
import ReferenceMonitor from "@/components/ReferenceMonitor";
import { listProjects } from "@/lib/projects";
import { providerStatus, VIDEO_CATALOG, castCoverage } from "@/lib/stock";
import { VOICES } from "@/lib/voices";

export const dynamic = "force-dynamic";

const PIPELINE_STAGES = [
  {
    code: "01",
    title: "Prompt-to-Video & Script-to-Video workflows",
    spec: "EXPLAINER · SHORTS · PROMO · DOC · MY SCRIPT",
    body: "Enter a one-line prompt or paste your own multi-paragraph script. Reclaimed Artistry drafts timed scenes, matches moving footage, and kicks off rendering in one click — then lets you edit any detail via natural-language commands.",
  },
  {
    code: "02",
    title: "Multi-site stock video search — zero static slideshows",
    spec: "PEXELS · MIXKIT · WIKIMEDIA · NASA · PIXABAY",
    body: "Searches live moving HD video clips across Pexels, Mixkit, Wikimedia Commons, and NASA right out of the box (plus full Pexels & Pixabay APIs when keys are added). Hover any clip in the Studio bin to preview before cutting.",
  },
  {
    code: "03",
    title: "24kHz neural voiceover + ducked music score",
    spec: `${VOICES.length} NEURAL VOICES · 5 ROYALTY-FREE SCORES · -16 LUFS`,
    body: "Records natural neural narration across American, British, and Australian accents in 10 languages, locks every cue to exact audio duration so visuals never drift, and mixes a royalty-free music bed gently underneath.",
  },
  {
    code: "04",
    title: "Word-synced subtitles & H.264 master export",
    spec: "WORD HIGHLIGHT LIBASS · 240P / 360P / 1080P MP4",
    body: "Uses neural word-boundary timestamps to burn InVideo-style active-word highlighted captions, clean subtitles, or lower-thirds into a fast-start H.264/AAC MP4 at 240p, 360p, or Full HD 1080p.",
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
              <BrandMark className="h-5 w-5 text-paper" />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">
                Reclaimed Artistry
              </span>
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
                <span className="text-line-strong">{"//"}</span>
                <span className="text-stone-ink">240p · 360p · 1080p</span>
              </div>

              <h1 className="font-editorial mt-3 max-w-2xl text-[2.5rem] leading-[1.02] tracking-[-0.01em] text-paper sm:text-[3.55rem]">
                Write a brief. Cut a narrated{" "}
                <span className="italic text-[#e8dcc4]">H.264 master</span>{" "}
                before the kettle boils.
              </h1>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-stone-ink">
                Paste rough talking points or a one-line concept. Reclaimed
                Artistry drafts the scene rundown, pulls licensed moving B-roll
                from Pexels and Pixabay, records a 24kHz neural voiceover, and
                muxes a finished MP4 on the server.
              </p>

              <div className="mt-7">
                <Composer castCoverage={castCoverage()} liveCast={providerStatus().pexels} />
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

        {/* Recent Sequences Ledger (hydrates from Postgres or local browser bin) */}
        <LocalProjectsLedger serverProjects={projects} />

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
                Reclaimed Artistry exposes every cue, spoken line, lower-third
                super, and source video file before running a deterministic
                FFmpeg encode.
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
                Pexels · {providers.pexels ? "Live Key" : "Verified Pool"}
              </span>
              <span className="rounded-[2px] border border-nominal/35 bg-nominal/10 px-2 py-1 text-nominal">
                Mixkit · Live
              </span>
              <span className="rounded-[2px] border border-nominal/35 bg-nominal/10 px-2 py-1 text-nominal">
                Wikimedia · Live
              </span>
              <span className="rounded-[2px] border border-nominal/35 bg-nominal/10 px-2 py-1 text-nominal">
                NASA · Live
              </span>
              <span className="rounded-[2px] border border-line bg-panel px-2 py-1 text-stone-ink">
                Pixabay · {providers.pixabay ? "Live Key" : "Optional Key"}
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
            <BrandMark className="h-4 w-4 text-stone-ink" />
            <span className="font-medium text-stone-ink">Reclaimed Artistry</span>
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
