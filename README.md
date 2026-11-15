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

## Generative AI

| Feature | Where | What it does |
| --- | --- | --- |
| **AI script writer** | Home page brief | An LLM writes the narration, captions, stock-footage queries and an image prompt for every scene |
| **AI video** | Home page → *Visuals: AI video*, Studio → **AI** tab, or the AI edit box | A real text-to-video clip generated for each scene (Pollinations: Wan, Seedance, Veo, Kling…). Clips are stored once and slowed slightly to fill longer scenes |
| **AI images** | Home page → *Visuals: AI images*, Studio → **AI** tab, or the AI edit box | Text-to-image in 7 looks, animated with a camera move (push-in, pull-out, pan) so every shot moves |
| **Stickman animation** | Home page → *Visuals: Stickman*, Studio → **AI** tab, or “use stickman animation for every scene” | Free, built-in stick-figure animator: 7 performances (talk, wave, point, think, celebrate, walk, shrug) auto-picked from each line, smooth eased motion, blinking, 3 themes, and **lip-sync driven by the real voiceover loudness**. No API key, renders ~4× faster than real time at 1080p |
| **Image-to-video** | Studio → **AI** tab → *Character* | Upload a character (or use an AI image) and animate it with smooth, natural movement |
| **Lip-synced talking characters** | Studio → **AI** tab → *Make it talk*, or “make the character talk” | Synthesises the scene narration in the project voice and generates an audio-driven clip where the character speaks it (default model `alibaba/wan-3.0`) |
| **Viral finishing** | Studio → **Settings** → *Viral finishing* | Story-style progress bar, slow punch-in zoom on video shots, and a synthesised whoosh on every scene change (all on by default for new projects) |
| **3D animation & stick-figure looks** | Studio → **AI** tab → *Look* | Pixar-style 3D animation and stick-figure presets for AI video and images |
| **Ask in plain English** | Studio → AI edit box | “generate a video of waves at dusk for scene 2”, “make an image of a cabin for all scenes”, “create AI videos for every scene” |
| **Generate all scenes** | Studio → **AI** tab | Fills every scene with AI visuals, with progress, auto-retry and cancel |
| **AI rewrite** | Studio → **AI** tab | Rewrites one scene's narration and caption, optionally following a direction ("punchier", "mention the price") |

**Engines** (picked automatically, best first):

- **Text:** `OPENAI_API_KEY` (or any OpenAI-compatible API via `OPENAI_BASE_URL`) → `POLLINATIONS_API_KEY` → free Pollinations tier → built-in script engine.
- **Images:** `POLLINATIONS_API_KEY` (Flux, HD) → `OPENAI_API_KEY` (gpt-image-1) → free Pollinations tier (1024×576).
- **Characters:** image-to-video (`AI_I2V_MODEL`, default `alibaba/wan-2.2-fast`) and lip-sync (`AI_LIPSYNC_MODEL`, default `alibaba/wan-3.0`) use `POLLINATIONS_API_KEY`. The AI service downloads the character image and voice clip from your site, so it must be publicly reachable (deployed with `PUBLIC_APP_URL`, or Vercel Blob connected).
- **Stickman:** built in, free and offline (no key needed).
- **Video:** `POLLINATIONS_API_KEY` (default model `alibaba/wan-2.2-fast`, 5-second clips; change with `AI_VIDEO_MODEL` / `AI_VIDEO_DURATION`). There is **no free text-to-video service**: without a key, “AI video” falls back to a motion shot made from an AI image, and the studio says so. (OpenAI's Sora video API was shut down in September 2026, so it is not used.)

**Free tier:** works with no keys, but is shared and rate-limited (about one request every 45 seconds per server IP, best effort). The studio shows a countdown and retries automatically; if the AI writer is busy, the built-in engine writes the script. For production traffic, add a key.

Generated videos and images are stored once (Vercel Blob → Postgres → local disk → embedded in the project) and stay locked to their scene, so stock auto-matching never replaces them.

## How the AI writer avoids repetition

- **Plan, then write:** the director prompt asks for a fresh angle, one distinct point per scene, a structure that fits the brief (history → timeline, “how to” → steps, lists → one item per scene) and a shot design per scene (shot type, camera move, filmable subject) with one consistent visual style.
- **Banned clichés & accuracy rules:** no “stop scrolling” / “let’s dive in” openers, no parroting the prompt, no invented statistics.
- **Quality gate:** every script is scored for shared phrases, repeated openers, prompt parroting, clichés and duplicate captions/footage searches. With a keyed provider the AI rewrites only the weak scenes; otherwise local fixes are applied. The score is shown in the AI tab.
- **Reliable parsing:** small models’ broken JSON (stray brackets, missing commas) is repaired instead of discarded, and free-tier rate limits are waited out instead of falling back to templates.
- **Built-in engine (no AI available):** several cliché-free wordings per beat chosen per topic, timeline arcs for history briefs, captions from each scene’s own words, and varied filmable shots.

The free tier uses a small model (GPT-OSS 20B) that can still invent facts. For factual or brand content, add `OPENAI_API_KEY` (or any OpenAI-compatible key) or `POLLINATIONS_API_KEY`.

## API Surface

| Route | Method | Description |
| --- | --- | --- |
| `/api/ai/status` | `GET` | Active generative engines (no secrets) |
| `/api/ai/image` | `POST` | Generate and store a scene image (`prompt`, `style`, `aspect`, `seed`, `projectId`) |
| `/api/ai/video` | `POST` | Generate and store a text-to-video clip + poster (409 when no video key is set) |
| `/api/ai/animate` | `POST` | Image-to-video (`mode: "motion"`) or lip-synced talking character (`mode: "lipsync"`) |
| `/api/media/upload` | `POST` | Upload a character / reference image (JPEG, PNG, WebP, max 4 MB) |
| `/api/projects` | `GET` / `POST` | List sequences / draft sequence from brief |
| `/api/projects/[id]` | `GET` / `PATCH` / `DELETE` | Read, autosave, or delete sequence & disk files |
| `/api/projects/[id]/script` | `POST` | Redraft all cues from project brief |
| `/api/projects/[id]/scenes/[sceneId]` | `PATCH` / `POST` | Update or rewrite an individual cue |
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

## Credits & inspiration

The viral-format features were shaped by open-source projects on GitHub:
[kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director) (stickman explainer styles, 3-second hooks, expressions and SFX),
[tamtree-ai/stick-stage](https://github.com/tamtree-ai/stick-stage) and [cherifya/figures](https://github.com/cherifya/figures) (offline, lip-synced stick-figure animation),
and [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (end-to-end short-video pipeline, zoom transitions, subtitle styling).
No code was copied; the stickman engine in `src/lib/stickman.ts` is an original implementation.
