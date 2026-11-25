"""FastAPI application entrypoint for DealScout AI (dealscout-multiagent)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.app.api import admin_routes, auth_routes, deal_routes, user_routes
from backend.app.core.config import settings
from backend.app.core.redis_client import is_using_fake_redis, ping as redis_ping
from backend.app.db.session import SessionLocal, init_db
from backend.app.rag.promo_policy_store import (
    GeminiContextCacheManager,
    PromoPolicyStore,
)
from backend.app.search.elasticsearch_catalog import ElasticsearchCatalog
from backend.app.search.seed_data import seed_price_history_db
from backend.app.streaming.kafka_price_watcher import kafka_price_watcher

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize DB tables, seed price history, warm RAG + Context Cache & ES catalog."""
    init_db()
    db = SessionLocal()
    try:
        seed_price_history_db(db)
    finally:
        db.close()

    try:
        catalog = ElasticsearchCatalog()
        catalog.index_seed_products()
    except Exception as exc:
        logger.debug("Elasticsearch startup indexing skipped: %s", exc)

    try:
        policy_store = PromoPolicyStore()
        GeminiContextCacheManager(policy_store=policy_store).create_or_get_cache()
    except Exception as exc:
        logger.debug("RAG/Context Cache warmup skipped: %s", exc)

    try:
        await kafka_price_watcher.start_producer()
    except Exception as exc:
        logger.debug("Kafka producer startup skipped: %s", exc)

    yield

    try:
        await kafka_price_watcher.stop()
    except Exception:
        pass


app = FastAPI(
    title="DealScout AI (dealscout-multiagent)",
    version=settings.APP_VERSION,
    description=(
        "Multi-Agent E-Commerce Deal Finder, Coupon Verifier, Fake-Discount Detector, "
        "and Deterministic Israel VAT Cart-Split Optimizer powered by gemini-3.5-flash-lite."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(user_routes.router)
app.include_router(deal_routes.router)
app.include_router(admin_routes.router)

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", include_in_schema=False)
def serve_frontend():
    """Serve the RTL Hebrew DealScout AI dashboard."""
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse(
        {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs",
        }
    )


@app.get("/health")
def health_check() -> dict[str, Any]:
    """Report runtime health across DB, Redis, Elasticsearch, ChromaDB, Kafka, and MCP."""
    db_ok = False
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        finally:
            db.close()
    except Exception:
        db_ok = False

    redis_ok = redis_ping()
    es_live = False
    try:
        es_live = ElasticsearchCatalog().is_live()
    except Exception:
        es_live = False

    chroma_count = 0
    try:
        chroma_count = PromoPolicyStore()._policies.count()
    except Exception:
        chroma_count = 0

    return {
        "status": "healthy" if db_ok and redis_ok else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "model": settings.GEMINI_ORCHESTRATOR_MODEL,
        "subagent_model": settings.GEMINI_SUBAGENT_MODEL,
        "temperature": settings.GEMINI_TEMPERATURE,
        "context_cache_ttl_seconds": settings.GEMINI_CONTEXT_CACHE_TTL_SECONDS,
        "services": {
            "database": "up" if db_ok else "down",
            "redis": "in_memory_fallback" if is_using_fake_redis() else "up",
            "elasticsearch": "live" if es_live else "fuzzy_fallback",
            "chromadb_docs": chroma_count,
            "kafka_bootstrap": settings.KAFKA_BOOTSTRAP_SERVERS,
        },
        "mcp_servers": ["ecommerce-mcp", "coupons-mcp", "notify-mcp"],
    }


@app.get("/api/v1/mcp/tools")
def list_mcp_tools() -> dict[str, Any]:
    """List the 3 isolated FastMCP servers and their 10 registered tools."""
    servers = {
        "ecommerce-mcp": {
            "access": "READ",
            "tools": [
                "search_store_offers",
                "get_product_details",
                "check_stock_shipping",
                "fetch_product_reviews",
            ],
        },
        "coupons-mcp": {
            "access": "READ",
            "tools": [
                "find_store_coupons",
                "validate_coupon_dry_run",
                "check_stacking_rules",
                "get_crowd_score",
            ],
        },
        "notify-mcp": {
            "access": "WRITE",
            "requires_user_ownership": True,
            "tools": [
                "send_price_alert",
                "dispatch_checkout_approval_card",
            ],
        },
    }
    total_tools = sum(len(v["tools"]) for v in servers.values())
    return {
        "total_servers": len(servers),
        "total_tools": total_tools,
        "servers": servers,
    }
