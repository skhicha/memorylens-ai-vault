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
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'verify_email', 'password_reset')),
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_user ON otp_codes(user_id);

-- One-time recovery codes for authenticator-app MFA, generated once when
-- MFA is enabled and shown to the user a single time.
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user ON mfa_backup_codes(user_id);

CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
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
    error TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0
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


# Columns added to `users` after its initial release. SQLite has no
# "ADD COLUMN IF NOT EXISTS", so each migration is applied with ALTER TABLE
# and the resulting "duplicate column" error (raised on a database that
# already has the column) is swallowed, keeping init_db() safe to run
# against an existing dev database as well as a brand-new one.
USER_COLUMN_MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN otp_enabled INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'",
    "ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1",
    # Google SSO: nullable, set only for accounts created/linked via
    # "Sign in with Google". A password_hash still exists for these rows
    # (a random, never-typeable value) since the column is NOT NULL --
    # such an account simply can't log in with a password unless it later
    # goes through the normal forgot-password flow to set a real one.
    "ALTER TABLE users ADD COLUMN google_sub TEXT",
    # Real authenticator-app MFA (TOTP, RFC 6238) -- separate from and in
    # addition to the simpler email-OTP login. totp_secret is only set
    # once setup is confirmed; mfa_enabled gates whether login requires it.
    "ALTER TABLE users ADD COLUMN totp_secret TEXT",
    "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0",
]

MEDIA_COLUMN_MIGRATIONS = [
    "ALTER TABLE media ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
]


def _migrate(conn: sqlite3.Connection) -> None:
    for statement in USER_COLUMN_MIGRATIONS + MEDIA_COLUMN_MIGRATIONS:
        try:
            conn.execute(statement)
        except sqlite3.OperationalError as exc:
            if "duplicate column" not in str(exc).lower():
                raise
    # Run after the ALTER TABLEs above since google_sub doesn't exist until
    # then on a pre-existing database. SQLite unique indexes allow any
    # number of NULLs, so plain members (google_sub IS NULL) are unaffected.
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)")
    conn.commit()


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        _migrate(conn)
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
