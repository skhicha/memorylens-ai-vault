"""
JWT auth helpers: password hashing, token issuance/verification, and the
get_current_user FastAPI dependency used by every protected router.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.db import db_cursor

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60
REFRESH_TOKEN_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _create_token(user_id: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, "access", timedelta(minutes=ACCESS_TOKEN_MINUTES))


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, "refresh", timedelta(days=REFRESH_TOKEN_DAYS))


def decode_token(token: str, expected_type: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload.get("type") != expected_type:
        raise HTTPException(401, "Invalid token type")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, "Invalid token")
    return sub


class CurrentUser:
    def __init__(self, id: str, email: str, display_name: str):
        self.id = id
        self.email = email
        self.display_name = display_name


def get_user_by_id(user_id: str) -> Optional[CurrentUser]:
    with db_cursor() as cur:
        cur.execute("SELECT id, email, display_name FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
    if not row:
        return None
    return CurrentUser(id=row["id"], email=row["email"], display_name=row["display_name"])


def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token, "access")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


def get_refresh_user_id(refresh_token: Optional[str] = Cookie(None)) -> str:
    if not refresh_token:
        raise HTTPException(401, "Missing refresh token")
    return decode_token(refresh_token, "refresh")
