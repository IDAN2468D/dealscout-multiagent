"""Sprint 4 & 5 tests: Agno Team, SSE TTFT, Multimodal, HITL, Kafka Watcher, Savings & Telemetry."""

from __future__ import annotations

import json
import time
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.agents.deal_orchestrator import create_dealscout_team
from backend.app.db.models import AuditLog
from backend.tests.conftest import create_and_login_user


def _parse_sse(raw: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    cur_evt = "message"
    data_lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("event:"):
            cur_evt = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())
        elif not line.strip() and data_lines:
            events.append({"event": cur_evt, "data": json.loads("\n".join(data_lines))})
            cur_evt = "message"
            data_lines = []
    if data_lines:
        events.append({"event": cur_evt, "data": json.loads("\n".join(data_lines))})
    return events


def test_agno_team_creation_and_health_and_mcp_registry(client: TestClient) -> None:
    """Verify Agno Team uses gemini-3.5-flash-lite and /health + /api/v1/mcp/tools report healthy."""
    team = create_dealscout_team()
    assert team.id == "deal-orchestrator-agent"
    assert team.model.id == "gemini-3.5-flash-lite"
    assert len(team.members) >= 6

    health = client.get("/health")
    assert health.status_code == 200
    hj = health.json()
    assert hj["status"] == "healthy"
    assert hj["model"] == "gemini-3.5-flash-lite"
    assert len(hj["mcp_servers"]) == 3

    tools = client.get("/api/v1/mcp/tools")
    assert tools.status_code == 200
    assert tools.json()["total_servers"] == 3
    assert tools.json()["total_tools"] == 10


def test_sse_deal_search_verdicts_ttft_savings_and_admin_telemetry(
    client: TestClient, db_session: Session
) -> None:
    """Verify SSE TTFT < 1.0s, Fake Discount, 110V warning, Scam block, Savings & Telemetry."""
    pro_u = create_and_login_user(
        client,
        db_session,
        email="sse_pro@dealscout.ai",
        tier="PRO",
        clubs=["HitechZone", "FlyCard"],
    )
    adm_u = create_and_login_user(
        client,
        db_session,
        email="admin@dealscout.ai",
        tier="ADMIN",
    )
    pro_h = {"Authorization": f"Bearer {pro_u['access_token']}"}
    adm_h = {"Authorization": f"Bearer {adm_u['access_token']}"}

    # 1. Sony WH-1000XM5 SSE streaming search
    t0 = time.perf_counter()
    ttft_ms: float | None = None
    lines: list[str] = []
    with client.stream(
        "POST",
        "/api/v1/deals/search",
        headers=pro_h,
        json={"query": "Sony WH-1000XM5"},
    ) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if ttft_ms is None and line.strip():
                ttft_ms = (time.perf_counter() - t0) * 1000.0
            lines.append(line)
    total_ms = (time.perf_counter() - t0) * 1000.0
    assert ttft_ms is not None and ttft_ms < 1000.0, f"TTFT={ttft_ms:.1f}ms >= 1000ms"
    assert total_ms < 4500.0, f"Total={total_ms:.1f}ms >= 4500ms"

    events = _parse_sse("\n".join(lines))
    report = next(e["data"] for e in events if e["event"] == "final_report")
    assert report["deals_count"] >= 2
    # HitechZone club coupon HTZ12 should be applied on Amazon offer
    amazon_deal = next(d for d in report["deals"] if d["store_name"] == "Amazon")
    assert "HTZ12" in amazon_deal["cost_breakdown"]["applied_coupons"]
    assert amazon_deal["cost_breakdown"]["vat_applied"] is True

    # 2. Ninja Creami 110V Trap
    r_ninja = client.post(
        "/api/v1/deals/search",
        headers=pro_h,
        json={"query": "Ninja Creami Deluxe"},
    )
    ninja_rep = next(
        e["data"] for e in _parse_sse(r_ninja.text) if e["event"] == "final_report"
    )
    us_offer = next(d for d in ninja_rep["deals"] if "110V" in d["product_title"] or d["store_name"] == "Amazon")
    assert us_offer["discount_verdict"] == "INCOMPATIBLE_SPEC"
    assert len(us_offer["compatibility_warnings"]) >= 1

    # 3. Samsung T7 2TB Fake Discount Trap
    r_t7 = client.post(
        "/api/v1/deals/search",
        headers=pro_h,
        json={"query": "Samsung T7 Shield 2TB"},
    )
    t7_rep = next(
        e["data"] for e in _parse_sse(r_t7.text) if e["event"] == "final_report"
    )
    assert any(d["discount_verdict"] == "FAKE_DISCOUNT" for d in t7_rep["deals"])

    # 4. AirPods Pro 2 Scam Seller + Prompt Injection Trap
    r_app = client.post(
        "/api/v1/deals/search",
        headers=pro_h,
        json={"query": "Apple AirPods Pro 2"},
    )
    app_rep = next(
        e["data"] for e in _parse_sse(r_app.text) if e["event"] == "final_report"
    )
    assert app_rep["blocked_count"] >= 1
    assert all(d["seller_name"] != "SuperCheapElectro99" for d in app_rep["deals"])

    # 5. PRO Multimodal Image / URL Match
    img_match = client.post(
        "/api/v1/deals/match-from-image",
        headers=pro_h,
        json={"product_url": "https://www.amazon.com/dp/B09XS7JWHH"},
    )
    assert img_match.status_code == 200
    assert img_match.json()["detected_sku"] == "SONY-WH1000XM5"
    assert len(img_match.json()["matched_deals"]) >= 1

    # 6. PRO Cart Split Optimizer logs TAX_SPLIT savings
    split_res = client.post(
        "/api/v1/cart/optimize-split",
        headers=pro_h,
        json={
            "store_name": "ASOS",
            "items": [
                {"sku": "NIKE-PEG41", "title": "Nike Pegasus 41", "store_name": "ASOS", "unit_price_usd": 58.0, "quantity": 1},
                {"sku": "ADIDAS-UB5", "title": "Adidas Ultraboost 5", "store_name": "ASOS", "unit_price_usd": 64.0, "quantity": 1},
            ],
            "shipping_per_package_usd": 8.0,
            "free_shipping_threshold_usd": 49.0,
            "ship_to_country": "IL",
        },
    )
    assert split_res.status_code == 200
    assert split_res.json()["saved_ils"] > 0

    savings = client.get("/api/v1/users/me/savings", headers=pro_h)
    assert savings.status_code == 200
    assert savings.json()["total_saved_ils"] > 0
    assert "TAX_SPLIT" in savings.json()["breakdown_by_source"]

    # 7. Admin Telemetry & Audit Logs
    tel = client.get("/api/v1/admin/telemetry", headers=adm_h)
    assert tel.status_code == 200
    assert tel.json()["db_totals"]["total_searches"] >= 4
    assert tel.json()["total_otel_spans"] >= 1


def test_hitl_checkout_and_kafka_price_drop_alert(
    client: TestClient, db_session: Session
) -> None:
    """Verify HITL PENDING_APPROVAL -> APPROVED and Kafka price-drop alert delivery."""
    pro_u = create_and_login_user(
        client,
        db_session,
        email="kafka_pro@dealscout.ai",
        tier="PRO",
        clubs=["HitechZone"],
    )
    h = {"Authorization": f"Bearer {pro_u['access_token']}"}

    # Add Watchlist target
    wl = client.post(
        "/api/v1/watchlist",
        headers=h,
        json={
            "product_id": "prod_sony_xm5",
            "sku": "SONY-WH1000XM5",
            "product_title": "Sony WH-1000XM5",
            "store_name": "Amazon",
            "target_price_usd": 250.0,
        },
    )
    assert wl.status_code == 201

    # Trigger Kafka price drop below $250
    drop = client.post(
        "/api/v1/deals/price-drop",
        headers=h,
        json={
            "product_id": "prod_sony_xm5",
            "sku": "SONY-WH1000XM5",
            "store_name": "Amazon",
            "new_price_usd": 235.0,
        },
    )
    assert drop.status_code == 200
    assert drop.json()["total_alerts_dispatched"] >= 1
    assert len(drop.json()["user_alerts"]) == 1
    assert "telegram" in drop.json()["user_alerts"][0]["channels"]

    # Initiate HITL checkout -> PENDING_APPROVAL -> APPROVED
    init_res = client.post(
        "/api/v1/deals/checkout/initiate",
        headers=h,
        json={
            "product_id": "prod_sony_xm5",
            "sku": "SONY-WH1000XM5",
            "product_title": "Sony WH-1000XM5",
            "store_name": "Amazon",
            "affiliate_url": "https://www.amazon.com/dp/B09XS7JWHH?tag=dealscoutai-20",
            "total_landed_usd": 235.0,
            "total_landed_ils": 857.75,
            "applied_coupons": ["HTZ12"],
        },
    )
    assert init_res.status_code == 201
    assert init_res.json()["status"] == "PENDING_APPROVAL"
    approval_id = init_res.json()["approval_id"]

    app_res = client.post(
        "/api/v1/deals/approve-checkout",
        headers=h,
        json={"approval_id": approval_id, "decision": "APPROVED", "user_note": "Ship to office"},
    )
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "APPROVED"

    decision_log = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "CHECKOUT_APPROVED")
        .first()
    )
    assert decision_log is not None
