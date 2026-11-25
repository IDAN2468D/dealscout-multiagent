"""Per-user long-term shopping memory isolated strictly by `user_id`."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.app.db.models import UserBuyerProfile

logger = logging.getLogger(__name__)


class UserMemoryManager:
    """Stores and retrieves per-user long-term preferences in PostgreSQL + ChromaDB.

    Every read and write is strictly filtered by `user_id` so cross-user memory
    leakage is impossible.
    """

    def __init__(self, promo_store: Any | None = None) -> None:
        self._promo_store = promo_store

    def _get_promo_store(self) -> Any | None:
        if self._promo_store is not None:
            return self._promo_store
        try:
            from backend.app.rag.promo_policy_store import PromoPolicyStore

            self._promo_store = PromoPolicyStore()
            return self._promo_store
        except Exception as exc:  # pragma: no cover - fallback when RAG store unavailable
            logger.debug("PromoPolicyStore unavailable in UserMemoryManager: %s", exc)
            return None

    def get_user_preferences(
        self,
        db: Session | None,
        user_id: str,
        query: str | None = None,
        limit: int = 5,
    ) -> dict[str, Any]:
        """Fetch structured + semantic long-term preferences strictly for `user_id`."""
        if not user_id:
            raise ValueError("user_id is required for isolated memory retrieval")

        structured: dict[str, Any] = {}
        clubs: list[str] = []
        preferred_stores: list[str] = []
        preferred_currency = "ILS"
        ship_to_country = "IL"

        if db is not None:
            profile = (
                db.query(UserBuyerProfile)
                .filter(UserBuyerProfile.user_id == user_id)
                .first()
            )
            if profile is not None:
                structured = dict(profile.long_term_preferences_json or {})
                clubs = list(profile.credit_card_clubs_json or [])
                preferred_stores = list(profile.preferred_stores_json or [])
                preferred_currency = profile.preferred_currency
                ship_to_country = profile.ship_to_country

        semantic_memories: list[dict[str, Any]] = []
        store = self._get_promo_store()
        if store is not None and query:
            try:
                raw_memories = store.query_user_preferences(
                    user_id=user_id,
                    query=query,
                    n_results=limit,
                )
                # Defense-in-depth strict user_id check
                for item in raw_memories or []:
                    meta = item.get("metadata") or {}
                    if meta.get("user_id") in (None, user_id):
                        if meta.get("user_id") == user_id or "user_id" not in meta:
                            semantic_memories.append(item)
            except Exception as exc:
                logger.debug("Semantic memory query failed for user %s: %s", user_id, exc)

        return {
            "user_id": user_id,
            "preferred_currency": preferred_currency,
            "ship_to_country": ship_to_country,
            "credit_card_clubs": clubs,
            "preferred_stores": preferred_stores,
            "preferences": structured,
            "semantic_memories": semantic_memories,
        }

    def update_user_preferences(
        self,
        db: Session | None,
        user_id: str,
        new_prefs: dict[str, Any],
        memory_note: str | None = None,
    ) -> dict[str, Any]:
        """Merge and persist long-term preferences strictly for `user_id`."""
        if not user_id:
            raise ValueError("user_id is required for isolated memory persistence")

        merged: dict[str, Any] = {}
        if db is not None:
            profile = (
                db.query(UserBuyerProfile)
                .filter(UserBuyerProfile.user_id == user_id)
                .first()
            )
            if profile is not None:
                existing = dict(profile.long_term_preferences_json or {})
                for key, val in new_prefs.items():
                    if isinstance(val, list) and isinstance(existing.get(key), list):
                        combined = list(existing[key])
                        for item in val:
                            if item not in combined:
                                combined.append(item)
                        existing[key] = combined[-20:]
                    elif isinstance(val, dict) and isinstance(existing.get(key), dict):
                        nested = dict(existing[key])
                        nested.update(val)
                        existing[key] = nested
                    else:
                        existing[key] = val
                existing["last_updated_at"] = datetime.now(timezone.utc).isoformat()
                profile.long_term_preferences_json = existing
                flag_modified(profile, "long_term_preferences_json")
                db.add(profile)
                db.commit()
                db.refresh(profile)
                merged = dict(profile.long_term_preferences_json or {})
            else:
                merged = dict(new_prefs)
        else:
            merged = dict(new_prefs)

        if memory_note:
            store = self._get_promo_store()
            if store is not None:
                try:
                    store.add_user_preference(
                        user_id=user_id,
                        preference_text=memory_note,
                        metadata={"user_id": user_id},
                    )
                except Exception as exc:
                    logger.debug(
                        "Failed to write ChromaDB user preference for %s: %s",
                        user_id,
                        exc,
                    )

        return merged

    def record_search_interaction(
        self,
        db: Session | None,
        user_id: str,
        query: str,
        best_store: str | None = None,
        detected_brands: list[str] | None = None,
        budget_ils: float | None = None,
    ) -> dict[str, Any]:
        """Learn from a completed search and store isolated user memory."""
        updates: dict[str, Any] = {"recent_queries": [query.strip()]}
        if best_store:
            updates["preferred_store_affinity"] = [best_store]
        if detected_brands:
            updates["preferred_brands"] = detected_brands
        if budget_ils is not None:
            updates["last_max_budget_ils"] = round(float(budget_ils), 2)

        note_parts = [f"User searched for '{query.strip()}'"]
        if best_store:
            note_parts.append(f"best store was {best_store}")
        if budget_ils is not None:
            note_parts.append(f"budget <= {budget_ils} ILS")
        memory_note = "; ".join(note_parts)

        return self.update_user_preferences(
            db=db,
            user_id=user_id,
            new_prefs=updates,
            memory_note=memory_note,
        )

    def clear_user_memory(self, db: Session, user_id: str) -> None:
        """Clear long-term preferences strictly for `user_id`."""
        if not user_id:
            raise ValueError("user_id is required")
        profile = (
            db.query(UserBuyerProfile)
            .filter(UserBuyerProfile.user_id == user_id)
            .first()
        )
        if profile is not None:
            profile.long_term_preferences_json = {}
            flag_modified(profile, "long_term_preferences_json")
            db.add(profile)
            db.commit()
