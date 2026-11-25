"""Deterministic product compatibility (110V/230V) and review authenticity auditor."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from backend.app.tools.guardrails_tools import sanitize_external_text

_DUAL_OR_IL_VOLTAGE_RE = re.compile(
    r"(?:220|230|240|dual\s*voltage|100\s*[-~/]\s*240|110\s*[-~/]\s*240)",
    re.IGNORECASE,
)
_US_VOLTAGE_RE = re.compile(r"\b(?:110|115|120)\s*v?\b", re.IGNORECASE)
_US_PLUG_RE = re.compile(
    r"(?:us\s*type[-\s]*[ab]\b|\btype[-\s]*[ab]\b|\bus\s*plug\b|\bnema\s*[15]-15)",
    re.IGNORECASE,
)


def _extract_review_text(review: dict[str, Any]) -> str:
    for key in ("text", "body", "comment", "content", "review"):
        val = review.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def _normalize_for_dedup(text: str) -> str:
    return re.sub(r"\W+", " ", text.lower()).strip()


def audit_voltage_and_reviews(
    specs: dict[str, Any] | None,
    reviews: list[dict[str, Any]] | None,
    ship_to_country: str = "IL",
) -> dict[str, Any]:
    """Check electrical/plug compatibility for target country and detect bot review patterns.

    All review bodies are sanitized via ``sanitize_external_text`` before analysis.
    """
    specs_dict = specs or {}
    reviews_list = reviews or []
    country = (ship_to_country or "IL").strip().upper()

    warnings: list[str] = []
    incompatible_spec = False

    # 1. Voltage & Plug Compatibility Audit (Israel uses 230V / Type-H)
    if country == "IL":
        voltage_raw = str(specs_dict.get("voltage") or "")
        plug_raw = str(specs_dict.get("plug_type") or "")
        combined_spec = f"{voltage_raw} {plug_raw}".strip()

        has_220_240 = bool(_DUAL_OR_IL_VOLTAGE_RE.search(voltage_raw))
        has_110_120 = bool(_US_VOLTAGE_RE.search(voltage_raw))
        has_us_plug = bool(_US_PLUG_RE.search(plug_raw)) or bool(_US_PLUG_RE.search(combined_spec))

        if has_110_120 and not has_220_240:
            incompatible_spec = True
            warnings.append(
                "INCOMPATIBLE_VOLTAGE_110V: Product requires 110V / US plug "
                "(Israel uses 230V Type-H); step-down transformer needed"
            )
        elif has_us_plug:
            incompatible_spec = True
            warnings.append(
                "INCOMPATIBLE_PLUG_US: Product includes a US Type-A/B plug "
                "(Israel uses 230V Type-H); plug adapter required"
            )

    # 2. Sanitize reviews & scan for bot-review bursts / repetitive text / unverified ratio
    sanitized_reviews: list[dict[str, Any]] = []
    injection_threats: list[str] = []
    normalized_texts: list[str] = []
    timestamps: list[str] = []
    verified_flags: list[bool] = []

    for rev in reviews_list:
        raw_text = _extract_review_text(rev)
        clean_text, threats = sanitize_external_text(raw_text)
        for threat in threats:
            if threat not in injection_threats:
                injection_threats.append(threat)

        sanitized_entry = dict(rev)
        sanitized_entry["clean_text"] = clean_text
        if threats:
            sanitized_entry["detected_threats"] = threats
        sanitized_reviews.append(sanitized_entry)

        norm = _normalize_for_dedup(clean_text)
        if norm:
            normalized_texts.append(norm)

        ts = rev.get("created_at") or rev.get("date") or rev.get("timestamp")
        if ts:
            timestamps.append(str(ts)[:16])

        if "verified_purchase" in rev:
            verified_flags.append(bool(rev["verified_purchase"]))
        elif "verified" in rev:
            verified_flags.append(bool(rev["verified"]))

    bot_review_suspected = False
    bot_reasons: list[str] = []

    if len(normalized_texts) >= 3:
        counts = Counter(normalized_texts)
        most_common_count = counts.most_common(1)[0][1]
        unique_ratio = len(counts) / len(normalized_texts)
        if most_common_count >= 3 or unique_ratio <= 0.6:
            bot_review_suspected = True
            bot_reasons.append(
                f"Repetitive identical review text detected ({most_common_count}/{len(normalized_texts)} duplicates)"
            )

    verified_ratio = (
        round(sum(1 for v in verified_flags if v) / len(verified_flags), 2)
        if verified_flags
        else 1.0
    )
    if len(verified_flags) >= 3 and verified_ratio < 0.35:
        bot_review_suspected = True
        bot_reasons.append(
            f"Suspiciously low verified-purchase ratio ({verified_ratio:.0%})"
        )

    if len(timestamps) >= 4:
        ts_counts = Counter(timestamps)
        burst_count = ts_counts.most_common(1)[0][1]
        if burst_count >= 4 or (burst_count / len(timestamps)) >= 0.6:
            bot_review_suspected = True
            bot_reasons.append(
                f"Coordinated review burst detected ({burst_count} reviews in identical window)"
            )

    if injection_threats:
        warnings.append(
            f"REVIEW_INJECTION_SANITIZED: Neutralized {len(injection_threats)} threat pattern(s) in external reviews"
        )

    if bot_review_suspected:
        warnings.append("BOT_REVIEW_SUSPECTED: " + "; ".join(bot_reasons))

    return {
        "ship_to_country": country,
        "incompatible_spec": incompatible_spec,
        "bot_review_suspected": bot_review_suspected,
        "warnings": warnings,
        "verified_purchase_ratio": verified_ratio,
        "total_reviews_scanned": len(reviews_list),
        "injection_threats": injection_threats,
        "sanitized_reviews": sanitized_reviews,
    }
