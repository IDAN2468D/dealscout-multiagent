"""ChromaDB Promo Policy RAG Store + Gemini Context Caching Manager.

Uses an offline deterministic hashing EmbeddingFunction so ChromaDB works with
zero external model downloads or network dependencies.
"""

from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from backend.app.core.config import settings

_TOKEN_RE = re.compile(r"[a-z0-9\u0590-\u05ff]+", re.IGNORECASE)

STATIC_CLUB_AND_STORE_POLICIES: list[dict[str, Any]] = [
    {
        "id": "club_hitechzone",
        "kind": "club",
        "club": "HitechZone",
        "store": "ALL",
        "text": (
            "HitechZone (HTZ12) Israeli tech-worker credit club policy: grants up to 12% instant "
            "discount or cashback on Amazon, KSP, and partner electronics stores. Valid on orders "
            "over $40; stackable with merchant markdowns but not with other bank club codes."
        ),
    },
    {
        "id": "club_hever",
        "kind": "club",
        "club": "Hever",
        "store": "ALL",
        "text": (
            "Hever (HEVER15) Israeli consumer club policy: provides 15% discount vouchers at KSP, "
            "Terminal X, and ASOS partner gift cards up to 400 ILS monthly benefit cap."
        ),
    },
    {
        "id": "club_flycard",
        "kind": "club",
        "club": "FlyCard",
        "store": "ALL",
        "text": (
            "FlyCard (FLYCARD10) Israeli airline credit card club policy: 10% promo discount plus "
            "El Al frequent-flyer points on Amazon, eBay, and travel gear orders above $50."
        ),
    },
    {
        "id": "club_max",
        "kind": "club",
        "club": "Max",
        "store": "ALL",
        "text": (
            "Max (MAX8) credit card club policy: 8% instant discount on AliExpress, ASOS, and "
            "Amazon selected promos, capped at $25 per checkout."
        ),
    },
    {
        "id": "club_isracard",
        "kind": "club",
        "club": "Isracard",
        "store": "ALL",
        "text": (
            "Isracard (ISRA10) Top/Mastercard Day policy: 10% cashback or voucher discount at KSP "
            "and Terminal X, plus monthly global online shopping cashback rebates."
        ),
    },
    {
        "id": "store_amazon",
        "kind": "store",
        "club": "NONE",
        "store": "Amazon",
        "text": (
            "Amazon coupon stacking rules: supports 1 store/clip promo code + 1 eligible credit-card "
            "bank/club promo (e.g. HTZ12 or FLYCARD10). Multiple percentage promo codes cannot stack. "
            "Orders shipped to Israel above $75.00 net item value incur 18% import VAT."
        ),
    },
    {
        "id": "store_aliexpress",
        "kind": "store",
        "club": "NONE",
        "store": "AliExpress",
        "text": (
            "AliExpress coupon stacking rules: supports stacking 1 Seller Store Coupon + 1 AliExpress "
            "Platform Promo Code (e.g. WELCOME10 / SAVE15) + 1 Credit Card Club benefit (MAX8). "
            "Split packages under $75.00 avoid 18% Israel import VAT."
        ),
    },
    {
        "id": "store_asos",
        "kind": "store",
        "club": "NONE",
        "store": "ASOS",
        "text": (
            "ASOS coupon stacking rules: strictly 1 promo code per checkout (e.g. ASOS20 or WELCOME10). "
            "Promo codes cannot be combined with student codes, though Hever/Max gift vouchers apply as payment."
        ),
    },
    {
        "id": "store_ebay",
        "kind": "store",
        "club": "NONE",
        "store": "eBay",
        "text": (
            "eBay coupon stacking rules: maximum 1 eBay platform promo code per order; eligible for "
            "external credit-card club cashback (FlyCard, HitechZone). Check seller trust >= 70."
        ),
    },
    {
        "id": "store_ksp",
        "kind": "store",
        "club": "NONE",
        "store": "KSP",
        "text": (
            "KSP Israel local store rules: prices already include 18% Israeli VAT and local 230V Type-H "
            "warranty. Accepts 1 credit-card club voucher (Hever/Isracard/HitechZone) OR 1 site promo code."
        ),
    },
    {
        "id": "store_terminal_x",
        "kind": "store",
        "club": "NONE",
        "store": "Terminal X",
        "text": (
            "Terminal X Israel store rules: accepts Hever (HEVER15) or Isracard (ISRA10) club benefits; "
            "stackable with Dream Card loyalty points up to 20% combined discount cap."
        ),
    },
]


class DeterministicHashEmbeddingFunction(EmbeddingFunction[Documents]):
    """Lightweight offline L2-normalized hashing embedding function for ChromaDB."""

    def __init__(self, dim: int = 128) -> None:
        self.dim = dim

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = _TOKEN_RE.findall((text or "").lower())
        if not tokens:
            vec[0] = 1.0
            return vec

        # Unigrams + bigrams for robust lexical semantic overlap
        features = list(tokens) + [
            f"{tokens[i]}_{tokens[i + 1]}" for i in range(len(tokens) - 1)
        ]
        for feat in features:
            digest = hashlib.sha256(feat.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], "little") % self.dim
            sign = 1.0 if (digest[4] & 1) == 0 else -1.0
            vec[idx] += sign

        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def __call__(self, input: Documents) -> Embeddings:
        return [self._embed_one(doc) for doc in input]

    def embed_query(self, input: Documents) -> Embeddings:
        return self.__call__(input)

    @staticmethod
    def name() -> str:
        return "dealscout_deterministic_hash_v1"

    def get_config(self) -> dict[str, Any]:
        return {"dim": self.dim}

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> "DeterministicHashEmbeddingFunction":
        return DeterministicHashEmbeddingFunction(dim=int(config.get("dim", 128)))


_SHARED_EPHEMERAL_CLIENT: chromadb.ClientAPI | None = None


def _get_default_chroma_client(persist_dir: str | None = None) -> chromadb.ClientAPI:
    global _SHARED_EPHEMERAL_CLIENT
    if persist_dir:
        try:
            return chromadb.PersistentClient(path=persist_dir)
        except Exception:
            pass
    if _SHARED_EPHEMERAL_CLIENT is None:
        _SHARED_EPHEMERAL_CLIENT = chromadb.EphemeralClient()
    return _SHARED_EPHEMERAL_CLIENT


class PromoPolicyStore:
    """ChromaDB vector store for Israeli credit-card clubs, store stacking rules, and user memory."""

    def __init__(
        self,
        persist_dir: str | None = None,
        collection_name: str | None = None,
    ) -> None:
        self._client = _get_default_chroma_client(persist_dir=persist_dir)
        self._ef = DeterministicHashEmbeddingFunction(dim=128)
        self._policy_collection_name = collection_name or settings.CHROMA_COLLECTION
        self._prefs_collection_name = f"{self._policy_collection_name}_user_prefs"

        self._policies = self._client.get_or_create_collection(
            name=self._policy_collection_name,
            embedding_function=self._ef,
        )
        self._user_prefs = self._client.get_or_create_collection(
            name=self._prefs_collection_name,
            embedding_function=self._ef,
        )
        self._seed_policies()

    def _seed_policies(self) -> None:
        existing = self._policies.get()
        existing_ids = set(existing.get("ids") or [])
        missing = [p for p in STATIC_CLUB_AND_STORE_POLICIES if p["id"] not in existing_ids]
        if not missing:
            return

        self._policies.upsert(
            ids=[p["id"] for p in missing],
            documents=[p["text"] for p in missing],
            metadatas=[
                {"kind": p["kind"], "club": p["club"], "store": p["store"]}
                for p in missing
            ],
        )

    def query_club_policies(
        self,
        clubs: list[str],
        store_name: str,
        query: str = "",
        n_results: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant credit-card club and store coupon stacking policies."""
        clubs_norm = [c.strip() for c in (clubs or []) if c and c.strip()]
        store_clean = (store_name or "").strip()
        search_text = " ".join(
            part for part in [store_clean, " ".join(clubs_norm), query, "coupon stacking policy"] if part
        )

        total_docs = self._policies.count()
        if total_docs == 0:
            return []

        results = self._policies.query(
            query_texts=[search_text],
            n_results=min(max(n_results, 1), total_docs),
        )
        ids = (results.get("ids") or [[]])[0]
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        dists = (results.get("distances") or [[]])[0]

        clubs_lower = {c.lower() for c in clubs_norm}
        store_lower = store_clean.lower()

        ranked: list[dict[str, Any]] = []
        for idx, doc_id in enumerate(ids):
            meta = metas[idx] if idx < len(metas) else {}
            doc_text = docs[idx] if idx < len(docs) else ""
            dist = float(dists[idx]) if idx < len(dists) else 1.0
            boost = 0.0
            if str(meta.get("club", "")).lower() in clubs_lower:
                boost += 0.5
            if str(meta.get("store", "")).lower() == store_lower:
                boost += 0.5
            ranked.append(
                {
                    "id": doc_id,
                    "text": doc_text,
                    "metadata": meta,
                    "score": round(max(0.0, 1.0 - dist) + boost, 4),
                }
            )

        ranked.sort(key=lambda item: item["score"], reverse=True)
        return ranked[:n_results]

    def add_user_preference(
        self,
        user_id: str,
        preference_text: str,
        category: str = "general",
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Store a long-term preference document strictly scoped to ``user_id``."""
        if not user_id:
            raise ValueError("user_id is required for user-scoped memory")

        doc_hash = hashlib.sha1(f"{user_id}:{category}:{preference_text}".encode("utf-8")).hexdigest()[:16]
        doc_id = f"pref_{user_id}_{doc_hash}"
        meta: dict[str, Any] = {
            "user_id": str(user_id),
            "category": category,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if metadata:
            for k, v in metadata.items():
                if k != "user_id" and isinstance(v, (str, int, float, bool)):
                    meta[k] = v

        self._user_prefs.upsert(
            ids=[doc_id],
            documents=[preference_text],
            metadatas=[meta],
        )
        return doc_id

    def query_user_preferences(
        self,
        user_id: str,
        query: str,
        n_results: int = 5,
    ) -> list[dict[str, Any]]:
        """Query long-term preferences strictly isolated by ``where={'user_id': user_id}``."""
        if not user_id:
            return []

        user_docs = self._user_prefs.get(where={"user_id": str(user_id)})
        user_count = len(user_docs.get("ids") or [])
        if user_count == 0:
            return []

        results = self._user_prefs.query(
            query_texts=[query or "shopping preferences"],
            n_results=min(max(n_results, 1), user_count),
            where={"user_id": str(user_id)},
        )
        ids = (results.get("ids") or [[]])[0]
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        dists = (results.get("distances") or [[]])[0]

        items: list[dict[str, Any]] = []
        for idx, doc_id in enumerate(ids):
            meta = metas[idx] if idx < len(metas) else {}
            if meta.get("user_id") != str(user_id):
                continue
            items.append(
                {
                    "id": doc_id,
                    "text": docs[idx] if idx < len(docs) else "",
                    "metadata": meta,
                    "score": round(max(0.0, 1.0 - float(dists[idx])) if idx < len(dists) else 0.0, 4),
                }
            )
        return items

    @staticmethod
    def get_all_static_policy_text() -> str:
        """Render all static credit-card club and store stacking rules into one cacheable bundle."""
        lines = ["DealScout AI Static Credit-Card Club & Store Stacking Policy Bundle:"]
        for entry in STATIC_CLUB_AND_STORE_POLICIES:
            lines.append(f"- [{entry['id']}] {entry['text']}")
        return "\n".join(lines)


class GeminiContextCacheManager:
    """Manages Gemini Context Caching for static promo policies and system instructions."""

    SYSTEM_INSTRUCTION = (
        "You are DealScout AI's Coupon Hunter & Clubs RAG Agent running on gemini-3.5-flash-lite. "
        "Prioritize the authenticated user's Israeli credit-card clubs (HitechZone, Hever, FlyCard, "
        "Max, Isracard), enforce store coupon stacking rules, suppress coupons with crowd "
        "success_rate < 0.35, and never invent discounts or bypass deterministic Python math."
    )

    def __init__(self, policy_store: PromoPolicyStore | None = None) -> None:
        self._store = policy_store
        self._cache_name: str | None = None
        self._mode: str = "uninitialized"
        self._created_at: datetime | None = None
        self._expires_at: datetime | None = None
        self._last_error: str | None = None
        self._bundle_text: str = self.build_static_bundle()
        self._bundle_hash: str = hashlib.sha256(self._bundle_text.encode("utf-8")).hexdigest()[:16]

    def build_static_bundle(self) -> str:
        policy_text = (
            self._store.get_all_static_policy_text()
            if self._store is not None
            else PromoPolicyStore.get_all_static_policy_text()
        )
        return f"{self.SYSTEM_INSTRUCTION}\n\n{policy_text}"

    def create_or_get_cache(self, force_refresh: bool = False) -> dict[str, Any]:
        """Create or reuse a Gemini cached content entry, falling back cleanly if offline/mock."""
        now = datetime.now(timezone.utc)
        if (
            not force_refresh
            and self._expires_at is not None
            and self._expires_at > now
            and self._mode != "uninitialized"
        ):
            return self.get_cache_status()

        ttl_seconds = int(settings.GEMINI_CONTEXT_CACHE_TTL_SECONDS)
        model_id = settings.GEMINI_SUBAGENT_MODEL
        self._created_at = now
        self._expires_at = now + timedelta(seconds=ttl_seconds)

        if settings.GOOGLE_API_KEY and settings.LLM_EXECUTION_MODE != "mock":
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=settings.GOOGLE_API_KEY)
                cached = client.caches.create(
                    model=model_id,
                    config=types.CreateCachedContentConfig(
                        display_name="dealscout-promo-policies-v1",
                        system_instruction=self.SYSTEM_INSTRUCTION,
                        contents=[PromoPolicyStore.get_all_static_policy_text()],
                        ttl=f"{ttl_seconds}s",
                    ),
                )
                self._cache_name = getattr(cached, "name", None)
                self._mode = "gemini_live_cache"
                self._last_error = None
                return self.get_cache_status()
            except Exception as exc:
                self._last_error = str(exc)

        # Deterministic local metadata fallback when offline, mock mode, or API key invalid
        self._cache_name = f"local-cache/{model_id}/{self._bundle_hash}"
        self._mode = "local_fallback"
        return self.get_cache_status()

    def get_cache_status(self) -> dict[str, Any]:
        """Return current context cache metadata, mode, TTL, and estimated cached tokens."""
        if self._mode == "uninitialized":
            self.create_or_get_cache()

        now = datetime.now(timezone.utc)
        active = self._expires_at is not None and self._expires_at > now
        estimated_tokens = max(1, len(self._bundle_text) // 4)
        return {
            "active": active,
            "mode": self._mode,
            "model": settings.GEMINI_SUBAGENT_MODEL,
            "ttl_seconds": int(settings.GEMINI_CONTEXT_CACHE_TTL_SECONDS),
            "cache_name": self._cache_name,
            "bundle_hash": self._bundle_hash,
            "bundle_chars": len(self._bundle_text),
            "estimated_cached_tokens": estimated_tokens,
            "created_at": self._created_at.isoformat() if self._created_at else None,
            "expires_at": self._expires_at.isoformat() if self._expires_at else None,
            "last_error": self._last_error,
        }
