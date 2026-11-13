import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import (
    CurrentUser,
    create_access_token,
    create_otp_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_refresh_user_id,
    get_user_by_id,
    hash_password,
    verify_password,
)
from app.db import db_cursor
from app.services import mailer, otp

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days, matches auth.REFRESH_TOKEN_DAYS

PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")

OTP_LOGIN_EXPIRE_MINUTES = 10
RESET_EXPIRE_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 30
# otp_token -> last resend time, process-local. Good enough for a capstone;
# a real deployment would key this in a shared store alongside the DB.
_last_resend: dict[str, datetime] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expires_at(minutes: int) -> str:
    return (_now() + timedelta(minutes=minutes)).isoformat()


def _issue_otp_code(user_id: str, purpose: str, minutes: int) -> str:
    code = otp.generate_otp_code()
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)",
            (user_id, otp.hash_code(code), purpose, _expires_at(minutes)),
        )
    return code


def _invalidate_codes(user_id: str, purpose: str) -> None:
    with db_cursor() as cur:
        cur.execute(
            "UPDATE otp_codes SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0",
            (user_id, purpose),
        )


def _verify_and_consume_code(user_id: str, purpose: str, code: str) -> bool:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, code_hash, expires_at FROM otp_codes
            WHERE user_id = ? AND purpose = ? AND used = 0
            ORDER BY id DESC
            """,
            (user_id, purpose),
        )
        rows = cur.fetchall()
        for row in rows:
            if row["expires_at"] < _now().isoformat():
                continue
            if otp.verify_code(code, row["code_hash"]):
                cur.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (row["id"],))
                return True
    return False


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
    role: str = "member"
    email_verified: bool = False
    otp_enabled: bool = False


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class OtpRequiredResponse(BaseModel):
    otp_required: bool = True
    otp_token: str


class OtpVerifyRequest(BaseModel):
    otp_token: str
    code: str


class OtpResendRequest(BaseModel):
    otp_token: str


class VerifyEmailRequest(BaseModel):
    code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if not PASSWORD_RE.match(v):
            raise ValueError("Password must be at least 8 characters and include a letter and a number")
        return v


class UpdateMeRequest(BaseModel):
    otp_enabled: bool


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
        cur.execute("SELECT COUNT(*) AS n FROM users")
        is_first_user = cur.fetchone()["n"] == 0
        role = "admin" if is_first_user else "member"
        cur.execute(
            "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, req.email, hash_password(req.password), req.display_name, role),
        )

    code = _issue_otp_code(user_id, "verify_email", RESET_EXPIRE_MINUTES * 2)
    mailer.send_email(
        req.email,
        "Verify your MemoryLens AI email",
        f"Your verification code is {code}. It expires in {RESET_EXPIRE_MINUTES * 2} minutes.",
    )

    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    _set_refresh_cookie(response, refresh)
    return AuthResponse(
        access_token=access,
        user=UserOut(
            id=user_id, email=req.email, display_name=req.display_name, role=role, email_verified=False, otp_enabled=False
        ),
    )


@router.post("/login", response_model=None)
@limiter.limit("5/minute")
def login(req: LoginRequest, request: Request, response: Response):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, email, password_hash, display_name, otp_enabled, is_active, role, email_verified "
            "FROM users WHERE email = ?",
            (req.email,),
        )
        row = cur.fetchone()
    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    if not row["is_active"]:
        raise HTTPException(403, "Your account has been deactivated. Contact an administrator.")

    if row["otp_enabled"]:
        code = _issue_otp_code(row["id"], "login", OTP_LOGIN_EXPIRE_MINUTES)
        mailer.send_email(
            row["email"],
            "Your MemoryLens AI login code",
            f"Your one-time code is {code}. It expires in {OTP_LOGIN_EXPIRE_MINUTES} minutes.",
        )
        otp_token = create_otp_token(row["id"])
        return OtpRequiredResponse(otp_token=otp_token)

    access = create_access_token(row["id"])
    refresh = create_refresh_token(row["id"])
    _set_refresh_cookie(response, refresh)
    return AuthResponse(
        access_token=access,
        user=UserOut(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            role=row["role"] or "member",
            email_verified=bool(row["email_verified"]),
            otp_enabled=bool(row["otp_enabled"]),
        ),
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
        user=UserOut(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            email_verified=user.email_verified,
            otp_enabled=user.otp_enabled,
        ),
    )


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        email_verified=current_user.email_verified,
        otp_enabled=current_user.otp_enabled,
    )


@router.patch("/me", response_model=UserOut)
def update_me(req: UpdateMeRequest, current_user: CurrentUser = Depends(get_current_user)) -> UserOut:
    with db_cursor() as cur:
        cur.execute(
            "UPDATE users SET otp_enabled = ? WHERE id = ?",
            (1 if req.otp_enabled else 0, current_user.id),
        )
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
        email_verified=current_user.email_verified,
        otp_enabled=req.otp_enabled,
    )


@router.post("/otp/verify", response_model=AuthResponse)
@limiter.limit("10/minute")
def otp_verify(req: OtpVerifyRequest, request: Request, response: Response) -> AuthResponse:
    user_id = decode_token(req.otp_token, "otp")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    if not _verify_and_consume_code(user_id, "login", req.code):
        raise HTTPException(401, "Invalid or expired code")

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh)
    return AuthResponse(
        access_token=access,
        user=UserOut(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            email_verified=user.email_verified,
            otp_enabled=user.otp_enabled,
        ),
    )


@router.post("/otp/resend")
@limiter.limit("10/minute")
def otp_resend(req: OtpResendRequest, request: Request) -> dict:
    user_id = decode_token(req.otp_token, "otp")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")

    last = _last_resend.get(req.otp_token)
    if last and (_now() - last).total_seconds() < RESEND_COOLDOWN_SECONDS:
        raise HTTPException(429, "Please wait before requesting another code")
    _last_resend[req.otp_token] = _now()

    _invalidate_codes(user_id, "login")
    code = _issue_otp_code(user_id, "login", OTP_LOGIN_EXPIRE_MINUTES)
    mailer.send_email(
        user.email,
        "Your MemoryLens AI login code",
        f"Your one-time code is {code}. It expires in {OTP_LOGIN_EXPIRE_MINUTES} minutes.",
    )
    return {"ok": True}


@router.post("/verify-email")
def verify_email(req: VerifyEmailRequest, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    if not _verify_and_consume_code(current_user.id, "verify_email", req.code):
        raise HTTPException(401, "Invalid or expired code")
    with db_cursor() as cur:
        cur.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (current_user.id,))
    return {"ok": True}


@router.post("/resend-verification")
@limiter.limit("5/minute")
def resend_verification(request: Request, current_user: CurrentUser = Depends(get_current_user)) -> dict:
    _invalidate_codes(current_user.id, "verify_email")
    code = _issue_otp_code(current_user.id, "verify_email", RESET_EXPIRE_MINUTES * 2)
    mailer.send_email(
        current_user.email,
        "Verify your MemoryLens AI email",
        f"Your verification code is {code}. It expires in {RESET_EXPIRE_MINUTES * 2} minutes.",
    )
    return {"ok": True}


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(req: ForgotPasswordRequest, request: Request) -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT id, email FROM users WHERE email = ?", (req.email,))
        row = cur.fetchone()
    if row:
        code = _issue_otp_code(row["id"], "password_reset", RESET_EXPIRE_MINUTES)
        mailer.send_email(
            row["email"],
            "Reset your MemoryLens AI password",
            f"Your password reset code is {code}. It expires in {RESET_EXPIRE_MINUTES} minutes.",
        )
    return {"ok": True}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(req: ResetPasswordRequest, request: Request) -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        row = cur.fetchone()
    if not row or not _verify_and_consume_code(row["id"], "password_reset", req.code):
        raise HTTPException(401, "Invalid or expired code")
    with db_cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(req.new_password), row["id"]),
        )
    # Refresh/access tokens are stateless JWTs with no server-side revocation
    # list in this codebase, so existing sessions can't be invalidated here;
    # they simply expire on their normal schedule (see app/auth.py).
    return {"ok": True}
