# Cutline — Prompt-to-Picture Assembly & H.264 Master Desk

Write a plain-English production brief, edit every spoken cue and lower-third
caption in a three-pane cut desk, audition 24kHz neural voiceover, swap
licensed moving B-roll from Pexels and Pixabay, and render a finished
H.264/AAC MP4 at **240p, 360p, or 1080p**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FReclaimed-Artistry%2FAi-video-generator&project-name=cutline-studio&repository-name=cutline-studio&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)

---

## Deploy to Vercel

The app runs on Vercel with two storage add-ons, both available on the free
Hobby plan:

| Add-on | Why it is needed | Env var it sets |
| --- | --- | --- |
| **Neon Postgres** | Stores projects, scripts and render status | `DATABASE_URL` (also `POSTGRES_URL`) |
| **Vercel Blob (Public)** | Vercel's disk is temporary, so finished MP4s and posters are kept here | `BLOB_READ_WRITE_TOKEN` |

No migration step is needed: the `projects` table is created automatically on
the first request.

### Option A — Import this repository (you own the repo)

1. Go to **[vercel.com/new](https://vercel.com/new)** → **Import Git Repository**
   → pick `Reclaimed-Artistry/Ai-video-generator`. The Next.js preset and
   `vercel.json` are detected automatically; keep the default build settings.
2. Click **Deploy**. The first deploy builds fine without storage attached.
3. In the new project open **Storage**:
   - **Create Database → Neon (Postgres)** → *Connect* to the project.
   - **Create → Blob** → choose **Public** access → *Connect* to the project.
4. **Deployments → ⋯ → Redeploy** so the new environment variables are picked up.
5. Open `https://<your-project>.vercel.app/api/health`. You should see
   `"ok": true`, `"databaseConfigured": true`, `"blobStorage": true`.

### Option B — One-click button (creates a copy in your GitHub)

Use the **Deploy with Vercel** button above. It clones the repo into your
account and offers to create the Neon database and a public Blob store in the
same flow.

### Optional environment variables

Add these under **Settings → Environment Variables**, then redeploy:
`PEXELS_API_KEY`, `PIXABAY_API_KEY` (live stock search), `OPENAI_API_KEY`
(LLM scripts + voices), `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`
(premium voices). Everything works without them.

### How it works on Vercel (and the limits)

- **Render time:** encodes run in the render function for up to **300 seconds**
  (the Hobby maximum with Fluid compute, enabled in `vercel.json`). A 30–45s
  video at 240p/360p takes well under that; long 1080p videos can run out of time.
  If a render is cut off, the studio shows a clear "timed out" message — retry
  at a lower resolution or with fewer scenes. Pro plans can raise
  `maxDuration` in `src/app/api/projects/[id]/render/route.ts` to 800.
- **FFmpeg & fonts:** the static FFmpeg binary and the bundled DejaVu caption
  fonts (`assets/fonts`) are packaged into the render function via
  `outputFileTracingIncludes` in `next.config.ts` (~88 MB, under Vercel's 250 MB limit).
- **Storage:** renders are assembled in `/tmp`, uploaded to Blob, and served
  through `/api/files/...`, which redirects to the Blob URL.
- **Hobby plan** is for personal, non-commercial use. Use Pro for commercial projects.

---

## Other hosting options

- **Docker** (`Dockerfile`): Railway, Fly.io, Coolify or any VPS. Runs
  `drizzle-kit push` on boot and keeps renders on a `STORAGE_DIR` volume.
- **Render.com:** `render.yaml` Blueprint (Postgres + persistent disk).
- **docker compose up --build:** full stack locally or in GitHub Codespaces.

## Local development

```bash
cp .env.example .env      # set DATABASE_URL
npm install
npm run dev               # http://localhost:3000
```

## Highlights

- **Beat-structured script desk**: prompts become timed narration cues, captions
  and shot queries (OpenAI if configured, built-in engine otherwise).
- **Three-pane cut desk**: scene rundown, aspect-true program monitor
  (16:9 / 9:16 / 1:1) with safe-title guides, timeline strip and autosave.
- **Neural voice booth**: 14 Microsoft Edge neural voices (US / UK / AU),
  10 languages, loudness-normalised to -16 LUFS.
- **Moving footage only**: every scene uses a real video clip from the bundled
  Pexels pool or live Pexels / Pixabay search.
- **FFmpeg masters**: libx264 High, libass captions in 5 styles, AAC audio,
  fast-start MP4 with range-request streaming.

## API

| Route | Method | Description |
| --- | --- | --- |
| `/api/health` | `GET` | Liveness + database / Blob configuration report |
| `/api/projects` | `GET` / `POST` | List projects / create from a brief |
| `/api/projects/[id]` | `GET` / `PATCH` / `DELETE` | Read, autosave, delete (incl. stored files) |
| `/api/projects/[id]/script` | `POST` | Regenerate all scenes |
| `/api/projects/[id]/scenes/[sceneId]` | `PATCH` / `POST` | Edit / rewrite one scene |
| `/api/projects/[id]/render` | `GET` / `POST` | Render status / start a render |
| `/api/media/search` | `GET` | Stock video search (`?q=&provider=all\|pexels\|pixabay`) |
| `/api/voices` | `GET` | Voice list and active providers |
| `/api/tts/preview` | `POST` | Voice preview audio |
| `/api/files/[...file]` | `GET` | Video/poster streaming (redirects to Blob on Vercel) |

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Drizzle ORM ·
PostgreSQL · FFmpeg (`ffmpeg-static`) · Vercel Blob · `@andresaya/edge-tts`.
