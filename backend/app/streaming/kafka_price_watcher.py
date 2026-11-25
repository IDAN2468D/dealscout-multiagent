"""Kafka Price Drop Watcher (`price-drop-events` -> `deal-alerts`) with user isolation."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.app.api.schemas import UserBuyerProfileUpdate, UserContext
from backend.app.core.config import settings
from backend.app.db.models import User, UserBuyerProfile, Watchlist

logger = logging.getLogger(__name__)


def _get_fx_rate_safe() -> float:
    try:
        from backend.app.core.redis_client import get_fx_rate

        return float(get_fx_rate("USD", "ILS"))
    except Exception:
        return float(settings.DEFAULT_USD_TO_ILS)


def _build_user_context_for_owner(db: Session, user_id: str) -> UserContext:
    """Load verified User + UserBuyerProfile for a watchlist owner."""
    user = db.query(User).filter(User.id == user_id).first()
    profile_row = (
        db.query(UserBuyerProfile).filter(UserBuyerProfile.user_id == user_id).first()
    )
    if profile_row is not None:
        buyer_profile = UserBuyerProfileUpdate(
            preferred_currency=profile_row.preferred_currency,
            ship_to_country=profile_row.ship_to_country,
            credit_card_clubs=list(profile_row.credit_card_clubs_json or []),
            preferred_stores=list(profile_row.preferred_stores_json or []),
            min_seller_trust=profile_row.min_seller_trust,
            notification_channels=list(
                profile_row.notification_channels_json or ["email"]
            ),
            telegram_chat_id=profile_row.telegram_chat_id,
        )
    else:
        buyer_profile = UserBuyerProfileUpdate()

    return UserContext(
        user_id=user_id,
        email=user.email if user else f"{user_id}@dealscout.local",
        full_name=user.full_name if user else "",
        role=user.role if user else "FREE",
        tier=user.tier if user else "FREE",
        is_verified=user.is_verified if user else True,
        buyer_profile=buyer_profile,
    )


async def trigger_price_drop_event(
    db: Session,
    product_id: str,
    sku: str,
    store_name: str,
    new_price_usd: float,
) -> list[dict[str, Any]]:
    """Match active Watchlists against a price drop and dispatch user-isolated alerts."""
    fx_rate = _get_fx_rate_safe()

    active_rows = (
        db.query(Watchlist)
        .filter(
            Watchlist.is_active.is_(True),
            (Watchlist.product_id == product_id) | (Watchlist.sku == sku),
        )
        .all()
    )

    from backend.app.mcp_servers import notify_mcp

    dispatched_alerts: list[dict[str, Any]] = []

    for wl in active_rows:
        if wl.store_name and wl.store_name.strip().lower() != store_name.strip().lower():
            continue

        threshold_usd: float | None = wl.target_price_usd
        if threshold_usd is None and wl.target_price_ils is not None:
            threshold_usd = round(wl.target_price_ils / fx_rate, 2)

        if threshold_usd is None:
            continue

        if new_price_usd > threshold_usd:
            continue

        wl.last_seen_price_usd = round(float(new_price_usd), 2)
        db.add(wl)

        owner_ctx = _build_user_context_for_owner(db, wl.user_id)
        new_price_ils = round(float(new_price_usd) * fx_rate, 2)

        alert_result = notify_mcp.send_price_alert(
            ctx=owner_ctx,
            resource_owner_id=wl.user_id,
            product_id=wl.product_id,
            sku=wl.sku,
            product_title=wl.product_title,
            store_name=store_name,
            new_price_usd=round(float(new_price_usd), 2),
            new_price_ils=new_price_ils,
            db=db,
        )

        dispatched_alerts.append(
            {
                "watchlist_id": wl.id,
                "user_id": wl.user_id,
                "user_tier": owner_ctx.tier,
                "product_id": wl.product_id,
                "sku": wl.sku,
                "store_name": store_name,
                "new_price_usd": round(float(new_price_usd), 2),
                "new_price_ils": new_price_ils,
                "target_price_usd": threshold_usd,
                "channels": alert_result.get("channels", ["email"]),
                "status": alert_result.get("status", "DISPATCHED"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    db.commit()
    return dispatched_alerts


class KafkaPriceWatcher:
    """Async Kafka producer/consumer for `price-drop-events` and `deal-alerts`."""

    def __init__(
        self,
        bootstrap_servers: str | None = None,
        price_drop_topic: str | None = None,
        deal_alerts_topic: str | None = None,
    ) -> None:
        self.bootstrap_servers = bootstrap_servers or settings.KAFKA_BOOTSTRAP_SERVERS
        self.price_drop_topic = price_drop_topic or settings.KAFKA_PRICE_DROP_TOPIC
        self.deal_alerts_topic = deal_alerts_topic or settings.KAFKA_DEAL_ALERTS_TOPIC
        self._producer: Any | None = None
        self._consumer: Any | None = None
        self._running = False
        self.in_memory_alerts: list[dict[str, Any]] = []

    async def start_producer(self) -> bool:
        """Start AIOKafkaProducer with graceful fallback when Kafka is offline."""
        try:
            from aiokafka import AIOKafkaProducer

            producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await asyncio.wait_for(producer.start(), timeout=2.0)
            self._producer = producer
            return True
        except Exception as exc:
            logger.info("Kafka producer running in offline fallback mode: %s", exc)
            self._producer = None
            return False

    async def stop(self) -> None:
        """Cleanly stop Kafka producer and consumer."""
        self._running = False
        if self._consumer is not None:
            try:
                await self._consumer.stop()
            except Exception:
                pass
            self._consumer = None
        if self._producer is not None:
            try:
                await self._producer.stop()
            except Exception:
                pass
            self._producer = None

    async def publish_price_drop(
        self,
        product_id: str,
        sku: str,
        store_name: str,
        new_price_usd: float,
    ) -> dict[str, Any]:
        """Publish a raw price-drop event to `price-drop-events`."""
        payload = {
            "product_id": product_id,
            "sku": sku,
            "store_name": store_name,
            "new_price_usd": round(float(new_price_usd), 2),
            "published_at": datetime.now(timezone.utc).isoformat(),
        }
        if self._producer is not None:
            try:
                await self._producer.send_and_wait(self.price_drop_topic, payload)
            except Exception as exc:
                logger.warning("Kafka send_and_wait failed: %s", exc)
        return payload

    async def handle_price_drop_event(
        self,
        db: Session,
        product_id: str,
        sku: str,
        store_name: str,
        new_price_usd: float,
    ) -> list[dict[str, Any]]:
        """Process a price drop, trigger isolated alerts, and publish to `deal-alerts`."""
        alerts = await trigger_price_drop_event(
            db=db,
            product_id=product_id,
            sku=sku,
            store_name=store_name,
            new_price_usd=new_price_usd,
        )
        for alert in alerts:
            self.in_memory_alerts.append(alert)
            if self._producer is not None:
                try:
                    await self._producer.send_and_wait(self.deal_alerts_topic, alert)
                except Exception as exc:
                    logger.warning("Failed publishing to %s: %s", self.deal_alerts_topic, exc)
        return alerts

    async def consume_forever(self, db_factory) -> None:
        """Consume `price-drop-events` via AIOKafkaConsumer and dispatch alerts."""
        try:
            from aiokafka import AIOKafkaConsumer

            consumer = AIOKafkaConsumer(
                self.price_drop_topic,
                bootstrap_servers=self.bootstrap_servers,
                group_id="dealscout-price-watcher",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
            )
            await asyncio.wait_for(consumer.start(), timeout=3.0)
            self._consumer = consumer
            self._running = True
        except Exception as exc:
            logger.info("Kafka consumer not started (offline mode): %s", exc)
            return

        try:
            async for msg in self._consumer:
                if not self._running:
                    break
                data = msg.value or {}
                db = db_factory()
                try:
                    await self.handle_price_drop_event(
                        db=db,
                        product_id=str(data.get("product_id", "")),
                        sku=str(data.get("sku", "")),
                        store_name=str(data.get("store_name", "")),
                        new_price_usd=float(data.get("new_price_usd", 0.0)),
                    )
                finally:
                    db.close()
        finally:
            await self.stop()


kafka_price_watcher = KafkaPriceWatcher()
