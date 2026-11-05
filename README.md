# MemoryLens AI

A personal AI media vault: upload your own photos and videos, let a small local
pipeline auto-process them (face detection, audio transcription, EXIF/GPS
extraction, auto-tagging), then browse a timeline, see photos on a map,
full-text search everything, and chat with an "Ask AI" assistant that answers
with citations back to your own media.

This is a **practice/capstone project**, built as a lighter, fully local
re-implementation of concepts from a larger video-forensics internship
project (FastAPI + React/TS + OpenCV + ASR + SQL full-text search + RAG). It
is a separate, from-scratch codebase — see `docs/PRESENTATION_GUIDE.md` for
how the two relate and why things were simplified the way they were.

Runs entirely on a laptop. No GPU, no Docker, no cloud account required
(an optional Anthropic API key upgrades the Ask AI assistant from offline
template answers to real generated answers).

## Stack

| Layer | Tech |
|---|---|
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Database | SQLite (stdlib `sqlite3`, no ORM) + FTS5 full-text search |
| Computer vision | OpenCV (Haar cascade face detection, keyframe extraction) |
| Speech-to-text | faster-whisper (CPU, "tiny" model by default) |
| Photo metadata | Pillow EXIF (GPS, timestamp, camera model) |
| Video metadata | `ffprobe` subprocess, falls back to OpenCV if ffmpeg isn't installed |
| Ask AI (RAG) | FTS5 retrieval + pluggable LLM: `mock` (offline, default) or `anthropic` (Claude) |
| Frontend | React 18 + TypeScript + Vite |
| UI | Plain CSS with variables (dark/light theme), Radix UI primitives, lucide-react icons |
| Charts | Recharts |
| Map | Leaflet + react-leaflet |

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, router wiring
    db.py               SQLite schema + connection helpers (FTS5 included)
    services/
      vision.py          Face detection, keyframes, thumbnails, video probing
      asr.py              faster-whisper transcription (graceful fallback)
      exif.py             Pillow EXIF/GPS extraction
      pipeline.py         Background processing orchestration + tagging
      search.py           FTS5 indexing + querying
      ask_ai.py           RAG retrieval + mock/anthropic answer generation
    routers/
      media.py, search.py, ask.py, dashboard.py
  requirements.txt
  .env.example
  run.sh                 venv + install + uvicorn on :8000
frontend/
  src/
    pages/               Upload, Library, MediaDetail, Timeline, MapView,
                          Search, AskAI, Dashboard, Settings
    components/          Navbar, ThemeToggle, MediaCard, FaceBoxOverlay,
                          ChatBubble
    lib/                 api.ts (typed fetch client), theme.ts
  vite.config.ts          dev proxy: /api -> http://localhost:8000
docs/
  PRESENTATION_GUIDE.md   elevator pitch, architecture, walkthrough script, Q&A
```

## Running it locally (two terminals)

### 1. Backend

```bash
cd backend
./run.sh
```

`run.sh` creates a venv (first run only), installs `requirements.txt`, copies
`.env.example` to `.env` if missing, and starts Uvicorn on
**http://localhost:8000**. API docs: http://localhost:8000/docs

Or do it by hand:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies all `/api/*` requests to the
backend on :8000, so no CORS wrangling is needed in dev.

### First run: create an account

MemoryLens AI is multi-user: every item belongs to a signed-in account, and
each account only ever sees its own media. On first run, open
**http://localhost:5173/register** and create an account (email + password +
display name) before uploading anything — you'll be redirected there
automatically if you try to use the app signed out.

## Authentication

- **Registration / login**: `POST /api/auth/register` and `POST
  /api/auth/login` validate the email format and a password policy (min 8
  characters, at least one letter and one digit), hash passwords with
  **bcrypt** (via `passlib`), and never store or log plaintext passwords.
- **Tokens**: on success the API returns a short-lived **JWT access token**
  (60 minutes, HS256, signed with `JWT_SECRET`) in the JSON response body,
  and sets a longer-lived **refresh token** (7 days) as an **httpOnly
  cookie** — JavaScript never touches the refresh token directly, which
  keeps it safe from XSS.
- **Using the API**: the frontend sends `Authorization: Bearer <access
  token>` on every request. When an access token expires, the fetch
  wrapper in `frontend/src/lib/api.ts` transparently calls `POST
  /api/auth/refresh` (which reads the refresh cookie) to get a new
  access/refresh pair, then retries the original request once — the user
  never notices.
- **Logout**: `POST /api/auth/logout` clears the refresh cookie; the
  frontend also drops the in-memory/`localStorage` access token.
- **Data isolation**: every `media`/search/dashboard/ask query is scoped
  to `user_id = <current user>` at the SQL level (see `get_current_user` in
  `backend/app/auth.py`, applied as a FastAPI dependency on every route in
  `media.py`, `search.py`, `ask.py`, and `dashboard.py`) — one account can
  never read another account's uploads, thumbnails, search results, or
  Ask AI citations.
- **Rate limiting**: `/api/auth/login` and `/api/auth/register` are limited
  to 5 requests/minute per IP (via `slowapi`) to blunt brute-force/credential
  stuffing attempts.

## Notes on the processing pipeline

- Uploads are saved immediately and processed in a background thread per
  item (`status`: `pending` → `processing` → `ready`/`failed`). The frontend
  polls `/api/media/{id}` until it settles.
- **Photos**: EXIF (GPS/timestamp/camera) via Pillow, Haar-cascade face
  detection + thumbnail via OpenCV, simple brightness/saturation heuristics
  for "day/night" and "likely indoor/outdoor" tags (explicitly labelled as
  guesses, not claimed ML).
- **Videos**: `ffprobe` (falls back to OpenCV automatically if `ffmpeg`
  isn't installed) for duration/fps/resolution, one keyframe every ~2s with
  face boxes drawn in, and faster-whisper transcription.
- **Whisper / ASR**: the first time a video is processed, faster-whisper
  downloads its model weights from Hugging Face — this needs internet
  access **once**. After that it's cached locally (`~/.cache/huggingface`)
  and works fully offline. If the download fails, or the machine has no
  usable audio track, or anything else goes wrong, the ASR step is marked
  `skipped` and the rest of the pipeline (keyframes, tags, metadata)
  continues normally — a single step failing never fails the whole upload.
- Every processed item (filename + tags + transcript segments) gets
  indexed into a SQLite FTS5 table, which backs both `/api/search` and the
  retrieval step of `/api/ask`.

## Switching Ask AI to real Claude answers

By default `LLM_PROVIDER=mock` in `backend/.env`: the Ask AI assistant
retrieves matching citations via full-text search and builds a plainly
labelled **"[Offline mode / mock provider]"** answer that only repeats what
was actually retrieved — it never fabricates facts.

To get fluent, synthesized answers over the same citations:

```bash
# backend/.env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5   # default, can be changed
```

Restart the backend after editing `.env`. The Settings page shows which
provider is currently active.

## Known simplifications (honest, on purpose)

- Face detection uses OpenCV's classic Haar cascade, not a deep face
  recognizer — it finds faces, it doesn't identify *who* they are.
- "Outdoor"/"time of day" tags are brightness/saturation heuristics, not a
  trained scene classifier. They're labelled as guesses in the UI.
- No background job queue (Celery/Redis/etc.) — a plain daemon thread per
  upload, which is appropriate at personal-vault scale and keeps the setup
  Docker-free.
- SQLite, not Postgres — fine for a single-user local app, and FTS5 gives
  the same full-text search capability without an extra service to run.
- JWT auth is deliberately simple: no refresh-token rotation or blacklist,
  no password-reset/email-verification flow, and no OAuth/SSO — a single
  signed access/refresh token pair is enough to demonstrate real
  authentication and per-user data isolation without building an identity
  platform.
- The dev SQLite database was reset (not migrated) when the `users` table
  and `media.user_id` column were added, since it only ever held
  throwaway local test uploads with no real users attached.
