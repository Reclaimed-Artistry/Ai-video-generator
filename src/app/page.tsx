import {
  ArrowRight,
  AudioLines,
  Captions,
  Clapperboard,
  Download,
  Globe2,
  ImagePlus,
  Layers,
  Palette,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import Composer from "@/components/Composer";
import { Badge, CheckItem, SectionTitle } from "@/components/ui";
import { listProjects } from "@/lib/projects";
import { providerStatus } from "@/lib/stock";
import { formatClock, estimateSceneSeconds } from "@/lib/timecode";
import { imageProviderStatus } from "@/lib/imagen";
import { dubProviderStatus } from "@/lib/dub";
import { voiceCloneStatus } from "@/lib/voiceclone";
import { VOICES } from "@/lib/voices";
import { aiVideoStatus } from "@/lib/video";

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  {
    icon: Layers,
    title: "Template gallery",
    body: "Start from 22 pre-built formats — product launches, listicles, reels, mini-docs and more — each with its pacing, aspect and music already dialled in.",
  },
  {
    icon: Palette,
    title: "Brand kit",
    body: "Set your logo, palette and typeface once. Every render picks them up as a burned-in logo bug, brand-coloured captions and intro/outro title cards.",
  },
  {
    icon: ImagePlus,
    title: "AI-generated imagery",
    body: "Generate scene plates from a prompt. With an image API key you get photoreal stills; without one we compose brand-tinted abstract plates on device.",
  },
  {
    icon: AudioLines,
    title: "Voice cloning",
    body: "Upload samples to register a real neural clone, or save a reusable voice preset. No key needed for presets.",
  },
  {
    icon: Globe2,
    title: "Multi-language dubbing",
    body: "Translate the whole script and re-voice it with a native-locale narrator in 15 languages — one click, no re-editing.",
  },
  {
    icon: Captions,
    title: "Word-synced subtitles",
    body: "Dynamic captions that highlight the spoken word, clean broadcast subtitle lines, or lower-thirds — burned in as vector text.",
  },
];

const STEPS = [
  {
    code: "01",
    title: "Describe it",
    body: "Type a sentence or paste a script. Pick a format, length, voice and music — or start from a template.",
  },
  {
    code: "02",
    title: "We storyboard it",
    body: "We draft timed scenes, match each one to moving footage or a generated plate, and record neural voiceover.",
  },
  {
    code: "03",
    title: "Refine by chatting",
    body: "Ask for changes in plain English — swap a clip, change the voice, shorten the script, re-cut for vertical.",
  },
  {
    code: "04",
    title: "Export the master",
    body: "Server-side FFmpeg encodes an H.264/AAC MP4 at 240p, 360p or 1080p, ready to download and post.",
  },
];

export default async function HomePage() {
  const projects = await listProjects(6).catch(() => []);
  const providers = providerStatus();
  const imageStatus = imageProviderStatus();
  const videoStatus = aiVideoStatus();
  const dubStatus = dubProviderStatus();
  const cloneStatus = voiceCloneStatus();

  return (
    <div className="min-h-screen bg-canvas text-paper">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-paper">
            <BrandMark className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">
              Reclaimed Artistry
            </span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-3">
            <a
              href="#capabilities"
              className="hidden rounded-md px-2.5 py-1.5 text-xs font-semibold text-stone-ink transition-colors hover:bg-inset hover:text-paper sm:inline"
            >
              Features
            </a>
            <a
              href="#how"
              className="hidden rounded-md px-2.5 py-1.5 text-xs font-semibold text-stone-ink transition-colors hover:bg-inset hover:text-paper sm:inline"
            >
              How it works
            </a>
            <Link
              href="/projects"
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-stone-ink transition-colors hover:bg-inset hover:text-paper"
            >
              My videos
              {projects.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-amber-hover">
                  {projects.length}
                </span>
              ) : null}
            </Link>
            <Link href="/#composer" className="btn btn-primary py-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              New video
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="grid-veil pointer-events-none absolute inset-0 opacity-60" />
          <div
            className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)" }}
          />
          <div className="relative mx-auto max-w-[900px] px-4 py-14 sm:px-6 sm:py-20">
            <div className="text-center">
              <Badge tone="brand" className="mb-4">
                <Sparkles className="h-3 w-3" />
                Prompt-to-video studio
              </Badge>
              <h1 className="text-[2.1rem] font-semibold leading-[1.07] tracking-[-0.03em] text-paper sm:text-[3.4rem]">
                Type an idea.
                <br />
                <span className="brand-text">Get a finished video.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-stone-ink">
                Write one sentence and we&apos;ll draft the script, match every scene to
                moving footage or AI-generated imagery, record a neural voiceover, and
                encode an H.264 master you can download.
              </p>
            </div>

            <div id="composer" className="mt-9 scroll-mt-20">
              <Composer />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-ash">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-nominal" />
                Licensed stock footage
              </span>
              <span className="inline-flex items-center gap-1.5">
                <AudioLines className="h-3.5 w-3.5 text-nominal" />
                {VOICES.length} neural voices
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-nominal" />
                MP4 export, no watermark
              </span>
            </div>
          </div>
        </section>

        {/* Continue where you left off */}
        {projects.length > 0 ? (
          <section className="border-b border-line">
            <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6">
              <SectionTitle
                eyebrow="Workspace"
                title="Continue where you left off"
                action={
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-cue hover:text-amber-hover"
                  >
                    View all ({projects.length})
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.slice(0, 3).map((project) => {
                  const seconds = project.script.scenes.reduce(
                    (acc, scene) =>
                      acc + estimateSceneSeconds(scene.narration, scene.duration),
                    0,
                  );
                  return (
                    <Link
                      key={project.id}
                      href={`/studio/${project.id}`}
                      className="card card-hover flex gap-3 p-3"
                    >
                      <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-night">
                        {project.posterPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/renders/${project.id}/poster.jpg`}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Clapperboard className="h-5 w-5 text-white/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-paper">
                          {project.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-ink">
                          {project.prompt}
                        </p>
                        <p className="mt-1.5 font-tech text-[11px] text-ash">
                          {formatClock(seconds)} · {project.script.scenes.length} scenes ·{" "}
                          {project.aspect}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* Capabilities */}
        <section id="capabilities" className="border-b border-line scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20">
            <SectionTitle
              eyebrow="Everything in one studio"
              title="The whole video team, in a prompt box"
              description="Reclaimed Artistry ships the parts of InVideo AI that matter most — plus brand controls and dubbing — and runs on your own infrastructure."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <div key={item.title} className="card card-hover p-5">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-amber-cue">
                    <item.icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold text-paper">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-ink">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone="success">Stock: {providers.bundledLibrary} bundled clips</Badge>
              <Badge tone={imageStatus.configured ? "success" : "neutral"}>
                AI imagery: {imageStatus.label}
              </Badge>
              <Badge tone={videoStatus.configured ? "success" : "neutral"}>
                AI video: {videoStatus.label}
              </Badge>
              <Badge tone={dubStatus.configured ? "success" : "neutral"}>
                Dubbing: {dubStatus.label}
              </Badge>
              <Badge tone={cloneStatus.neural ? "success" : "neutral"}>
                Voice: {cloneStatus.label}
              </Badge>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16">
          <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20">
            <SectionTitle
              eyebrow="How it works"
              title="Four steps from prompt to master"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <div key={step.code} className="card p-5">
                  <span className="font-tech text-xs font-bold text-amber-cue">
                    /{step.code}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-paper">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-ink">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="card mt-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 max-w-lg">
                  <h3 className="text-base font-semibold text-paper">
                    Runs anywhere Next.js runs
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-ink">
                    One-click Vercel deploy with Fluid Compute, or Docker on Railway.
                    No database to provision — an embedded Postgres starts automatically
                    and upgrades to Neon or Supabase when you set{" "}
                    <code className="rounded border border-line bg-inset px-1.5 py-0.5 font-tech text-xs">
                      DATABASE_URL
                    </code>
                    .
                  </p>
                  <ul className="mt-4 space-y-2">
                    <CheckItem>Server-side FFmpeg: libx264 High, AAC-LC, −16 LUFS</CheckItem>
                    <CheckItem>Byte-range streaming for scrubbing and download</CheckItem>
                    <CheckItem>Renders offline — generated plates and narration fall back on device</CheckItem>
                  </ul>
                </div>
                <Link href="/#composer" className="btn btn-primary">
                  <Wand2 className="h-4 w-4" />
                  Make your first video
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-4 py-8 text-xs text-ash sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-4.5 w-4.5" />
            <span className="font-semibold text-stone-ink">Reclaimed Artistry</span>
            <span className="hidden sm:inline">
              · Next.js · FFmpeg · PostgreSQL · Edge neural TTS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/projects" className="text-stone-ink hover:text-paper">
              My videos
            </Link>
            <a href="#capabilities" className="text-stone-ink hover:text-paper">
              Features
            </a>
            <a
              href="https://github.com/Reclaimed-Artistry/Ai-video-generator"
              className="text-stone-ink hover:text-paper"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
