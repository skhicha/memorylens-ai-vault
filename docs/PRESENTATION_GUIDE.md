# MemoryLens AI — Presentation Guide

## Elevator pitch

"MemoryLens AI is a personal media vault: you drop in your own photos and
videos, and it automatically detects faces, transcribes speech, pulls GPS
and camera metadata, and tags everything — then lets you browse it on a
timeline, on a map, search it full-text, or just ask it questions in plain
English and get answers with clickable citations back to the exact photo or
timestamp they came from. Everything runs locally on my laptop, no GPU, no
Docker, no cloud dependency unless I explicitly opt into a real LLM for the
chat assistant."

## Why this project

During my internship I worked on a video-forensics platform with a similar
shape — FastAPI backend, React/TypeScript frontend, OpenCV/YOLO computer
vision, WhisperX transcription, full-text search, and a RAG "Ask AI"
feature with citations. That codebase is confidential, so for this capstone
I rebuilt the same *concepts* from scratch, end to end, in a smaller, fully
local personal-media domain I could show without restriction. Nothing here
is copied from the internship code — it's the same engineering ideas,
re-implemented and re-sized for a solo laptop project.

## Architecture overview

```
 ┌─────────────────────┐        HTTP (JSON + multipart)       ┌──────────────────────────┐
 │  React + TS frontend │ ───────────────────────────────────▶ │   FastAPI backend (:8000) │
 │  (Vite, :5173)       │ ◀─────────────────────────────────── │                           │
 └─────────────────────┘                                       │  routers/                 │
                                                                 │   media.py  search.py     │
                                                                 │   ask.py    dashboard.py  │
                                                                 │                           │
                                                                 │  services/                │
                                                                 │   pipeline.py (thread per │
                                                                 │     upload: EXIF, faces,  │
                                                                 │     keyframes, ASR, tags) │
                                                                 │   vision.py  exif.py      │
                                                                 │   asr.py     search.py    │
                                                                 │   ask_ai.py  (RAG)        │
                                                                 └─────────────┬─────────────┘
                                                                               │
                                                                 ┌─────────────▼─────────────┐
                                                                 │  SQLite (+ FTS5 index)     │
                                                                 │  data/uploads, thumbnails, │
                                                                 │  keyframes on local disk   │
                                                                 └────────────────────────────┘
```

Upload flow: the frontend posts a file → backend saves it, inserts a
`pending` row, returns immediately, and kicks off a background thread →
frontend polls `/api/media/{id}` until status is `ready`/`failed` → the
pipeline writes faces/transcript/tags into SQLite and updates FTS5 along the
way.

Ask AI flow: question → FTS5 retrieval over filenames/tags/transcripts →
build numbered citations → pluggable generation step (`mock` template or
real Claude call) → answer + citation chips returned to the chat UI.

## Tech stack mapping (capstone tech → internship concept it mirrors)

| MemoryLens AI tech | Mirrors from the internship project | Why chosen for this capstone |
|---|---|---|
| FastAPI + Pydantic | Same FastAPI backend architecture | Directly reusable skill, async-friendly, auto `/docs` |
| SQLite + stdlib `sqlite3` + FTS5 | Postgres + full-text search | Zero extra service to install/run; FTS5 gives real full-text search without a server |
| OpenCV Haar cascade face detection | OpenCV/YOLO face & object detection | No model download, no GPU, runs instantly on a CPU laptop; honestly labelled as classical CV, not "AI face recognition" |
| faster-whisper ("tiny", CPU, int8) | WhisperX ASR pipeline | Same underlying Whisper model family, CTranslate2 backend makes CPU transcription practical on an M1 Air |
| Pillow EXIF extraction | EXIF/geolocation extraction | Same technique (reading embedded metadata), much smaller surface area |
| `ffprobe` subprocess (OpenCV fallback) | Video metadata extraction | Same approach (shell out to ffprobe); fallback keeps the app working even with no ffmpeg installed |
| FTS5 retrieval + pluggable LLM (`mock`/`anthropic`) | RAG "Ask AI" with citations | Same retrieval-then-generate pattern and citation discipline, with an offline mode so grading/demo never depends on an API key |
| React 18 + TypeScript + Vite | React/TS frontend | Same framework and language; Vite instead of the original build tool for faster local iteration |
| Recharts | recharts dashboards | Identical library — same charts-from-data skill, smaller dataset |
| Leaflet + react-leaflet | Map/geolocation UI | Lightweight, no API key needed (OpenStreetMap tiles), unlike some commercial map SDKs |
| Threaded background pipeline | Background job processing | A plain daemon thread per upload stands in for a task queue — appropriate at personal-vault scale, keeps Docker/Redis out of the picture |

## Screen-by-screen walkthrough script

1. **Upload** — "I drag in a couple of photos and a short video. Each one
   shows a progress bar, then the status flips from pending to processing
   to ready as the backend works through it in the background — I'm not
   blocked waiting on a request."
2. **Library** — "Here's everything in the vault as a grid. I can filter by
   type, by an auto-generated tag like `has-faces` or `likely outdoor`, or
   by date range." Click a card to open detail.
3. **Media detail** — "This is a photo with face boxes drawn over it from
   Haar-cascade detection, the EXIF panel on the right shows camera model
   and GPS if present, and if there's GPS data there's a little embedded
   map." Then open a video item: "Here's the transcript with timestamps —
   clicking a line seeks the video to that moment, and these are the
   keyframes it pulled every two seconds with face boxes already drawn in."
4. **Timeline** — "Same library, but grouped by the day each item was
   added, like a camera roll."
5. **Map** — "Every geotagged photo plotted on OpenStreetMap; clicking a
   pin's popup jumps straight to that item's detail page."
6. **Search** — "Full-text search across filenames, tags, and transcripts,
   powered by SQLite's FTS5 — searching for a word someone said in a video
   finds that exact segment with the timestamp and a highlighted snippet."
7. **Ask AI** — "I can ask a natural-language question. It retrieves the
   matching citations through the same FTS5 index, then answers — right
   now it's in offline/mock mode so the answer is template-based and
   clearly labelled as such, and every citation chip is clickable and
   jumps to the real media item. Flipping `LLM_PROVIDER` to `anthropic` in
   the backend `.env` swaps this for a real Claude-generated answer over
   the same citations, still never inventing anything outside them."
8. **Dashboard** — "Recharts visualizations: uploads over time, the
   photo/video split, a tag-distribution bar chart, total faces detected,
   and a map hotspot summary."
9. **Settings** — "Theme toggle persisted in localStorage, which LLM
   provider is currently active, and a re-index button that rebuilds the
   FTS5 index from scratch if I ever need to."

## Anticipated professor Q&A

**Q: Why SQLite instead of Postgres, if the internship used Postgres?**
A: At the scale of one person's media vault, SQLite's FTS5 gives the same
full-text search capability without running a separate database server —
simpler to set up and grade, same indexing concept.

**Q: Is the face detection actually AI / deep learning?**
A: No — it's OpenCV's classical Haar-cascade detector, which ships with
OpenCV and needs no model download or GPU. It finds face-shaped regions; it
doesn't recognize identity or use a neural network. I was deliberate about
not overstating this in the UI.

**Q: What happens if the Whisper model can't download (no internet)?**
A: The ASR step is wrapped in a try/except; if the model fails to load or
transcription throws for any reason, that one step is marked `skipped` in
the database and the rest of the pipeline (metadata, keyframes, tags,
indexing) still completes. A failed ASR step never fails the whole upload.

**Q: How does "Ask AI" avoid hallucinating?**
A: Retrieval happens first and is always grounded in the user's own FTS5
index — it only ever sees real filenames/tags/transcript text as context.
The mock provider is purely extractive: it just echoes the top citations
back with a label. The real Claude provider is instructed via system prompt
to answer only from the provided numbered context and to say so plainly
when the context doesn't contain an answer, and it still returns the same
citation objects either way so the UI can show exactly what it drew from.

**Q: Why no Docker here if the internship project used it?**
A: The whole point of this capstone was a MacBook-Air-friendly, zero-setup
demo — a single Python venv and `npm install`, no containers, no GPU. It
was a deliberate scope decision, not a limitation of the concepts.

**Q: What would you change for a multi-user, production version?**
A: Swap SQLite for Postgres with a proper connection pool, move the
background pipeline to a real task queue (Celery/RQ) instead of per-upload
threads, add auth and per-user storage isolation, and move face/object
detection to a trained model instead of Haar cascades.

## Honest scope note

This is a practice project built for a capstone presentation, reusing the
engineering concepts from a confidential internship codebase in a new,
smaller, from-scratch domain (personal media vault instead of video
forensics). It is not, and does not contain, any code, data, or assets from
that internship project.
