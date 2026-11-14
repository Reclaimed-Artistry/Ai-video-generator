# Reclaimed Artistry — Prompt-to-Picture Assembly & H.264 Master Desk

Write a plain-English production brief, inspect and edit every spoken cue and
lower-third super in the three-pane NLE Cut Desk, audition 24kHz neural
voiceover, swap licensed moving B-roll from Pexels and Pixabay, and render a
finished H.264/AAC MP4 master at **240p, 360p, or 1080p**.

## Highlights

- **Beat-structured script desk** — turns rough prompts into timed narration
  cues, burned-in lower-third supers, and shot queries. Uses OpenAI when
  `OPENAI_API_KEY` is configured, with a built-in deterministic script engine
  out of the box.
- **Three-pane NLE Cut Desk** — scene rundown with live word/runtime math,
  aspect-aware Program Monitor (`16:9`, `9:16`, `1:1`) with `Storyboard Gate` vs
  `Master MP4` switching and broadcast safe-title guides, proportional timeline
  filmstrip, and non-clobbering PostgreSQL autosave.
- **24kHz neural voice booth** — 14 Microsoft Edge neural personas across
  American, British, and Australian accents in 10 languages, normalized to
  `-16 LUFS` (EBU R128). Optional `ELEVENLABS_API_KEY` or `OPENAI_API_KEY`
  upgrades, plus offline `mespeak` fallback.
- **Moving footage only** — every scene resolves to verified multi-rendition
  video clips (never static slideshows). Ships with 40 verified Pexels video
  clips out of the box and queries live Pexels (`PEXELS_API_KEY`) and Pixabay
  Video (`PIXABAY_API_KEY`) pools when keys are set.
- **Server-side FFmpeg master** — `libx264` High profile, `libass` vector
  caption burn-in across 5 caption styles, `loudnorm` stereo AAC-LC audio, and
  HTTP Range streaming for scrubbing and download.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Drizzle ORM ·
PostgreSQL · FFmpeg (`ffmpeg-static`) · `@andresaya/edge-tts` · `lucide-react`.

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
| `/api/media/search` | `GET` | Search moving video footage (`?q=&provider=all\|pexels\|pixabay`) |
| `/api/voices` | `GET` | Neural voice talent list & active provider status |
| `/api/tts/preview` | `POST` | Synthesize live voice audition audio |
| `/api/files/[...file]` | `GET` | Byte-range MP4 & poster streaming |

## Deploy on Vercel (One-Click or GitHub Import)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FReclaimed-Artistry%2FAi-video-generator&env=DATABASE_URL&project-name=reclaimed-artistry)

Reclaimed Artistry is configured out of the box for **Vercel Fluid Compute**:
- **`vercel.json`** enables Fluid Compute (`maxDuration: 300` on `/api/projects/[id]/render`, compatible with both Hobby & Pro).
- **`after()` (`next/server`)** runs FFmpeg video encoding cleanly after returning HTTP 202.
- **Zero-migration Postgres bootstrap** automatically creates `projects` and `project_assets` tables on first connection (supports `DATABASE_URL`, `POSTGRES_URL`, or `POSTGRES_PRISMA_URL` with automatic cloud TLS).
- **Bundled DejaVu TrueType fonts** (`src/assets/fonts`) + `/tmp` fontconfig so `libass` burned-in captions work on Vercel's bare Linux runtime.
- **Three-tier deliverable storage**: uses **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) for global CDN playback when attached, and automatically falls back to PostgreSQL `project_assets` with byte-range streaming if you only attach a Postgres database.
- **Trimmed serverless bundles** (`next.config.ts` excludes `ffprobe-static` and scopes `ffmpeg-static` strictly to the render route so every function stays well under Vercel's 250 MB unzipped limit).

### Vercel Setup Steps
1. Import **`Reclaimed-Artistry/Ai-video-generator`** in [Vercel](https://vercel.com/new).
2. Attach a PostgreSQL database via the **Storage** tab (e.g. **Neon Serverless Postgres** or **Supabase** — automatically injects `DATABASE_URL` / `POSTGRES_URL`).
3. *(Recommended for 1080p MP4 streaming)* Attach **Vercel Blob** in the **Storage** tab (automatically injects `BLOB_READ_WRITE_TOKEN`).
4. *(Optional)* Add `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `OPENAI_API_KEY`, or `ELEVENLABS_API_KEY` in **Settings → Environment Variables**.
5. Click **Deploy**.

## Deploy on Railway (Docker + PostgreSQL)

This repository includes `Dockerfile`, `railway.json`, and `scripts/docker-entrypoint.sh`
(which installs `fontconfig` + DejaVu fonts for `libass` captions and runs `drizzle-kit push` on startup):

1. In [Railway](https://railway.app), click **New Project → Deploy from GitHub repo** and select this repository.
2. Add a PostgreSQL service (**+ New → Database → Add PostgreSQL**).
3. In the web service **Variables** tab, add:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `STORAGE_DIR=/app/storage`
   - Optional: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`
4. In **Settings → Volumes**, mount a persistent volume at `/app/storage` so rendered MP4 masters persist across redeploys.
5. In **Settings → Networking**, click **Generate Domain**.

## Local Development with Docker

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
