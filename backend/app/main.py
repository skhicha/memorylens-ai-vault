from __future__ import annotations

import os

from dotenv import load_dotenv

# Load backend/.env (if present) before anything reads os.environ.
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import ask, dashboard, media, search

app = FastAPI(
    title="MemoryLens AI",
    description="Personal AI media vault: upload photos/videos, auto-process "
    "(faces, transcripts, EXIF/GPS, tags), browse a timeline/map, full-text "
    "search, and chat with a retrieval-augmented Ask AI assistant.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(media.router)
app.include_router(search.router)
app.include_router(ask.router)
app.include_router(dashboard.router)
