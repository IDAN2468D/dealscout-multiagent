"""Deterministic affiliate link sanitizer and parameter injector."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from backend.app.core.config import settings

_UNTRUSTED_AFFILIATE_PARAMS = frozenset(
    {
        "tag",
        "aff_id",
        "affid",
        "affiliate_id",
        "aff_fcid",
        "aff_fsk",
        "aff_platform",
        "ref",
        "ref_",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "click_id",
        "irclickid",
        "campid",
        "mkcid",
        "mkrid",
        "sk",
    }
)


def inject_affiliate_params(url: str, store_name: str) -> str:
    """Strip untrusted affiliate params and inject DealScout's verified affiliate params."""
    if not url or not url.strip():
        return ""

    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        return url.strip()

    cleaned_params = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _UNTRUSTED_AFFILIATE_PARAMS
    ]

    store_lower = (store_name or "").strip().lower()
    host_lower = parsed.netloc.lower()

    if "amazon" in store_lower or "amazon." in host_lower:
        cleaned_params.append(("tag", settings.AFFILIATE_TAG_AMAZON))
    else:
        cleaned_params.append(("aff_id", settings.AFFILIATE_ID_DEFAULT))
        cleaned_params.append(("utm_source", "dealscout_ai"))

    new_query = urlencode(cleaned_params)
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            new_query,
            parsed.fragment,
        )
    )
