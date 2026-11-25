"""Application configuration settings for DealScout AI (dealscout-multiagent)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized settings loaded from environment variables and `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "dealscout-multiagent"
    APP_VERSION: str = "2.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Google Gemini AI Configuration
    GOOGLE_API_KEY: str = ""
    GEMINI_ORCHESTRATOR_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_SUBAGENT_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_TEMPERATURE: float = 0.2
    GEMINI_CONTEXT_CACHE_TTL_SECONDS: int = 3600
    LLM_EXECUTION_MODE: Literal["auto", "live", "mock"] = "auto"

    # Persistence, Search & Streaming
    DATABASE_URL: str = "sqlite:///./dealscout_local.db"
    REDIS_URL: str = "redis://localhost:6381/0"
    ELASTICSEARCH_URL: str = "http://localhost:9202"
    ELASTICSEARCH_INDEX: str = "dealscout_products"
    CHROMA_PERSIST_DIR: str = "./data/chroma"
    CHROMA_COLLECTION: str = "dealscout_promo_policies"
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9095"
    KAFKA_PRICE_DROP_TOPIC: str = "price-drop-events"
    KAFKA_DEAL_ALERTS_TOPIC: str = "deal-alerts"

    # Security, JWT & OAuth2
    JWT_SECRET_KEY: str = "dealscout-dev-secret-key-min-32-chars-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_COOKIE_NAME: str = "dealscout_refresh_token"
    COOKIE_SECURE: bool = False
    GOOGLE_CLIENT_ID: str = "mock-google-client-id"
    GOOGLE_CLIENT_SECRET: str = "mock-google-client-secret"
    GOOGLE_REDIRECT_URI: str = "http://localhost:8020/api/v1/auth/oauth/google/callback"

    # Deterministic Commerce & Guardrail Constants
    DEFAULT_USD_TO_ILS: float = 3.65
    DEFAULT_EUR_TO_ILS: float = 3.95
    ISRAEL_VAT_EXEMPTION_USD: float = 75.00
    ISRAEL_VAT_RATE: float = 0.18
    COUPON_MIN_CROWD_SUCCESS_RATE: float = 0.35
    MIN_TRUST_SCORE_BLOCK: int = 70
    FAKE_DISCOUNT_SPIKE_THRESHOLD: float = 0.15
    MCP_STORE_TIMEOUT_SECONDS: float = 3.0

    # Affiliate & Notifications
    AFFILIATE_TAG_AMAZON: str = "dealscoutai-20"
    AFFILIATE_ID_DEFAULT: str = "dealscout"
    NOTIFY_MODE: Literal["mock", "live"] = "mock"
    TELEGRAM_BOT_TOKEN: str = ""
    SLACK_WEBHOOK_URL: str = ""

    # Observability (OpenTelemetry + Langfuse)
    OTEL_SERVICE_NAME: str = "dealscout-multiagent"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # CORS
    CORS_ORIGINS: list[str] = ["*"]


@lru_cache
def get_settings() -> Settings:
    """Return cached singleton Settings instance."""
    return Settings()


settings = get_settings()
