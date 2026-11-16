"""
Admin-only endpoints: user management and simple aggregate stats.
Every route here is gated by app.auth.require_admin.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import CurrentUser, require_admin
from app.db import db_cursor

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminUserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: str
    media_count: int


class AdminUsersResponse(BaseModel):
    users: list[AdminUserOut]


class AdminStatsResponse(BaseModel):
    total_users: int
    total_media: int
    total_admins: int


class SetRoleRequest(BaseModel):
    role: Literal["admin", "editor", "viewer"]


@router.get("/users", response_model=AdminUsersResponse)
def list_users(_: CurrentUser = Depends(require_admin)) -> AdminUsersResponse:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.email_verified, u.created_at,
                   (SELECT COUNT(*) FROM media m WHERE m.user_id = u.id) AS media_count
            FROM users u
            ORDER BY u.created_at ASC
            """
        )
        rows = cur.fetchall()
    return AdminUsersResponse(
        users=[
            AdminUserOut(
                id=row["id"],
                email=row["email"],
                display_name=row["display_name"],
                role=row["role"] or "editor",
                is_active=bool(row["is_active"]),
                email_verified=bool(row["email_verified"]),
                created_at=row["created_at"],
                media_count=row["media_count"],
            )
            for row in rows
        ]
    )


@router.get("/stats", response_model=AdminStatsResponse)
def stats(_: CurrentUser = Depends(require_admin)) -> AdminStatsResponse:
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM users")
        total_users = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM media")
        total_media = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
        total_admins = cur.fetchone()["n"]
    return AdminStatsResponse(total_users=total_users, total_media=total_media, total_admins=total_admins)


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: str, current_user: CurrentUser = Depends(require_admin)) -> dict:
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot deactivate your own account")
    with db_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "User not found")
        cur.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
    return {"ok": True}


@router.post("/users/{user_id}/reactivate")
def reactivate_user(user_id: str, current_user: CurrentUser = Depends(require_admin)) -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "User not found")
        cur.execute("UPDATE users SET is_active = 1 WHERE id = ?", (user_id,))
    return {"ok": True}


@router.post("/users/{user_id}/role")
def set_role(user_id: str, req: SetRoleRequest, current_user: CurrentUser = Depends(require_admin)) -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "User not found")

        if row["role"] == "admin" and req.role != "admin":
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
            if cur.fetchone()["n"] <= 1:
                raise HTTPException(400, "At least one admin must remain")

        cur.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, user_id))
    return {"ok": True}
