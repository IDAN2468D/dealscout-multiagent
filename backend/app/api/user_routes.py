"""Authenticated user profile, search history, and savings ledger routes."""

from __future__ import annotations

import re
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.api.schemas import (
    SavingsEntryOut,
    SavingsSummaryResponse,
    SearchHistoryOut,
    UserBuyerProfileOut,
    UserBuyerProfileUpdate,
    UserContext,
    UserMeResponse,
)
from backend.app.core.redis_client import TIER_RATE_LIMITS, cache_buyer_profile, get_redis_client
from backend.app.core.security import build_profile_cache_payload, get_current_user_context
from backend.app.db.models import User, UserBuyerProfile, UserSavingsLedger, UserSearchHistory
from backend.app.db.session import get_db
from backend.app.rag.promo_policy_store import PromoPolicyStore

router = APIRouter(prefix="/api/v1/users", tags=["users"])

# Matches 13-19 digit PAN sequences (raw or separated by spaces/hyphens)
_PAN_PATTERN = re.compile(r"(?<!\d)(?:\d[\s\-]*){13,19}(?!\d)")


def _validate_club_names_only(clubs: list[str]) -> None:
    """Reject any credit_card_clubs entry resembling a 13-19 digit card PAN."""
    for entry in clubs:
        if _PAN_PATTERN.search(entry or ""):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "credit_card_clubs must contain club names only "
                    "(e.g., HitechZone, Hever, FlyCard), never raw card numbers."
                ),
            )


def _get_or_create_profile(db: Session, user_id: str) -> UserBuyerProfile:
    profile = (
        db.query(UserBuyerProfile).filter(UserBuyerProfile.user_id == user_id).first()
    )
    if profile is None:
        profile = UserBuyerProfile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _to_profile_out(profile: UserBuyerProfile) -> UserBuyerProfileOut:
    return UserBuyerProfileOut(
        user_id=profile.user_id,
        preferred_currency=profile.preferred_currency,  # type: ignore[arg-type]
        ship_to_country=profile.ship_to_country,
        credit_card_clubs=list(profile.credit_card_clubs_json or []),
        preferred_stores=list(profile.preferred_stores_json or []),
        min_seller_trust=profile.min_seller_trust,
        notification_channels=list(profile.notification_channels_json or ["email"]),  # type: ignore[arg-type]
        telegram_chat_id=profile.telegram_chat_id,
        long_term_preferences=dict(profile.long_term_preferences_json or {}),
        updated_at=profile.updated_at,
    )


@router.get("/me", response_model=UserMeResponse)
def get_me(
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> UserMeResponse:
    """Return authenticated user metadata and buyer profile."""
    user = db.query(User).filter(User.id == ctx.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    profile = _get_or_create_profile(db, user.id)
    limit_val, _ = TIER_RATE_LIMITS.get(user.tier.upper(), (10, 86400))
    daily_limit = int(limit_val) if limit_val is not None else 9999
    try:
        used_count = int(get_redis_client().zcard(f"ratelimit:{user.id}") or 0)
    except Exception:
        used_count = 0
    return UserMeResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,  # type: ignore[arg-type]
        tier=user.tier,  # type: ignore[arg-type]
        is_verified=user.is_verified,
        daily_searches_used=used_count,
        daily_searches_limit=daily_limit,
        buyer_profile=_to_profile_out(profile),
    )


@router.get("/me/profile", response_model=UserBuyerProfileOut)
def get_my_profile(
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> UserBuyerProfileOut:
    """Return the authenticated user's buyer profile."""
    profile = _get_or_create_profile(db, ctx.user_id)
    return _to_profile_out(profile)


@router.put("/me/profile", response_model=UserBuyerProfileOut)
def update_my_profile(
    payload: UserBuyerProfileUpdate,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> UserBuyerProfileOut:
    """Update the authenticated user's buyer profile and refresh Redis cache."""
    _validate_club_names_only(payload.credit_card_clubs)

    user = db.query(User).filter(User.id == ctx.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    profile = _get_or_create_profile(db, ctx.user_id)
    profile.preferred_currency = payload.preferred_currency
    profile.ship_to_country = payload.ship_to_country.strip().upper()
    profile.credit_card_clubs_json = [c.strip() for c in payload.credit_card_clubs if c.strip()]
    profile.preferred_stores_json = [s.strip() for s in payload.preferred_stores if s.strip()]
    profile.min_seller_trust = payload.min_seller_trust
    profile.notification_channels_json = list(payload.notification_channels)
    profile.telegram_chat_id = payload.telegram_chat_id
    if payload.long_term_preferences is not None:
        merged_prefs = dict(profile.long_term_preferences_json or {})
        merged_prefs.update(payload.long_term_preferences)
        profile.long_term_preferences_json = merged_prefs
        try:
            summary = ", ".join(f"{k}={v}" for k, v in payload.long_term_preferences.items())
            if summary:
                PromoPolicyStore().add_user_preference(ctx.user_id, summary, category="profile")
        except Exception:
            pass

    db.commit()
    db.refresh(profile)

    cache_buyer_profile(ctx.user_id, build_profile_cache_payload(user, profile))
    return _to_profile_out(profile)


@router.get("/me/history", response_model=list[SearchHistoryOut])
def get_my_search_history(
    limit: int = Query(default=50, ge=1, le=200),
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> list[SearchHistoryOut]:
    """Return search history strictly scoped to the authenticated user."""
    rows = (
        db.query(UserSearchHistory)
        .filter(UserSearchHistory.user_id == ctx.user_id)
        .order_by(UserSearchHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [SearchHistoryOut.model_validate(row) for row in rows]


@router.get("/me/savings", response_model=SavingsSummaryResponse)
def get_my_savings(
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> SavingsSummaryResponse:
    """Return savings ledger summary strictly scoped to the authenticated user."""
    rows = (
        db.query(UserSavingsLedger)
        .filter(UserSavingsLedger.user_id == ctx.user_id)
        .order_by(UserSavingsLedger.created_at.desc())
        .all()
    )

    total_ils = 0.0
    total_usd = 0.0
    breakdown: dict[str, float] = defaultdict(float)

    for entry in rows:
        total_ils += float(entry.saved_ils or 0.0)
        total_usd += float(entry.saved_usd or 0.0)
        breakdown[entry.source_type] += float(entry.saved_ils or 0.0)

    rounded_breakdown = {k: round(v, 2) for k, v in breakdown.items()}
    recent = [SavingsEntryOut.model_validate(e) for e in rows[:50]]

    return SavingsSummaryResponse(
        user_id=ctx.user_id,
        total_saved_ils=round(total_ils, 2),
        total_saved_usd=round(total_usd, 2),
        breakdown_by_source=rounded_breakdown,
        recent_entries=recent,
    )
