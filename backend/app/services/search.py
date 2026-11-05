"""FTS5-backed full-text search over filenames, tags and transcripts."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from app.db import db_cursor


@dataclass
class SearchHit:
    media_id: str
    source: str  # "filename" | "tag" | "transcript"
    segment_start: Optional[float]
    text: str
    snippet: str


def _fts_escape(q: str) -> str:
    """Builds a safe FTS5 MATCH query: strips characters FTS5's query syntax
    treats specially and ANDs together the remaining tokens with a trailing
    prefix wildcard, so "beach dog" finds rows containing both tokens."""
    tokens = re.findall(r"[A-Za-z0-9_]+", q)
    if not tokens:
        return ""
    return " AND ".join(f'"{t}"*' for t in tokens)


def reindex_media(media_id: str, filename: str, tags: List[str], transcript) -> None:
    """Rebuilds the FTS rows for one media item (filename + tags + transcript segments)."""
    with db_cursor() as cur:
        cur.execute("DELETE FROM search_index WHERE media_id = ?", (media_id,))
        cur.execute(
            "INSERT INTO search_index (media_id, source, segment_start, text) VALUES (?, 'filename', NULL, ?)",
            (media_id, filename),
        )
        for tag in tags:
            cur.execute(
                "INSERT INTO search_index (media_id, source, segment_start, text) VALUES (?, 'tag', NULL, ?)",
                (media_id, tag),
            )
        for seg in transcript or []:
            cur.execute(
                "INSERT INTO search_index (media_id, source, segment_start, text) VALUES (?, 'transcript', ?, ?)",
                (media_id, seg.start, seg.text),
            )


def search(query: str, limit: int = 40) -> List[SearchHit]:
    match = _fts_escape(query)
    if not match:
        return []
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT media_id, source, segment_start, text,
                   snippet(search_index, 3, '<mark>', '</mark>', '…', 12) AS snip
            FROM search_index
            WHERE search_index MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (match, limit),
        )
        rows = cur.fetchall()
    return [
        SearchHit(
            media_id=r["media_id"],
            source=r["source"],
            segment_start=r["segment_start"],
            text=r["text"],
            snippet=r["snip"],
        )
        for r in rows
    ]
