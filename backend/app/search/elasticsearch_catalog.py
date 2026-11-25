"""Elasticsearch 8.x catalog client with deterministic in-memory fuzzy fallback."""

from __future__ import annotations

import copy
import difflib
import re
import time
from typing import Any

from backend.app.core.config import settings
from backend.app.search.seed_data import SEED_PRODUCTS

try:
    from elasticsearch import Elasticsearch
except ImportError:  # pragma: no cover
    Elasticsearch = None  # type: ignore[assignment]


_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def normalize_text(text: str) -> str:
    """Collapse string to lowercase alphanumeric characters for model-number matching."""
    return _ALNUM_RE.sub("", (text or "").lower())


def _tokenize(text: str) -> list[str]:
    """Extract lowercase alphanumeric tokens."""
    return [tok for tok in _ALNUM_RE.split((text or "").lower()) if tok]


def _product_searchable_fields(product: dict[str, Any]) -> tuple[str, list[str]]:
    """Build combined normalized blob and token list for a catalog product."""
    parts = [
        product.get("product_id", ""),
        product.get("sku", ""),
        product.get("brand", ""),
        product.get("model", ""),
        product.get("title", ""),
        product.get("category", ""),
        *product.get("aliases", []),
    ]
    joined = " ".join(str(p) for p in parts if p)
    return normalize_text(joined), _tokenize(joined)


def _score_product(query: str, product: dict[str, Any]) -> float:
    """Compute deterministic fuzzy relevance score in [0.0, 1.0]."""
    q_norm = normalize_text(query)
    if not q_norm:
        return 0.0

    id_norm = normalize_text(product.get("product_id", ""))
    sku_norm = normalize_text(product.get("sku", ""))
    if q_norm == id_norm or q_norm == sku_norm:
        return 1.0

    blob_norm, p_tokens = _product_searchable_fields(product)
    q_tokens = _tokenize(query)
    if not q_tokens:
        return 0.0

    if q_norm in id_norm or q_norm in sku_norm or q_norm in blob_norm:
        substring_bonus = 0.94
    else:
        substring_bonus = 0.0

    # Token-level fuzzy coverage
    token_scores: list[float] = []
    for qt in q_tokens:
        best_tok = 0.0
        for pt in p_tokens:
            if qt == pt:
                best_tok = 1.0
                break
            if qt in pt or pt in qt:
                best_tok = max(best_tok, 0.88 if len(qt) >= 3 else 0.72)
            else:
                ratio = difflib.SequenceMatcher(None, qt, pt).ratio()
                if ratio > best_tok:
                    best_tok = ratio
        token_scores.append(best_tok)

    avg_token_score = sum(token_scores) / len(token_scores)
    min_token_score = min(token_scores)

    # Alias / title sequence similarity
    title_ratio = difflib.SequenceMatcher(
        None, q_norm, normalize_text(product.get("title", ""))
    ).ratio()
    alias_ratio = max(
        (
            difflib.SequenceMatcher(None, q_norm, normalize_text(alias)).ratio()
            for alias in product.get("aliases", [])
        ),
        default=0.0,
    )

    blended = 0.65 * avg_token_score + 0.15 * min_token_score + 0.20 * max(title_ratio, alias_ratio)
    return round(max(substring_bonus, blended), 4)


class ElasticsearchCatalog:
    """Elasticsearch 8.x catalog wrapper with automatic in-memory fuzzy fallback."""

    def __init__(
        self,
        es_url: str | None = None,
        index_name: str | None = None,
        products: list[dict[str, Any]] | None = None,
    ) -> None:
        self.es_url = es_url or settings.ELASTICSEARCH_URL
        self.index_name = index_name or settings.ELASTICSEARCH_INDEX
        self._products: list[dict[str, Any]] = copy.deepcopy(
            products if products is not None else SEED_PRODUCTS
        )
        self._client = self._build_client()
        self._es_available: bool | None = None
        self._last_es_check: float = 0.0
        self._es_retry_ttl_seconds: float = 30.0

    def _build_client(self):
        if Elasticsearch is None:
            return None
        try:
            return Elasticsearch(
                self.es_url,
                request_timeout=0.75,
                max_retries=0,
            )
        except Exception:
            return None

    def is_elasticsearch_available(self) -> bool:
        """Ping Elasticsearch quickly with a 30s negative-result cache to keep offline fallback <1ms."""
        if self._client is None:
            return False
        now = time.monotonic()
        if (
            self._es_available is not None
            and (now - self._last_es_check) < self._es_retry_ttl_seconds
        ):
            return self._es_available
        try:
            ok = bool(self._client.ping())
            self._es_available = ok
            self._last_es_check = now
            return ok
        except Exception:
            self._es_available = False
            self._last_es_check = now
            return False

    def index_seed_products(self) -> dict[str, Any]:
        """Index catalog documents into Elasticsearch 8.x when reachable."""
        if not self.is_elasticsearch_available() or self._client is None:
            return {"mode": "in_memory_fallback", "indexed": len(self._products)}

        try:
            if not self._client.indices.exists(index=self.index_name):
                self._client.indices.create(
                    index=self.index_name,
                    mappings={
                        "properties": {
                            "product_id": {"type": "keyword"},
                            "sku": {"type": "keyword"},
                            "brand": {"type": "text"},
                            "model": {"type": "text"},
                            "title": {"type": "text"},
                            "category": {"type": "keyword"},
                            "aliases": {"type": "text"},
                        }
                    },
                )
            for prod in self._products:
                self._client.index(
                    index=self.index_name,
                    id=prod["product_id"],
                    document=prod,
                )
            self._client.indices.refresh(index=self.index_name)
            return {"mode": "elasticsearch", "indexed": len(self._products)}
        except Exception:
            return {"mode": "in_memory_fallback", "indexed": len(self._products)}

    def search(
        self,
        query: str,
        limit: int = 10,
        store_filter: str | None = None,
    ) -> list[dict[str, Any]]:
        """Search catalog via Elasticsearch 8.x with automatic deterministic fuzzy fallback."""
        if not query or not query.strip():
            return []

        if self.is_elasticsearch_available() and self._client is not None:
            try:
                es_results = self._search_es(query=query, limit=limit)
                if es_results:
                    return self._apply_store_filter(es_results, store_filter)[:limit]
            except Exception:
                pass

        return self._search_in_memory(query=query, limit=limit, store_filter=store_filter)

    def _search_es(self, query: str, limit: int) -> list[dict[str, Any]]:
        assert self._client is not None
        resp = self._client.search(
            index=self.index_name,
            size=limit,
            query={
                "multi_match": {
                    "query": query,
                    "fields": ["product_id^4", "sku^4", "model^3", "aliases^3", "title^2", "brand"],
                    "fuzziness": "AUTO",
                }
            },
        )
        hits = resp.get("hits", {}).get("hits", [])
        results: list[dict[str, Any]] = []
        for hit in hits:
            src = copy.deepcopy(hit.get("_source", {}))
            if src:
                src["match_score"] = float(hit.get("_score") or 1.0)
                results.append(src)
        return results

    def _search_in_memory(
        self,
        query: str,
        limit: int,
        store_filter: str | None = None,
    ) -> list[dict[str, Any]]:
        scored: list[tuple[float, dict[str, Any]]] = []
        for prod in self._products:
            score = _score_product(query, prod)
            if score >= 0.45:
                item = copy.deepcopy(prod)
                item["match_score"] = score
                scored.append((score, item))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        items = [pair[1] for pair in scored]
        return self._apply_store_filter(items, store_filter)[:limit]

    @staticmethod
    def _apply_store_filter(
        items: list[dict[str, Any]],
        store_filter: str | None,
    ) -> list[dict[str, Any]]:
        if not store_filter:
            return items
        target = store_filter.strip().lower()
        filtered: list[dict[str, Any]] = []
        for item in items:
            matching_offers = [
                o for o in item.get("offers", []) if o.get("store_name", "").lower() == target
            ]
            if matching_offers:
                cloned = copy.deepcopy(item)
                cloned["offers"] = matching_offers
                filtered.append(cloned)
        return filtered

    def get_by_id_or_sku(self, identifier: str) -> dict[str, Any] | None:
        """Fetch exact product by product_id, SKU, or normalized alias."""
        if not identifier:
            return None
        target = normalize_text(identifier)
        for prod in self._products:
            if (
                normalize_text(prod.get("product_id", "")) == target
                or normalize_text(prod.get("sku", "")) == target
            ):
                return copy.deepcopy(prod)
            for alias in prod.get("aliases", []):
                if normalize_text(alias) == target:
                    return copy.deepcopy(prod)
        return None


_DEFAULT_CATALOG: ElasticsearchCatalog | None = None


def get_catalog() -> ElasticsearchCatalog:
    """Return singleton ElasticsearchCatalog instance."""
    global _DEFAULT_CATALOG
    if _DEFAULT_CATALOG is None:
        _DEFAULT_CATALOG = ElasticsearchCatalog()
    return _DEFAULT_CATALOG


def fuzzy_search_catalog(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Perform normalized fuzzy product search across the catalog."""
    return get_catalog().search(query=query, limit=limit)


def get_product_by_id_or_sku(identifier: str) -> dict[str, Any] | None:
    """Return a single product dict matching ID, SKU, or known ASIN/alias."""
    return get_catalog().get_by_id_or_sku(identifier)
