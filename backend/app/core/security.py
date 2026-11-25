"""Authentication, password hashing, JWT tokens, refresh rotation, and RBAC."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.app.api.schemas import UserBuyerProfileUpdate, UserContext
from backend.app.core.config import settings
from backend.app.core.redis_client import (
    cache_buyer_profile,
    get_cached_buyer_profile,
    is_family_revoked,
    is_jti_revoked,
    revoke_token_family,
)
from backend.app.db.models import AuditLog, RefreshToken, User, UserBuyerProfile
from backend.app.db.session import get_db

_password_hasher = PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)

TIER_RANK: dict[str, int] = {
    "FREE": 0,
    "PRO": 1,
    "ADMIN": 2,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id with a random per-user salt."""
    return _password_hasher.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against an Argon2id hash."""
    if not plain_password or not password_hash:
        return False
    try:
        return bool(_password_hasher.verify(password_hash, plain_password))
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(
    user_id: str,
    email: str,
    role: str = "FREE",
    tier: str = "FREE",
    expires_minutes: int | None = None,
    jti: str | None = None,
) -> str:
    """Create a signed HS256 JWT access token (default 15m expiry)."""
    now = _utcnow()
    ttl_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    exp = now + timedelta(minutes=ttl_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tier": tier,
        "jti": jti or str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access JWT, enforcing signature, expiry, type, and JTI revocation."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload.get("type") != "access" or not payload.get("sub") or not payload.get("jti"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if is_jti_revoked(str(payload["jti"])):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def generate_refresh_token() -> str:
    """Generate a high-entropy opaque refresh token."""
    return secrets.token_urlsafe(48)


def hash_token(raw_token: str) -> str:
    """Compute SHA-256 hex digest for storing refresh tokens safely."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_refresh_token(
    db: Session,
    user_id: str,
    family_id: str | None = None,
) -> tuple[str, RefreshToken]:
    """Create and persist a new RefreshToken row in the database."""
    raw_token = generate_refresh_token()
    token_hash = hash_token(raw_token)
    fam_id = family_id or str(uuid.uuid4())
    expires_at = _utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    record = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        family_id=fam_id,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return raw_token, record


def set_refresh_cookie(response: Response, raw_refresh_token: str) -> None:
    """Attach the HttpOnly, SameSite=Lax refresh token cookie to the response."""
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=raw_refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    """Delete the refresh token cookie from the client."""
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )


def revoke_family(db: Session, family_id: str) -> None:
    """Revoke all refresh tokens belonging to a family in DB and Redis."""
    now = _utcnow()
    tokens = (
        db.query(RefreshToken)
        .filter(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .all()
    )
    for tok in tokens:
        tok.revoked_at = now
    revoke_token_family(family_id, settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
    db.commit()


def rotate_refresh_token(db: Session, raw_refresh_token: str) -> tuple[User, str, RefreshToken]:
    """Rotate a refresh token with strict reuse detection across DB and Redis."""
    token_hash = hash_token(raw_refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if record.revoked_at is not None or is_family_revoked(record.family_id):
        revoke_family(db, record.family_id)
        db.add(
            AuditLog(
                user_id=record.user_id,
                event_type="REFRESH_TOKEN_REUSE_DETECTED",
                severity="CRITICAL",
                resource_type="refresh_token_family",
                resource_id=record.family_id,
                details_json={"reused_token_id": record.id},
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected; token family revoked",
        )

    if _ensure_utc(record.expires_at) <= _utcnow():
        record.revoked_at = _utcnow()
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user = db.query(User).filter(User.id == record.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    new_raw_token = generate_refresh_token()
    new_hash = hash_token(new_raw_token)
    now = _utcnow()
    record.revoked_at = now
    record.replaced_by_hash = new_hash

    new_record = RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        family_id=record.family_id,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    return user, new_raw_token, new_record


def build_profile_cache_payload(user: User, profile: UserBuyerProfile | None) -> dict[str, Any]:
    """Build JSON-serializable buyer profile dictionary for Redis caching."""
    return {
        "preferred_currency": profile.preferred_currency if profile else "ILS",
        "ship_to_country": profile.ship_to_country if profile else "IL",
        "credit_card_clubs": list(profile.credit_card_clubs_json or []) if profile else [],
        "preferred_stores": list(profile.preferred_stores_json or []) if profile else [],
        "min_seller_trust": profile.min_seller_trust if profile else 75,
        "notification_channels": (
            list(profile.notification_channels_json or ["email"]) if profile else ["email"]
        ),
        "telegram_chat_id": profile.telegram_chat_id if profile else None,
        "full_name": user.full_name,
        "is_verified": user.is_verified,
        "role": user.role,
        "tier": user.tier,
    }


def get_current_user_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserContext:
    """FastAPI dependency returning verified UserContext.

    Loads buyer profile from Redis cache first (<50ms); falls back to DB
    and populates Redis cache on cache miss.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id = str(payload["sub"])

    cached = get_cached_buyer_profile(user_id)
    if cached is not None:
        profile_data = {
            k: v
            for k, v in cached.items()
            if k in UserBuyerProfileUpdate.model_fields
        }
        return UserContext(
            user_id=user_id,
            email=str(payload.get("email", "")),
            full_name=str(cached.get("full_name", "")),
            role=cached.get("role") or payload.get("role", "FREE"),
            tier=cached.get("tier") or payload.get("tier", "FREE"),
            is_verified=bool(cached.get("is_verified", True)),
            buyer_profile=UserBuyerProfileUpdate(**profile_data),
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    profile = (
        db.query(UserBuyerProfile).filter(UserBuyerProfile.user_id == user.id).first()
    )
    if profile is None:
        profile = UserBuyerProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    cache_dict = build_profile_cache_payload(user, profile)
    cache_buyer_profile(user.id, cache_dict)

    profile_data = {
        k: v
        for k, v in cache_dict.items()
        if k in UserBuyerProfileUpdate.model_fields
    }
    return UserContext(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tier=user.tier,
        is_verified=user.is_verified,
        buyer_profile=UserBuyerProfileUpdate(**profile_data),
    )


def require_tier(min_tier: str) -> Callable[..., UserContext]:
    """FastAPI dependency enforcing minimum subscription tier (FREE < PRO < ADMIN)."""
    required_rank = TIER_RANK.get(min_tier.upper(), 0)

    def _dependency(ctx: UserContext = Depends(get_current_user_context)) -> UserContext:
        user_rank = max(
            TIER_RANK.get(ctx.tier.upper(), 0),
            TIER_RANK.get(ctx.role.upper(), 0),
        )
        if user_rank < required_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Upgrade Required",
            )
        return ctx

    return _dependency


def require_role(role: str) -> Callable[..., UserContext]:
    """FastAPI dependency enforcing explicit RBAC role membership."""
    expected_role = role.upper()

    def _dependency(ctx: UserContext = Depends(get_current_user_context)) -> UserContext:
        if ctx.role.upper() != expected_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: {expected_role} role required",
            )
        return ctx

    return _dependency
