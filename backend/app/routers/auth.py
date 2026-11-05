import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import (
    CurrentUser,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_refresh_user_id,
    get_user_by_id,
    hash_password,
    verify_password,
)
from app.db import db_cursor

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days, matches auth.REFRESH_TOKEN_DAYS

PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not PASSWORD_RE.match(v):
            raise ValueError("Password must be at least 8 characters and include a letter and a number")
        return v

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Display name is required")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/",
    )


@router.post("/register", response_model=AuthResponse)
@limiter.limit("5/minute")
def register(req: RegisterRequest, request: Request, response: Response) -> AuthResponse:
    with db_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        if cur.fetchone():
            raise HTTPException(400, "An account with this email already exists")
        user_id = uuid.uuid4().hex
        cur.execute(
            "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
            (user_id, req.email, hash_password(req.password), req.display_name),
        )

    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    _set_refresh_cookie(response, refresh)
    return AuthResponse(access_token=access, user=UserOut(id=user_id, email=req.email, display_name=req.display_name))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(req: LoginRequest, request: Request, response: Response) -> AuthResponse:
    with db_cursor() as cur:
        cur.execute("SELECT id, email, password_hash, display_name FROM users WHERE email = ?", (req.email,))
        row = cur.fetchone()
    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    access = create_access_token(row["id"])
    refresh = create_refresh_token(row["id"])
    _set_refresh_cookie(response, refresh)
    return AuthResponse(
        access_token=access,
        user=UserOut(id=row["id"], email=row["email"], display_name=row["display_name"]),
    )


@router.post("/refresh", response_model=AuthResponse)
def refresh(response: Response, user_id: str = Depends(get_refresh_user_id)) -> AuthResponse:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    access = create_access_token(user.id)
    new_refresh = create_refresh_token(user.id)
    _set_refresh_cookie(response, new_refresh)
    return AuthResponse(
        access_token=access,
        user=UserOut(id=user.id, email=user.email, display_name=user.display_name),
    )


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser = Depends(get_current_user)) -> UserOut:
    return UserOut(id=current_user.id, email=current_user.email, display_name=current_user.display_name)
