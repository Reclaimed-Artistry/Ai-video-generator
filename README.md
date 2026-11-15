# Reclaimed Artistry — Prompt-to-Video Studio

Type one sentence and get a finished, narrated, captioned MP4. An InVideo-style
prompt-first studio: pick a template, describe your video, and the pipeline
drafts the script, casts a voice, sources or generates imagery, applies your
brand kit, and encodes the master with FFmpeg.

## Highlights

- **Prompt-first composer** — one textarea drives everything. Add optional
  settings (format, length, voice, subtitles, music, tone, language, quality),
  preview the voice, then either draft the script or go straight to a finished
  render. `⌘/Ctrl + Enter` submits.
- **22-template gallery** — Marketing, YouTube, Social, Education, Business and
  Story templates, each with a ready-made brief, aspect ratio, tone, voice and
  music track. Picking one pre-fills the composer.
- **Brand kits** — logo upload, primary + text colours, caption typeface,
  intro title/subtitle, outro text and website. Applied to intro cards, outro
  cards, burned-in captions and every AI-generated plate.
- **AI imagery** — OpenAI / Stability / Replicate / Gemini when a key is
  configured. With no key, falls back to an on-device FFmpeg procedural
  generator that composes brand-tinted fractal plates (hue-preserving, so a
  dark teal brand stays a teal instead of washing out to grey).
- **Voice cloning** — ElevenLabs neural cloning from a sample, or an offline
  voice-preset path (base voice + rate + pitch) that needs no API key. Cloned
  voices appear in the narrator picker alongside 14 built-in AI presenters.
- **Dubbing** — 15 languages. Translates narration and captions when a
  translation provider is configured, otherwise switches voice locale and
  caption language so the cut is still localized.
- **Server-side FFmpeg master** — `libx264` High profile, `libass` vector
  caption burn-in, `loudnorm` stereo AAC-LC audio, scene-proportional Ken Burns
  on stills, HTTP Range streaming for scrubbing and download.
- **Zero-setup database** — Postgres via `DATABASE_URL` in production; embeds
  PGlite locally so `npm run dev` works with no database install at all.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Drizzle ORM ·
PostgreSQL / PGlite · FFmpeg (`@ffmpeg-installer/ffmpeg`) ·
`@andresaya/edge-tts` · `mespeak` · `lucide-react`.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

No environment variables are required — everything degrades gracefully
offline. Scripts use a deterministic built-in engine, narration uses
`mespeak`, and imagery uses the on-device procedural generator.

### Optional environment variables

| Variable | Enables |
| --- | --- |
| `DATABASE_URL` | Production Postgres (falls back to embedded PGlite) |
| `OPENAI_API_KEY` | LLM script drafting + DALL·E imagery |
| `STABILITY_API_KEY` / `REPLICATE_API_TOKEN` / `GEMINI_API_KEY` | Alternative image providers |
| `GEMINI_API_KEY` | **Free** LLM script drafting via Gemini's OpenAI-compatible endpoint (~15 RPM / 500 RPD, no card) — also enables imagery, so one key covers both. Override: `GEMINI_TEXT_MODEL`. Accepts both the classic `AIza...` key and Google's newer `AQ.` Authentication Key — the app detects the prefix, since `AQ.` keys are rejected as bearer tokens and must be sent in `x-goog-api-key`. |
| `GROQ_API_KEY` | **Free** LLM script drafting via Groq (~30 RPM / 1,000 RPD, no card). Override: `GROQ_TEXT_MODEL`. |
| `LLM_MAX_TOKENS` / `LLM_JSON_MODE` / `LLM_BASE_URL` | Tuning for whichever LLM is active: output budget (raise it if scripts come back truncated), `LLM_JSON_MODE=off` if the model rejects `response_format`, `LLM_BASE_URL` to route through a proxy or gateway |
| `REPLICATE_API_TOKEN` | AI scene **video** via HunyuanVideo (`tencent/hunyuan-video`). The model needs ~45GB VRAM, so it runs on Replicate's GPUs rather than locally. Optional `HUNYUAN_VIDEO_MODEL` / `HUNYUAN_INFER_STEPS` / `HUNYUAN_GUIDANCE_SCALE` / `HUNYUAN_FLOW_SHIFT` / `HUNYUAN_TIMEOUT_MS` overrides. |
| `AI_VIDEO_MODE` | When to generate video: `fallback` (default — only scenes with no usable stock clip), `always`, or `off` |
| `ELEVENLABS_API_KEY` | Neural voices + real voice cloning |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` | Live stock video search |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob CDN storage for masters |
| `FFMPEG_PATH` | Explicit FFmpeg binary override |

## API Surface

| Route | Method | Description |
| --- | --- | --- |
| `/api/projects` | `GET` / `POST` | List projects / draft one from a brief |
| `/api/projects/[id]` | `GET` / `PATCH` / `DELETE` | Read, autosave, or delete a project |
| `/api/projects/[id]/script` | `POST` | Redraft all scenes from the brief |
| `/api/projects/[id]/scenes/[sceneId]` | `PATCH` / `POST` | Update or rewrite one scene |
| `/api/projects/[id]/render` | `GET` / `POST` | Poll encode progress / start FFmpeg render |
| `/api/projects/[id]/command` | `POST` | Natural-language edit ("switch to 9:16") |
| `/api/projects/[id]/dub` | `GET` / `POST` | Dub targets / dub into a language |
| `/api/media/search` | `GET` | Search stock footage (`?q=&limit=`) |
| `/api/imagen` | `GET` / `POST` | Image provider status / generate a still |
| `/api/brand-kits` | `GET` / `POST` | List / create brand kits |
| `/api/brand-kits/[id]` | `GET` / `PATCH` / `DELETE` | Manage one kit |
| `/api/brand-kits/[id]/logo` | `POST` / `DELETE` | Upload / remove a logo |
| `/api/voices` | `GET` | Presenters, cloned voices & provider status |
| `/api/voices/clone` | `POST` | Create a cloned voice or voice preset |
| `/api/voices/clone/[id]` | `DELETE` | Remove a cloned voice |
| `/api/tts/preview` | `POST` | Synthesize a voice audition clip |
| `/api/files/[...file]` | `GET` | Byte-range media streaming |

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FReclaimed-Artistry%2FAi-video-generator&env=DATABASE_URL&project-name=reclaimed-artistry)

- **`vercel.json`** enables Fluid Compute with `maxDuration: 300` on the render
  route.
- **`after()` (`next/server`)** runs FFmpeg encoding after returning HTTP 202.
- **Zero-migration Postgres bootstrap** creates `projects`, `project_assets`
  and `brand_kits` tables on first connection (accepts `DATABASE_URL`,
  `POSTGRES_URL`, or `POSTGRES_PRISMA_URL` with automatic cloud TLS).
- **Bundled DejaVu TrueType fonts** (`src/assets/fonts`) plus a generated
  `/tmp` fontconfig so `libass` burned-in captions work on a bare Linux runtime.
- **Three-tier deliverable storage**: Vercel Blob for global CDN playback when
  attached, falling back to Postgres `project_assets` with byte-range
  streaming, falling back to the local `storage/` directory.
- **Trimmed serverless bundles** — `next.config.ts` excludes `ffprobe-static`,
  skips the `storage/` and `.pglite/` data directories, and scopes FFmpeg
  tracing strictly to the render route.

1. Import the repository in [Vercel](https://vercel.com/new).
2. Attach a Postgres database (Neon, Supabase, or Vercel Postgres) to inject
   `DATABASE_URL`.
3. *(Recommended)* Attach Vercel Blob so masters stream from the CDN.
4. *(Optional)* Add `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`.
### Verify the LLM actually works
```bash
curl -s localhost:3000/api/verify-llm | jq
```
Sends one real script request through the exact production code path and reports the
provider, model, HTTP status, `finish_reason`, scene count and first line of narration.
`ok: true` means script drafting is genuinely live; `ok: false` prints the provider's own
error. Returns 404 in production unless `ENABLE_LLM_PROBE=1`.

5. Deploy.

## Deploy on Railway (Docker + PostgreSQL)

This repository ships a `Dockerfile`, `railway.json`, and
`scripts/docker-entrypoint.sh` (installs `fontconfig` + DejaVu fonts for
`libass` captions).

1. In [Railway](https://railway.app), choose **New Project → Deploy from GitHub
   repo**.
2. Add a PostgreSQL service.
3. Set `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `STORAGE_DIR=/app/storage`.
4. Mount a persistent volume at `/app/storage` so rendered masters survive
   redeploys.
5. Click **Generate Domain**.

## Local development with Docker

```bash
cp .env.example .env
docker compose up --build
```

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```
