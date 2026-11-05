from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.db import UPLOADS_DIR, db_cursor
from app.services.pipeline import PHOTO_EXTS, VIDEO_EXTS, classify_media_type, process_media_async

router = APIRouter(prefix="/api/media", tags=["media"])

ALLOWED_EXTS = PHOTO_EXTS | VIDEO_EXTS


class FaceOut(BaseModel):
    frame_time: float
    x: int
    y: int
    w: int
    h: int
    keyframe_url: Optional[str] = None


class TranscriptOut(BaseModel):
    start_time: float
    end_time: float
    text: str


class MediaOut(BaseModel):
    id: str
    filename: str
    media_type: str
    status: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration_s: Optional[float] = None
    fps: Optional[float] = None
    camera_model: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    taken_at: Optional[str] = None
    created_at: str
    has_faces: bool
    face_count: int
    time_of_day: Optional[str] = None
    outdoor_guess: Optional[str] = None
    asr_status: str
    error: Optional[str] = None
    tags: List[str] = []
    thumb_url: Optional[str] = None


class MediaDetailOut(MediaOut):
    faces: List[FaceOut] = []
    transcript: List[TranscriptOut] = []


def _row_to_media_out(row, tags: List[str]) -> MediaOut:
    return MediaOut(
        id=row["id"],
        filename=row["filename"],
        media_type=row["media_type"],
        status=row["status"],
        width=row["width"],
        height=row["height"],
        duration_s=row["duration_s"],
        fps=row["fps"],
        camera_model=row["camera_model"],
        gps_lat=row["gps_lat"],
        gps_lon=row["gps_lon"],
        taken_at=row["taken_at"],
        created_at=row["created_at"],
        has_faces=bool(row["has_faces"]),
        face_count=row["face_count"],
        time_of_day=row["time_of_day"],
        outdoor_guess=row["outdoor_guess"],
        asr_status=row["asr_status"],
        error=row["error"],
        tags=tags,
        thumb_url=f"/api/media/{row['id']}/thumbnail" if row["thumb_path"] else None,
    )


@router.post("/upload", response_model=MediaOut)
async def upload_media(file: UploadFile = File(...)) -> MediaOut:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTS)}")

    media_id = uuid.uuid4().hex[:16]
    media_type = classify_media_type(file.filename or "")
    dest_path = UPLOADS_DIR / f"{media_id}{ext}"

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    size_bytes = dest_path.stat().st_size

    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO media (id, filename, media_type, status, file_path, mime_type, size_bytes)
            VALUES (?, ?, ?, 'pending', ?, ?, ?)
            """,
            (media_id, file.filename, media_type, str(dest_path), file.content_type, size_bytes),
        )
        cur.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        row = cur.fetchone()

    process_media_async(media_id, str(dest_path), media_type)
    return _row_to_media_out(row, [])


@router.get("", response_model=List[MediaOut])
def list_media(
    media_type: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
) -> List[MediaOut]:
    clauses = []
    params: list = []
    if media_type:
        clauses.append("media_type = ?")
        params.append(media_type)
    if date_from:
        clauses.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("created_at <= ?")
        params.append(date_to)
    if tag:
        clauses.append("id IN (SELECT media_id FROM tags WHERE tag = ?)")
        params.append(tag)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with db_cursor() as cur:
        cur.execute(f"SELECT * FROM media {where} ORDER BY created_at DESC", params)
        rows = cur.fetchall()
        out = []
        for row in rows:
            cur.execute("SELECT tag FROM tags WHERE media_id = ?", (row["id"],))
            tags = [r["tag"] for r in cur.fetchall()]
            out.append(_row_to_media_out(row, tags))
    return out


@router.get("/{media_id}", response_model=MediaDetailOut)
def get_media(media_id: str) -> MediaDetailOut:
    with db_cursor() as cur:
        cur.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Media not found")
        cur.execute("SELECT tag FROM tags WHERE media_id = ?", (media_id,))
        tags = [r["tag"] for r in cur.fetchall()]
        cur.execute(
            "SELECT frame_time, x, y, w, h, keyframe_path FROM faces WHERE media_id = ? ORDER BY frame_time",
            (media_id,),
        )
        faces = []
        for r in cur.fetchall():
            d = dict(r)
            kf_path = d.pop("keyframe_path", None)
            d["keyframe_url"] = f"/api/media/keyframe/{Path(kf_path).name}" if kf_path else None
            faces.append(FaceOut(**d))
        cur.execute(
            "SELECT start_time, end_time, text FROM transcript_segments WHERE media_id = ? ORDER BY start_time",
            (media_id,),
        )
        transcript = [TranscriptOut(**dict(r)) for r in cur.fetchall()]

    base = _row_to_media_out(row, tags)
    return MediaDetailOut(**base.model_dump(), faces=faces, transcript=transcript)


@router.delete("/{media_id}")
def delete_media(media_id: str) -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT file_path, thumb_path FROM media WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Media not found")
        cur.execute("DELETE FROM search_index WHERE media_id = ?", (media_id,))
        cur.execute("DELETE FROM media WHERE id = ?", (media_id,))
    for p in (row["file_path"], row["thumb_path"]):
        if p and Path(p).exists():
            Path(p).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/{media_id}/file")
def get_media_file(media_id: str):
    with db_cursor() as cur:
        cur.execute("SELECT file_path, mime_type FROM media WHERE id = ?", (media_id,))
        row = cur.fetchone()
    if not row or not Path(row["file_path"]).exists():
        raise HTTPException(404, "File not found")
    return FileResponse(row["file_path"], media_type=row["mime_type"] or None)


@router.get("/{media_id}/thumbnail")
def get_media_thumbnail(media_id: str):
    with db_cursor() as cur:
        cur.execute("SELECT thumb_path FROM media WHERE id = ?", (media_id,))
        row = cur.fetchone()
    if not row or not row["thumb_path"] or not Path(row["thumb_path"]).exists():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(row["thumb_path"], media_type="image/jpeg")


@router.get("/keyframe/{filename}")
def get_keyframe(filename: str):
    from app.db import KEYFRAMES_DIR

    path = KEYFRAMES_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Keyframe not found")
    return FileResponse(path, media_type="image/jpeg")
