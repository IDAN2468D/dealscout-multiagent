"""Shared pytest fixtures with isolated SQLite DB and clean Redis state."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

# Force deterministic test mode before importing app modules
_TEST_TMP_DIR = Path(tempfile.mkdtemp(prefix="dealscout_pytest_"))
_TEST_DB_PATH = _TEST_TMP_DIR / "test_dealscout.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH.as_posix()}"
os.environ["LLM_EXECUTION_MODE"] = "mock"
os.environ["NOTIFY_MODE"] = "mock"

from backend.app.core.redis_client import get_redis_client  # noqa: E402
from backend.app.core.security import hash_password  # noqa: E402
from backend.app.db.models import Base, User, UserBuyerProfile  # noqa: E402
from backend.app.db.session import build_engine, get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.observability.telemetry import telemetry_recorder  # noqa: E402
from backend.app.search.seed_data import seed_price_history_db  # noqa: E402

_test_engine = build_engine(f"sqlite:///{_TEST_DB_PATH.as_posix()}")
TestingSessionLocal = sessionmaker(
    bind=_test_engine, autocommit=False, autoflush=False, expire_on_commit=False
)


def _override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def clean_env() -> Generator[None, None, None]:
    """Reset database tables, seed data, Redis state, and telemetry per test."""
    Base.metadata.drop_all(bind=_test_engine)
    Base.metadata.create_all(bind=_test_engine)

    db = TestingSessionLocal()
    try:
        seed_price_history_db(db)
    finally:
        db.close()

    try:
        get_redis_client().flushall()
    except Exception:
        pass

    telemetry_recorder.clear()
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Provide a direct SQLAlchemy session backed by the test database."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient wired to the isolated test DB."""
    with TestClient(app) as tc:
        yield tc


def create_and_login_user(
    client: TestClient,
    db: Session,
    *,
    email: str,
    password: str = "StrongPass123!",
    full_name: str = "Test Buyer",
    tier: str = "FREE",
    clubs: list[str] | None = None,
) -> dict[str, str]:
    """Helper to register, verify, optionally promote tier, and log in a user."""
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert reg.status_code == 201, reg.text
    reg_data = reg.json()

    ver = client.post(
        "/api/v1/auth/verify-email",
        json={"token": reg_data["verification_token"]},
    )
    assert ver.status_code == 200, ver.text

    if tier != "FREE":
        user_row = db.query(User).filter(User.id == reg_data["user_id"]).first()
        assert user_row is not None
        user_row.tier = tier
        user_row.role = tier
        db.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    if clubs is not None:
        prof = client.put(
            "/api/v1/users/me/profile",
            headers=headers,
            json={
                "preferred_currency": "ILS",
                "ship_to_country": "IL",
                "credit_card_clubs": clubs,
                "min_seller_trust": 75,
                "notification_channels": ["email", "telegram"] if tier != "FREE" else ["email"],
            },
        )
        assert prof.status_code == 200, prof.text

    return {
        "user_id": reg_data["user_id"],
        "email": email,
        "access_token": token,
        "tier": tier,
    }
