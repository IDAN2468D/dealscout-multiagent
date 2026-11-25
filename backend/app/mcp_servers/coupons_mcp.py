"""FastMCP READ server for store coupons, club prioritization, stacking, and crowd scores.

Automatically suppresses coupons whose community ``success_rate`` in Redis
is below ``settings.COUPON_MIN_CROWD_SUCCESS_RATE`` (0.35).
"""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from backend.app.core.config import settings
from backend.app.rag.promo_policy_store import PromoPolicyStore
from backend.app.tools.guardrails_tools import sanitize_external_text

mcp = FastMCP("coupons-mcp")

# Fallback coupon catalog aligned with auth-infra seeded crowd scores & catalog-math seed_data
_FALLBACK_COUPONS: list[dict[str, Any]] = [
    {
        "code": "HTZ12",
        "store_name": "Amazon",
        "discount_pct": 12.0,
        "discount_usd": 0.0,
        "min_spend_usd": 40.0,
        "max_discount_usd": 60.0,
        "club": "HitechZone",
        "expired": False,
        "description": "HitechZone 12% member discount on electronics.",
    },
    {
        "code": "FLYCARD10",
        "store_name": "Amazon",
        "discount_pct": 10.0,
        "discount_usd": 0.0,
        "min_spend_usd": 50.0,
        "max_discount_usd": 45.0,
        "club": "FlyCard",
        "expired": False,
        "description": "FlyCard 10% instant discount + points.",
    },
    {
        "code": "WELCOME10",
        "store_name": "AliExpress",
        "discount_pct": 10.0,
        "discount_usd": 0.0,
        "min_spend_usd": 20.0,
        "max_discount_usd": 35.0,
        "club": None,
        "expired": False,
        "description": "Welcome 10% platform promo.",
    },
    {
        "code": "SAVE15",
        "store_name": "Amazon",
        "discount_pct": 0.0,
        "discount_usd": 15.0,
        "min_spend_usd": 100.0,
        "max_discount_usd": 15.0,
        "club": None,
        "expired": False,
        "description": "$15 off orders over $100.",
    },
    {
        "code": "MAX8",
        "store_name": "AliExpress",
        "discount_pct": 8.0,
        "discount_usd": 0.0,
        "min_spend_usd": 25.0,
        "max_discount_usd": 25.0,
        "club": "Max",
        "expired": False,
        "description": "Max credit-card club 8% instant discount.",
    },
    {
        "code": "ASOS20",
        "store_name": "ASOS",
        "discount_pct": 20.0,
        "discount_usd": 0.0,
        "min_spend_usd": 40.0,
        "max_discount_usd": 50.0,
        "club": None,
        "expired": False,
        "description": "20% off ASOS apparel.",
    },
    {
        "code": "HEVER15",
        "store_name": "KSP",
        "discount_pct": 15.0,
        "discount_usd": 0.0,
        "min_spend_usd": 30.0,
        "max_discount_usd": 110.0,
        "club": "Hever",
        "expired": False,
        "description": "Hever 15% club voucher for KSP & Terminal X.",
    },
    {
        "code": "HEVER15",
        "store_name": "Terminal X",
        "discount_pct": 15.0,
        "discount_usd": 0.0,
        "min_spend_usd": 30.0,
        "max_discount_usd": 110.0,
        "club": "Hever",
        "expired": False,
        "description": "Hever 15% club voucher at Terminal X.",
    },
    {
        "code": "ISRA10",
        "store_name": "KSP",
        "discount_pct": 10.0,
        "discount_usd": 0.0,
        "min_spend_usd": 25.0,
        "max_discount_usd": 60.0,
        "club": "Isracard",
        "expired": False,
        "description": "Isracard 10% partner benefit.",
    },
    {
        "code": "BROKEN50",
        "store_name": "Amazon",
        "discount_pct": 50.0,
        "discount_usd": 0.0,
        "min_spend_usd": 10.0,
        "max_discount_usd": 200.0,
        "club": None,
        "expired": True,
        "description": "Broken unverified 50% promo.",
    },
]

_FALLBACK_CROWD_SCORES: dict[str, tuple[float, int]] = {
    "WELCOME10": (0.92, 50),
    "SAVE15": (0.88, 40),
    "ASOS20": (0.84, 32),
    "HTZ12": (0.95, 64),
    "HEVER15": (0.94, 58),
    "FLYCARD10": (0.91, 45),
    "MAX8": (0.89, 36),
    "ISRA10": (0.90, 30),
    "BROKEN50": (0.18, 22),
}

_SINGLE_PROMO_STORES = {"asos", "ebay", "ksp"}


def _load_seed_coupons() -> list[dict[str, Any]]:
    try:
        from backend.app.search.seed_data import SEED_COUPONS

        if SEED_COUPONS:
            return list(SEED_COUPONS)
    except Exception:
        pass
    return list(_FALLBACK_COUPONS)


def _fetch_crowd_score(store_name: str, coupon_code: str) -> tuple[float, int]:
    code_up = coupon_code.strip().upper()
    try:
        from backend.app.core.redis_client import get_coupon_crowd_score

        rate, votes = get_coupon_crowd_score(store_name, code_up)
        return float(rate), int(votes)
    except Exception:
        return _FALLBACK_CROWD_SCORES.get(code_up, (0.80, 10))


def _extract_clubs(
    user_clubs: list[str] | None,
    user_context: Any | None = None,
) -> list[str]:
    if user_clubs is not None:
        return [str(c).strip() for c in user_clubs if str(c).strip()]
    if user_context is None:
        return []
    if isinstance(user_context, dict):
        bp = user_context.get("buyer_profile") or {}
        return [str(c).strip() for c in bp.get("credit_card_clubs", []) if str(c).strip()]
    bp = getattr(user_context, "buyer_profile", None)
    if bp is not None:
        return [str(c).strip() for c in getattr(bp, "credit_card_clubs", []) if str(c).strip()]
    return []


def _coupon_applies_to_store(raw_c: dict[str, Any], store_lower: str) -> bool:
    applicable = raw_c.get("applicable_stores")
    if isinstance(applicable, list) and applicable:
        return any(str(s).strip().lower() in {store_lower, "all"} for s in applicable)
    c_store = str(raw_c.get("store_name", "")).strip().lower()
    return not c_store or c_store in {store_lower, "all"}


def _coupon_is_expired(raw_c: dict[str, Any]) -> bool:
    return bool(raw_c.get("is_expired", raw_c.get("expired", False)))


def _coupon_club(raw_c: dict[str, Any]) -> str | None:
    club = raw_c.get("required_club", raw_c.get("club"))
    return str(club).strip() if club else None


def _coupon_pct_and_flat(raw_c: dict[str, Any]) -> tuple[float, float]:
    dtype = str(raw_c.get("discount_type", "")).lower()
    dval = float(raw_c.get("discount_value", 0.0) or 0.0)
    if dtype == "percent":
        return dval, 0.0
    if dtype in {"fixed", "fixed_usd"}:
        return 0.0, dval
    return float(raw_c.get("discount_pct", 0.0) or 0.0), float(raw_c.get("discount_usd", 0.0) or 0.0)


def _compute_discount(coupon: dict[str, Any], base_price_usd: float) -> float:
    min_spend = float(coupon.get("min_spend_usd", 0.0) or 0.0)
    if base_price_usd > 0 and base_price_usd < min_spend:
        return 0.0
    pct, flat = _coupon_pct_and_flat(coupon)
    raw = (base_price_usd * (pct / 100.0)) if pct > 0 else flat
    cap = coupon.get("max_discount_usd")
    if cap is not None and float(cap) > 0:
        raw = min(raw, float(cap))
    return round(max(0.0, min(raw, base_price_usd)), 2)


@mcp.tool()
def get_crowd_score(store_name: str, coupon_code: str) -> dict[str, Any]:
    """Return Redis community coupon success_rate, vote count, and suppression status."""
    rate, votes = _fetch_crowd_score(store_name, coupon_code)
    suppressed = rate < float(settings.COUPON_MIN_CROWD_SUCCESS_RATE)
    return {
        "store_name": store_name,
        "coupon_code": coupon_code.strip().upper(),
        "success_rate": round(rate, 4),
        "total_votes": votes,
        "suppressed": suppressed,
        "min_threshold": float(settings.COUPON_MIN_CROWD_SUCCESS_RATE),
    }


@mcp.tool()
def find_store_coupons(
    store_name: str,
    user_clubs: list[str] | None = None,
    cart_total_usd: float = 0.0,
    user_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Find active coupons for a store, prioritizing user credit-card clubs and suppressing < 0.35."""
    clubs = _extract_clubs(user_clubs, user_context)
    clubs_lower = {c.lower() for c in clubs}
    store_lower = (store_name or "").strip().lower()
    min_rate = float(settings.COUPON_MIN_CROWD_SUCCESS_RATE)

    candidates: list[dict[str, Any]] = []
    for raw_c in _load_seed_coupons():
        if not _coupon_applies_to_store(raw_c, store_lower):
            continue
        if _coupon_is_expired(raw_c):
            continue

        code = str(raw_c.get("code", "")).strip().upper()
        rate, votes = _fetch_crowd_score(store_name, code)
        if rate < min_rate:
            continue

        club = _coupon_club(raw_c)
        club_match = bool(club and club.lower() in clubs_lower)
        if club and not club_match:
            # Skip club-exclusive coupons for clubs the user does not hold
            continue

        pct, flat = _coupon_pct_and_flat(raw_c)
        clean_desc, _ = sanitize_external_text(str(raw_c.get("description", "")))
        est_discount = (
            _compute_discount(raw_c, cart_total_usd) if cart_total_usd > 0 else 0.0
        )

        candidates.append(
            {
                "code": code,
                "store_name": store_name,
                "club": club,
                "club_match": club_match,
                "discount_pct": pct,
                "discount_usd": flat,
                "estimated_discount_usd": est_discount,
                "min_spend_usd": float(raw_c.get("min_spend_usd", 0.0) or 0.0),
                "success_rate": round(rate, 4),
                "total_votes": votes,
                "suppressed": False,
                "description": clean_desc,
            }
        )

    candidates.sort(
        key=lambda c: (
            1 if c["club_match"] else 0,
            c["estimated_discount_usd"],
            c["success_rate"],
        ),
        reverse=True,
    )
    return candidates


@mcp.tool()
def validate_coupon_dry_run(
    store_name: str,
    coupon_code: str,
    base_price_usd: float,
    user_clubs: list[str] | None = None,
) -> dict[str, Any]:
    """Validate a single coupon code against store rules, club ownership, min spend, and crowd score."""
    code_up = coupon_code.strip().upper()
    store_lower = (store_name or "").strip().lower()
    clubs_lower = {c.strip().lower() for c in (user_clubs or []) if c.strip()}

    crowd = get_crowd_score(store_name, code_up)
    if crowd["suppressed"]:
        return {
            "valid": False,
            "coupon_code": code_up,
            "store_name": store_name,
            "discount_usd": 0.0,
            "discount_pct": 0.0,
            "success_rate": crowd["success_rate"],
            "suppressed": True,
            "reason": (
                f"Suppressed: community success_rate {crowd['success_rate']:.2f} "
                f"< {settings.COUPON_MIN_CROWD_SUCCESS_RATE:.2f}"
            ),
        }

    matched = next(
        (
            c
            for c in _load_seed_coupons()
            if str(c.get("code", "")).strip().upper() == code_up
            and _coupon_applies_to_store(c, store_lower)
        ),
        None,
    )
    if matched is None:
        return {
            "valid": False,
            "coupon_code": code_up,
            "store_name": store_name,
            "discount_usd": 0.0,
            "discount_pct": 0.0,
            "success_rate": crowd["success_rate"],
            "suppressed": False,
            "reason": f"Coupon '{code_up}' is not valid for '{store_name}'.",
        }

    if _coupon_is_expired(matched):
        return {
            "valid": False,
            "coupon_code": code_up,
            "store_name": store_name,
            "discount_usd": 0.0,
            "discount_pct": 0.0,
            "success_rate": crowd["success_rate"],
            "suppressed": True,
            "reason": f"Coupon '{code_up}' is expired.",
        }

    req_club = _coupon_club(matched)
    if req_club and req_club.lower() not in clubs_lower:
        return {
            "valid": False,
            "coupon_code": code_up,
            "store_name": store_name,
            "discount_usd": 0.0,
            "discount_pct": 0.0,
            "success_rate": crowd["success_rate"],
            "suppressed": False,
            "reason": f"Coupon '{code_up}' requires '{req_club}' credit card club.",
        }

    min_spend = float(matched.get("min_spend_usd", 0.0) or 0.0)
    if base_price_usd < min_spend:
        return {
            "valid": False,
            "coupon_code": code_up,
            "store_name": store_name,
            "discount_usd": 0.0,
            "discount_pct": 0.0,
            "success_rate": crowd["success_rate"],
            "suppressed": False,
            "reason": f"Minimum spend ${min_spend:.2f} not met (base ${base_price_usd:.2f}).",
        }

    pct, _ = _coupon_pct_and_flat(matched)
    discount = _compute_discount(matched, base_price_usd)
    return {
        "valid": True,
        "coupon_code": code_up,
        "store_name": store_name,
        "discount_usd": discount,
        "discount_pct": pct,
        "success_rate": crowd["success_rate"],
        "suppressed": False,
        "reason": "Coupon validated successfully.",
    }


@mcp.tool()
def check_stacking_rules(
    store_name: str,
    coupon_codes: list[str],
    user_clubs: list[str] | None = None,
) -> dict[str, Any]:
    """Check whether multiple coupon codes can stack at ``store_name`` via RAG policies."""
    codes = [c.strip().upper() for c in coupon_codes if c and c.strip()]
    store_lower = (store_name or "").strip().lower()
    policy_store = PromoPolicyStore()
    policies = policy_store.query_club_policies(
        clubs=user_clubs or [],
        store_name=store_name,
        query=f"stacking {' '.join(codes)}",
        n_results=3,
    )
    policy_notes = [p["text"] for p in policies]

    accepted: list[str] = []
    rejected: list[str] = []

    if not codes:
        return {
            "store_name": store_name,
            "stackable": False,
            "accepted_coupons": [],
            "rejected_coupons": [],
            "policy_notes": policy_notes,
        }

    # Filter out suppressed codes first
    live_codes: list[str] = []
    for code in codes:
        if get_crowd_score(store_name, code)["suppressed"]:
            rejected.append(code)
        else:
            live_codes.append(code)

    if store_lower in _SINGLE_PROMO_STORES:
        if live_codes:
            accepted.append(live_codes[0])
            rejected.extend(live_codes[1:])
    else:
        # Amazon / AliExpress / Terminal X allow 1 store promo + at most 1 club benefit
        club_codes_used = 0
        store_codes_used = 0
        seed_map = {
            str(c.get("code", "")).upper(): c
            for c in _load_seed_coupons()
            if _coupon_applies_to_store(c, store_lower)
        }
        for code in live_codes:
            meta = seed_map.get(code, {})
            if _coupon_club(meta):
                if club_codes_used == 0:
                    accepted.append(code)
                    club_codes_used += 1
                else:
                    rejected.append(code)
            else:
                if store_codes_used == 0:
                    accepted.append(code)
                    store_codes_used += 1
                else:
                    rejected.append(code)

    return {
        "store_name": store_name,
        "stackable": len(accepted) > 1,
        "accepted_coupons": accepted,
        "rejected_coupons": rejected,
        "policy_notes": policy_notes,
    }
