"""
SQLite access layer for MemoryLens AI.

Deliberately not using an ORM: the schema is small enough that raw SQL plus
FTS5 is simpler to reason about, and it keeps the "lighter form" of the
original forensic-suite's Postgres + full-text-search stack honest for a
local, no-Docker capstone project.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
UPLOADS_DIR = DATA_DIR / "uploads"
THUMBS_DIR = DATA_DIR / "thumbnails"
KEYFRAMES_DIR = DATA_DIR / "keyframes"
DB_PATH = DATA_DIR / "memorylens.db"

for d in (DATA_DIR, UPLOADS_DIR, THUMBS_DIR, KEYFRAMES_DIR):
    d.mkdir(parents=True, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
    status TEXT NOT NULL DEFAULT 'pending',
    file_path TEXT NOT NULL,
    thumb_path TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    duration_s REAL,
    fps REAL,
    camera_model TEXT,
    gps_lat REAL,
    gps_lon REAL,
    taken_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    has_faces INTEGER NOT NULL DEFAULT 0,
    face_count INTEGER NOT NULL DEFAULT 0,
    time_of_day TEXT,
    outdoor_guess TEXT,
    asr_status TEXT NOT NULL DEFAULT 'skipped',
    error TEXT
);

CREATE TABLE IF NOT EXISTS faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    frame_time REAL NOT NULL DEFAULT 0,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    w INTEGER NOT NULL,
    h INTEGER NOT NULL,
    keyframe_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_faces_media ON faces(media_id);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcript_media ON transcript_segments(media_id);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    tag TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_media ON tags(media_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique ON tags(media_id, tag);

-- External-content FTS5 index: indexes filename, tags and transcript text
-- for every media item, keyed by media_id so search results can resolve
-- straight back to the media detail page.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    media_id UNINDEXED,
    source UNINDEXED,
    segment_start UNINDEXED,
    text
);
"""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def db_cursor() -> Iterator[sqlite3.Cursor]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    finally:
        conn.close()
