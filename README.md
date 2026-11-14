# Cutline — Prompt-to-Picture Assembly & H.264 Master Desk

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

## API Surface

| Route | Method | Description |
| --- | --- | --- |
| `/api/projects` | `GET` / `POST` | List sequences / draft sequence from brief |
| `/api/projects/[id]` | `GET` / `PATCH` / `DELETE` | Read, autosave, or delete sequence & disk files |
| `/api/projects/[id]/script` | `POST` | Redraft all cues from project brief |
| `/api/projects/[id]/scenes/[sceneId]` | `PATCH` / `POST` | Update or rewrite an individual cue |
| `/api/projects/[id]/render` | `GET` / `POST` | Poll encode progress / start FFmpeg render |
| `/api/media/search` | `GET` | Search moving video footage (`?q=&provider=all\|pexels\|pixabay`) |
| `/api/voices` | `GET` | Neural voice talent list & active provider status |
| `/api/tts/preview` | `POST` | Synthesize live voice audition audio |
| `/api/files/[...file]` | `GET` | Byte-range MP4 & poster streaming |

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
