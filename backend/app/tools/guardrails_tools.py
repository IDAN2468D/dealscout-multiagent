"""Deterministic Python security guardrails and anti-scam seller trust checks.

All external product descriptions, reviews, and coupon texts MUST pass through
`sanitize_external_text` BEFORE being sent to Gemini or any LLM agent.
"""

from __future__ import annotations

import html
import re
from typing import Any

from backend.app.core.config import settings

# Zero-width, bidirectional override, and non-printable control characters
_ZERO_WIDTH_AND_CONTROL_RE = re.compile(
    r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\x00-\x08\x0b\x0c\x0e-\x1f\x7f]"
)

# Dangerous HTML / script blocks and attributes
_SCRIPT_STYLE_BLOCK_RE = re.compile(
    r"<\s*(script|style|iframe|object|embed|svg)\b[^>]*>.*?<\s*/\s*\1\s*>",
    re.IGNORECASE | re.DOTALL,
)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_JS_URI_OR_HANDLER_RE = re.compile(
    r"(?:javascript\s*:|vbscript\s*:|data\s*:\s*text/html|on[a-z]+\s*=\s*(['\"]).*?\1)",
    re.IGNORECASE | re.DOTALL,
)

# Case-insensitive Prompt Injection patterns (SPEC 4.3 / 5.3)
_PROMPT_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "PROMPT_INJECTION:ignore_instructions",
        re.compile(
            r"ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+instructions?\b[^.\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:disregard_system_prompt",
        re.compile(
            r"disregard\s+(?:all\s+|the\s+)?(?:system\s+prompt|previous\s+instructions?|guardrails|rules)\b[^.\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:role_hijack_you_are_now",
        re.compile(r"\byou\s+are\s+now\b[^.\n]*", re.IGNORECASE),
    ),
    (
        "PROMPT_INJECTION:override_directive",
        re.compile(
            r"\boverride\s+(?:the\s+)?(?:price|ranking|instructions?|rules|system|verdict)\b[^.\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:rank_manipulation",
        re.compile(
            r"\brank\s+(?:this|the)\s+(?:seller|product|offer|deal)\s*(?:#?\s*1|first|highest)\b[^.\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:price_manipulation",
        re.compile(
            r"\b(?:set|change|force)\s+(?:the\s+)?price\s+to\s+\$?\d+(?:\.\d+)?[^.\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:role_delimiter",
        re.compile(
            r"(?:^|\n|\s)(?:system|assistant|developer)\s*:\s*[^\n]*",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:chatml_or_special_tokens",
        re.compile(
            r"(?:<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|\[/?INST\]|<<\s*/?SYS\s*>>)",
            re.IGNORECASE,
        ),
    ),
    (
        "PROMPT_INJECTION:jailbreak_or_exfiltration",
        re.compile(
            r"(?:reveal\s+(?:your\s+)?system\s+prompt|bypass\s+guardrails|do\s+not\s+follow\s+(?:any\s+)?rules|\bjailbreak\b)",
            re.IGNORECASE,
        ),
    ),
)


def sanitize_external_text(raw_text: str | None) -> tuple[str, list[str]]:
    """Deterministically strip control chars, HTML/scripts, and prompt injections.

    Args:
        raw_text: Untrusted text scraped from external stores, reviews, or coupons.

    Returns:
        Tuple of ``(clean_text, detected_threats)``.
    """
    if not raw_text:
        return "", []

    threats: list[str] = []

    def _record(label: str) -> None:
        if label not in threats:
            threats.append(label)

    text = str(raw_text)

    # 1. Strip zero-width & control characters
    cleaned, count = _ZERO_WIDTH_AND_CONTROL_RE.subn("", text)
    if count > 0:
        _record("CONTROL_CHAR_OBFUSCATION")
    text = cleaned

    # 2. Decode HTML entities so encoded payloads cannot evade regexes
    unescaped = html.unescape(text)
    if unescaped != text and ("<" in unescaped or "script" in unescaped.lower()):
        text = unescaped

    # 3. Remove <script>, <style>, <iframe> blocks and JS handlers / residual tags
    text, script_hits = _SCRIPT_STYLE_BLOCK_RE.subn(" ", text)
    text, js_hits = _JS_URI_OR_HANDLER_RE.subn(" ", text)
    text, tag_hits = _HTML_TAG_RE.subn(" ", text)
    if script_hits > 0 or js_hits > 0:
        _record("HTML_SCRIPT_INJECTION")
    elif tag_hits > 0:
        _record("HTML_TAG_STRIPPED")

    # 4. Detect and redact prompt-injection patterns
    for threat_label, pattern in _PROMPT_INJECTION_PATTERNS:
        text, hits = pattern.subn(" [REDACTED_INJECTION] ", text)
        if hits > 0:
            _record(threat_label)

    # Collapse repeated whitespace cleanly
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text).strip()
    return text, threats


def check_seller_trust(
    seller_name: str,
    seller_trust_score: int,
    min_user_trust: int = 70,
) -> dict[str, Any]:
    """Evaluate seller trustworthiness against mandatory block and user thresholds.

    Strictly blocks (``blocked=True``, ``verdict="BLOCKED_SCAM"``) whenever
    ``seller_trust_score < settings.MIN_TRUST_SCORE_BLOCK`` (70).
    """
    hard_block_min = int(settings.MIN_TRUST_SCORE_BLOCK)
    score = int(seller_trust_score)
    preferred_min = max(hard_block_min, int(min_user_trust))

    if score < hard_block_min:
        return {
            "blocked": True,
            "verdict": "BLOCKED_SCAM",
            "seller_name": seller_name,
            "seller_trust_score": score,
            "reason": (
                f"Seller '{seller_name}' trust score {score}/100 is below the "
                f"mandatory safety threshold ({hard_block_min})."
            ),
        }

    if score < preferred_min:
        return {
            "blocked": False,
            "verdict": "LOW_TRUST_WARNING",
            "seller_name": seller_name,
            "seller_trust_score": score,
            "reason": (
                f"Seller '{seller_name}' trust score {score}/100 is below your "
                f"configured preference ({preferred_min}/100)."
            ),
        }

    return {
        "blocked": False,
        "verdict": "TRUSTED",
        "seller_name": seller_name,
        "seller_trust_score": score,
        "reason": f"Seller '{seller_name}' is trusted ({score}/100).",
    }
