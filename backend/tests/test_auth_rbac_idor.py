"""Sprint 1 & Security tests: Auth, Refresh Rotation, Reuse Detection, RBAC, Rate Limit & Anti-IDOR."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.core.redis_client import reset_rate_limit
from backend.app.core.security import hash_password, verify_password
from backend.app.db.models import AuditLog
from backend.tests.conftest import create_and_login_user


def test_argon2_hashing_and_full_auth_rotation_logout_lifecycle(
    client: TestClient, db_session: Session
) -> None:
    """Verify Register -> Verify Email -> Login -> Cached Profile (<50ms) -> Rotation -> Reuse Detection -> Logout."""
    hashed = hash_password("MySecurePass#2026")
    assert hashed.startswith("$argon2id$")
    assert verify_password("MySecurePass#2026", hashed) is True
    assert verify_password("wrong-pass", hashed) is False

    # Register + verify + login
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "alice@dealscout.ai",
            "password": "StrongPassword!99",
            "full_name": "Alice Cohen",
        },
    )
    assert reg.status_code == 201
    vtok = reg.json()["verification_token"]
    assert reg.json()["is_verified"] is False

    ver = client.post("/api/v1/auth/verify-email", json={"token": vtok})
    assert ver.status_code == 200
    assert ver.json()["verified"] is True

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@dealscout.ai", "password": "StrongPassword!99"},
    )
    assert login.status_code == 200
    access1 = login.json()["access_token"]
    cookie_token_1 = client.cookies.get("dealscout_refresh_token")
    assert cookie_token_1

    # Profile warm-up then cached lookup < 50ms
    me1 = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {access1}"})
    assert me1.status_code == 200
    t0 = time.perf_counter()
    me2 = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {access1}"})
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert me2.status_code == 200
    assert elapsed_ms < 50.0, f"Cached profile took {elapsed_ms:.2f}ms (>50ms SLA)"

    # Refresh Token Rotation
    ref1 = client.post("/api/v1/auth/refresh")
    assert ref1.status_code == 200
    access2 = ref1.json()["access_token"]
    cookie_token_2 = client.cookies.get("dealscout_refresh_token")
    assert cookie_token_2 and cookie_token_2 != cookie_token_1

    # Reuse Detection: presenting old token_1 MUST return 401 and revoke entire family
    reuse = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": cookie_token_1},
    )
    assert reuse.status_code == 401

    # Now even token_2 is revoked because family was compromised!
    after_reuse = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": cookie_token_2},
    )
    assert after_reuse.status_code == 401

    audit_reuse = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "REFRESH_TOKEN_REUSE_DETECTED")
        .first()
    )
    assert audit_reuse is not None

    # Logout revokes active access JTI immediately in Redis
    out = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access2}"},
    )
    assert out.status_code == 200

    blocked_me = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {access2}"}
    )
    assert blocked_me.status_code == 401


def test_profile_rejects_raw_credit_card_pan_and_google_oauth_mock(
    client: TestClient, db_session: Session
) -> None:
    """Credit card wallet stores club names only (422 on 16-digit PAN); OAuth callback issues JWT."""
    u = create_and_login_user(client, db_session, email="pan@dealscout.ai")
    headers = {"Authorization": f"Bearer {u['access_token']}"}

    bad_prof = client.put(
        "/api/v1/users/me/profile",
        headers=headers,
        json={"credit_card_clubs": ["4580-1234-5678-9012"]},
    )
    assert bad_prof.status_code == 422

    good_prof = client.put(
        "/api/v1/users/me/profile",
        headers=headers,
        json={"credit_card_clubs": ["HitechZone", "FlyCard"]},
    )
    assert good_prof.status_code == 200
    assert good_prof.json()["credit_card_clubs"] == ["HitechZone", "FlyCard"]

    oauth_res = client.get(
        "/api/v1/auth/oauth/google/callback?code=mock_dev_code&email=oauth_buyer@dealscout.ai"
    )
    assert oauth_res.status_code == 200
    assert oauth_res.json()["access_token"]
    assert oauth_res.json()["email"] == "oauth_buyer@dealscout.ai"


def test_rbac_free_vs_pro_vs_admin_and_rate_limiting(
    client: TestClient, db_session: Session
) -> None:
    """FREE blocked 403 on PRO features, capped at 3 watchlist & 10 searches/day (429)."""
    free_u = create_and_login_user(client, db_session, email="free@dealscout.ai", tier="FREE")
    pro_u = create_and_login_user(client, db_session, email="pro@dealscout.ai", tier="PRO")

    free_h = {"Authorization": f"Bearer {free_u['access_token']}"}
    pro_h = {"Authorization": f"Bearer {pro_u['access_token']}"}

    # PRO-only routes blocked for FREE
    img_res = client.post(
        "/api/v1/deals/match-from-image",
        headers=free_h,
        json={"product_url": "https://www.amazon.com/dp/B09XS7JWHH"},
    )
    assert img_res.status_code == 403

    split_res = client.post(
        "/api/v1/cart/optimize-split",
        headers=free_h,
        json={
            "store_name": "Amazon",
            "items": [
                {"sku": "A", "title": "Item A", "store_name": "Amazon", "unit_price_usd": 45.0, "quantity": 1},
                {"sku": "B", "title": "Item B", "store_name": "Amazon", "unit_price_usd": 45.0, "quantity": 1},
            ],
        },
    )
    assert split_res.status_code == 403

    # Admin route blocked for PRO
    adm_blocked = client.get("/api/v1/admin/audit-logs", headers=pro_h)
    assert adm_blocked.status_code == 403

    # FREE Watchlist max 3
    for i in range(3):
        w = client.post(
            "/api/v1/watchlist",
            headers=free_h,
            json={
                "product_id": f"p_{i}",
                "sku": f"SKU-{i}",
                "product_title": f"Item {i}",
                "target_price_usd": 50.0,
            },
        )
        assert w.status_code == 201
    w4 = client.post(
        "/api/v1/watchlist",
        headers=free_h,
        json={
            "product_id": "p_4",
            "sku": "SKU-4",
            "product_title": "Item 4",
            "target_price_usd": 50.0,
        },
    )
    assert w4.status_code == 403

    # FREE rate limit 10/day -> 11th returns 429
    reset_rate_limit(free_u["user_id"])
    for _ in range(10):
        s = client.post(
            "/api/v1/deals/search",
            headers=free_h,
            json={"query": "Sony WH-1000XM5"},
        )
        assert s.status_code == 200
    s11 = client.post(
        "/api/v1/deals/search",
        headers=free_h,
        json={"query": "Sony WH-1000XM5"},
    )
    assert s11.status_code == 429


def test_anti_idor_isolation_watchlist_and_checkout(
    client: TestClient, db_session: Session
) -> None:
    """User B cannot delete User A's watchlist item or approve User A's checkout."""
    user_a = create_and_login_user(client, db_session, email="usera@dealscout.ai", tier="PRO")
    user_b = create_and_login_user(client, db_session, email="userb@dealscout.ai", tier="PRO")
    h_a = {"Authorization": f"Bearer {user_a['access_token']}"}
    h_b = {"Authorization": f"Bearer {user_b['access_token']}"}

    wl = client.post(
        "/api/v1/watchlist",
        headers=h_a,
        json={
            "product_id": "prod_sony_xm5",
            "sku": "SONY-WH1000XM5",
            "product_title": "Sony WH-1000XM5",
            "target_price_usd": 250.0,
        },
    )
    assert wl.status_code == 201
    wl_id = wl.json()["id"]

    # User B cannot see User A's watchlist
    list_b = client.get("/api/v1/watchlist", headers=h_b)
    assert list_b.status_code == 200
    assert list_b.json() == []

    # User B cannot delete User A's watchlist (403 + AuditLog)
    del_b = client.delete(f"/api/v1/watchlist/{wl_id}", headers=h_b)
    assert del_b.status_code == 403

    # User A initiates HITL checkout
    chk = client.post(
        "/api/v1/deals/checkout/initiate",
        headers=h_a,
        json={
            "product_id": "prod_sony_xm5",
            "sku": "SONY-WH1000XM5",
            "product_title": "Sony WH-1000XM5",
            "store_name": "Amazon",
            "affiliate_url": "https://www.amazon.com/dp/B09XS7JWHH?tag=dealscoutai-20",
            "total_landed_usd": 300.0,
            "total_landed_ils": 1095.0,
            "applied_coupons": ["HTZ12"],
        },
    )
    assert chk.status_code == 201
    approval_id = chk.json()["approval_id"]

    # User B attempting to approve User A's checkout -> 403
    idor_app = client.post(
        "/api/v1/deals/approve-checkout",
        headers=h_b,
        json={"approval_id": approval_id, "decision": "APPROVED"},
    )
    assert idor_app.status_code == 403

    idor_log = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "IDOR_CHECKOUT_APPROVAL_BLOCKED")
        .first()
    )
    assert idor_log is not None
