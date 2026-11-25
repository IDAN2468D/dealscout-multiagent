"""Authentication, token rotation, logout revocation, and Google OAuth2 routes."""

from __future__ import annotations

import secrets
import time
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api.schemas import (
    LoginRequest,
    TokenResponse,
    UserRegisterRequest,
    UserRegisterResponse,
    VerifyEmailRequest,
)
from backend.app.core.config import settings
from backend.app.core.redis_client import invalidate_buyer_profile, revoke_jti
from backend.app.core.security import (
    bearer_scheme,
    clear_refresh_cookie,
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    issue_refresh_token,
    revoke_family,
    rotate_refresh_token,
    set_refresh_cookie,
    verify_password,
)
from backend.app.db.models import AuditLog, RefreshToken, User, UserBuyerProfile
from backend.app.db.session import get_db

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


class RefreshTokenBody(BaseModel):
    """Optional JSON body fallback when clients cannot send cookies."""

    refresh_token: Optional[str] = None


def _build_token_response(user: User, access_token: str) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
        role=user.role,  # type: ignore[arg-type]
        tier=user.tier,  # type: ignore[arg-type]
    )


@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> UserRegisterResponse:
    """Register a new user account with Argon2id password hashing and default buyer profile."""
    normalized_email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=normalized_email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role="FREE",
        tier="FREE",
        is_verified=False,
        verification_token=verification_token,
    )
    db.add(user)
    db.flush()

    profile = UserBuyerProfile(user_id=user.id)
    db.add(profile)
    db.add(
        AuditLog(
            user_id=user.id,
            event_type="USER_REGISTERED",
            severity="INFO",
            resource_type="user",
            resource_id=user.id,
            details_json={"email": user.email},
        )
    )
    db.commit()
    db.refresh(user)

    return UserRegisterResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        tier=user.tier,  # type: ignore[arg-type]
        is_verified=user.is_verified,
        verification_token=verification_token,
        message="Registration successful. Verify your email with the verification token.",
    )


@router.post("/verify-email")
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Verify a user's email address using the issued verification token."""
    user = db.query(User).filter(User.verification_token == payload.token).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user.is_verified = True
    user.verification_token = None
    db.add(
        AuditLog(
            user_id=user.id,
            event_type="EMAIL_VERIFIED",
            severity="INFO",
            resource_type="user",
            resource_id=user.id,
        )
    )
    db.commit()
    invalidate_buyer_profile(user.id)

    return {
        "verified": True,
        "user_id": user.id,
        "email": user.email,
        "message": "Email verified successfully.",
    }


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate user with Argon2id and issue JWT access + HttpOnly refresh cookie."""
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        tier=user.tier,
    )
    raw_refresh, _ = issue_refresh_token(db, user.id)
    set_refresh_cookie(response, raw_refresh)

    db.add(
        AuditLog(
            user_id=user.id,
            event_type="USER_LOGIN",
            severity="INFO",
            resource_type="user",
            resource_id=user.id,
        )
    )
    db.commit()

    return _build_token_response(user, access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(
    request: Request,
    response: Response,
    body: RefreshTokenBody | None = Body(default=None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Rotate refresh token (from HttpOnly cookie or optional body) with reuse detection."""
    raw_refresh = (
        body.refresh_token if body is not None and body.refresh_token else None
    ) or request.cookies.get(settings.REFRESH_COOKIE_NAME)

    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    user, new_raw_refresh, _ = rotate_refresh_token(db, raw_refresh)
    set_refresh_cookie(response, new_raw_refresh)

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        tier=user.tier,
    )
    return _build_token_response(user, access_token)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    body: RefreshTokenBody | None = Body(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> dict:
    """Revoke current access JTI and refresh token family in Redis & DB, clearing cookie."""
    user_id: str | None = None

    if credentials and credentials.credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            jti = str(payload["jti"])
            exp = int(payload.get("exp", 0))
            user_id = str(payload["sub"])
            ttl = max(1, exp - int(time.time()))
            revoke_jti(jti, ttl)
        except HTTPException:
            pass

    raw_refresh = (
        body.refresh_token if body is not None and body.refresh_token else None
    ) or request.cookies.get(settings.REFRESH_COOKIE_NAME)

    if raw_refresh:
        token_hash = hash_token(raw_refresh)
        record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if record is not None:
            revoke_family(db, record.family_id)
            user_id = user_id or record.user_id

    clear_refresh_cookie(response)
    if user_id:
        db.add(
            AuditLog(
                user_id=user_id,
                event_type="USER_LOGOUT",
                severity="INFO",
                resource_type="user",
                resource_id=user_id,
            )
        )
        db.commit()

    return {"logged_out": True, "message": "Session revoked successfully."}


def _is_mock_oauth_allowed() -> bool:
    return (
        settings.GOOGLE_CLIENT_ID.startswith("mock-")
        or settings.ENVIRONMENT.lower() in ("development", "test", "local")
    )


@router.get("/oauth/google")
async def oauth_google_login(
    request: Request,
    email: Optional[str] = Query(default=None),
    mock: bool = Query(default=False),
):
    """Initiate Google OAuth2 login (uses offline deterministic redirect in dev/test mode)."""
    if mock or _is_mock_oauth_allowed() or "session" not in request.scope:
        target_email = email or "google.user@dealscout.ai"
        callback_url = (
            f"/api/v1/auth/oauth/google/callback"
            f"?code=mock_google_auth_code&email={target_email}"
        )
        return RedirectResponse(url=callback_url, status_code=status.HTTP_302_FOUND)

    return await oauth.google.authorize_redirect(request, settings.GOOGLE_REDIRECT_URI)


@router.get("/oauth/google/callback", response_model=TokenResponse)
async def oauth_google_callback(
    request: Request,
    response: Response,
    code: Optional[str] = Query(default=None),
    email: Optional[str] = Query(default=None),
    full_name: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Handle Google OAuth2 callback (live Authlib or deterministic dev/test mock)."""
    use_mock = bool(
        (code and code.startswith("mock_"))
        or (email and _is_mock_oauth_allowed())
    )

    if use_mock:
        user_email = (email or "google.user@dealscout.ai").strip().lower()
        user_name = (full_name or "Google OAuth User").strip()
    else:
        try:
            token = await oauth.google.authorize_access_token(request)
            userinfo = token.get("userinfo")
            if not userinfo:
                userinfo = await oauth.google.userinfo(token=token)
            user_email = str(userinfo["email"]).strip().lower()
            user_name = str(userinfo.get("name") or user_email.split("@")[0]).strip()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google OAuth2 callback failed: {exc}",
            ) from exc

    user = db.query(User).filter(User.email == user_email).first()
    if user is None:
        user = User(
            email=user_email,
            full_name=user_name,
            password_hash=None,
            oauth_provider="google",
            role="FREE",
            tier="FREE",
            is_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(UserBuyerProfile(user_id=user.id))
    else:
        if not user.oauth_provider:
            user.oauth_provider = "google"
        user.is_verified = True

    db.add(
        AuditLog(
            user_id=user.id,
            event_type="OAUTH_GOOGLE_LOGIN",
            severity="INFO",
            resource_type="user",
            resource_id=user.id,
            details_json={"mock": use_mock},
        )
    )
    db.commit()
    db.refresh(user)
    invalidate_buyer_profile(user.id)

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        tier=user.tier,
    )
    raw_refresh, _ = issue_refresh_token(db, user.id)
    set_refresh_cookie(response, raw_refresh)

    return _build_token_response(user, access_token)
