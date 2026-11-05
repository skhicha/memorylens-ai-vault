from __future__ import annotations

import os
from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import db_cursor
from app.services.pipeline import reindex_all

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class UploadsByDay(BaseModel):
    date: str
    count: int


class TypeSplit(BaseModel):
    media_type: str
    count: int


class TagCount(BaseModel):
    tag: str
    count: int


class MapHotspot(BaseModel):
    media_id: str
    filename: str
    lat: float
    lon: float


class DashboardSummary(BaseModel):
    total_media: int
    total_photos: int
    total_videos: int
    total_faces: int
    total_with_gps: int
    uploads_by_day: List[UploadsByDay]
    type_split: List[TypeSplit]
    tag_distribution: List[TagCount]
    map_hotspots: List[MapHotspot]


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary() -> DashboardSummary:
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM media")
        total_media = cur.fetchone()["c"]

        cur.execute("SELECT media_type, COUNT(*) AS c FROM media GROUP BY media_type")
        type_rows = cur.fetchall()
        type_split = [TypeSplit(media_type=r["media_type"], count=r["c"]) for r in type_rows]
        total_photos = next((r["c"] for r in type_rows if r["media_type"] == "photo"), 0)
        total_videos = next((r["c"] for r in type_rows if r["media_type"] == "video"), 0)

        cur.execute("SELECT COALESCE(SUM(face_count), 0) AS c FROM media")
        total_faces = cur.fetchone()["c"]

        cur.execute("SELECT COUNT(*) AS c FROM media WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL")
        total_with_gps = cur.fetchone()["c"]

        cur.execute(
            "SELECT date(created_at) AS d, COUNT(*) AS c FROM media GROUP BY d ORDER BY d"
        )
        uploads_by_day = [UploadsByDay(date=r["d"], count=r["c"]) for r in cur.fetchall()]

        cur.execute(
            "SELECT tag, COUNT(*) AS c FROM tags GROUP BY tag ORDER BY c DESC LIMIT 20"
        )
        tag_distribution = [TagCount(tag=r["tag"], count=r["c"]) for r in cur.fetchall()]

        cur.execute(
            "SELECT id, filename, gps_lat, gps_lon FROM media "
            "WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL"
        )
        map_hotspots = [
            MapHotspot(media_id=r["id"], filename=r["filename"], lat=r["gps_lat"], lon=r["gps_lon"])
            for r in cur.fetchall()
        ]

    return DashboardSummary(
        total_media=total_media,
        total_photos=total_photos,
        total_videos=total_videos,
        total_faces=total_faces,
        total_with_gps=total_with_gps,
        uploads_by_day=uploads_by_day,
        type_split=type_split,
        tag_distribution=tag_distribution,
        map_hotspots=map_hotspots,
    )


class SettingsOut(BaseModel):
    llm_provider: str
    anthropic_key_configured: bool
    whisper_model: str


@router.get("/settings", response_model=SettingsOut)
def get_settings() -> SettingsOut:
    return SettingsOut(
        llm_provider=os.environ.get("LLM_PROVIDER", "mock"),
        anthropic_key_configured=bool(os.environ.get("ANTHROPIC_API_KEY")),
        whisper_model=os.environ.get("WHISPER_MODEL", "tiny"),
    )


class ReindexOut(BaseModel):
    reindexed: int


@router.post("/reindex", response_model=ReindexOut)
def reindex() -> ReindexOut:
    count = reindex_all()
    return ReindexOut(reindexed=count)
