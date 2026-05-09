"""PII / secret redaction for stored LLM audit excerpts.

Used by ``usage_telemetry.record_llm_usage_event`` when the
``FORESIGHT_AUDIT_LLM_CONTENT`` admin setting is enabled. Redacts emails,
phone numbers, SSNs, IPv4 addresses, common API keys, and JWTs before
prompt/response text is persisted to ``llm_usage_events``.

Conservative on purpose — the goal is to remove obvious identifiers and
secrets from the audit trail, not to be a full DLP solution. Audit content
is admin-only behind RLS regardless; redaction is defense in depth.
"""

from __future__ import annotations

import re
from typing import Iterable

# Each entry: (flag, compiled regex). Order matters — secret patterns run
# before generic numeric patterns so an API key with a digit run isn't
# partially eaten by a phone-number match.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "API_KEY",
        re.compile(
            r"(?:sk-(?:proj-|live_|test_)?|ghp_|gho_|gsk_|github_pat_|"
            r"xox[bp]-|AIza|AKIA)[A-Za-z0-9_-]{16,}"
        ),
    ),
    (
        "JWT",
        re.compile(
            r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
        ),
    ),
    (
        "EMAIL",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ),
    (
        "SSN",
        re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    ),
    (
        "PHONE_US",
        # Area code starts 2-9 to avoid matching dates / timestamps.
        re.compile(
            r"\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
        ),
    ),
]

# IPv4 needs octet validation (regex alone matches 999.999.999.999); handled
# in ``_redact_ipv4`` rather than via _PATTERNS so we can drop false positives
# like version strings.
_IPV4_RE = re.compile(r"\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b")

_MAX_EXCERPT_BYTES = 4096


def _redact_ipv4(text: str, flags: set[str]) -> str:
    def _sub(match: re.Match[str]) -> str:
        octets = [int(g) for g in match.groups()]
        if all(0 <= o <= 255 for o in octets):
            flags.add("IPV4")
            return "[REDACTED:IPV4]"
        return match.group(0)

    return _IPV4_RE.sub(_sub, text)


def redact(text: str | None) -> tuple[str, list[str]]:
    """Redact PII / secrets from ``text``.

    Returns ``(redacted_text, sorted_unique_flags)``. ``None`` and empty
    strings short-circuit and return ``("", [])``.
    """
    if not text:
        return "", []

    flags: set[str] = set()
    out = text
    for flag, pattern in _PATTERNS:
        if pattern.search(out):
            flags.add(flag)
            out = pattern.sub(f"[REDACTED:{flag}]", out)
    out = _redact_ipv4(out, flags)
    return out, sorted(flags)


def truncate_excerpt(text: str | None, max_bytes: int = _MAX_EXCERPT_BYTES) -> str:
    """Truncate ``text`` to ``max_bytes`` UTF-8 bytes, appending an ellipsis
    marker when truncation occurred. Safe on multi-byte characters.
    """
    if not text:
        return ""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    # Trim conservatively, then decode ignoring partial code points.
    truncated = encoded[:max_bytes].decode("utf-8", errors="ignore")
    return truncated + "…[truncated]"


def redact_and_truncate(text: str | None) -> tuple[str, list[str]]:
    """Convenience wrapper: redact first, then enforce the excerpt size cap."""
    redacted, flags = redact(text)
    return truncate_excerpt(redacted), flags


def merge_flags(flag_lists: Iterable[Iterable[str]]) -> list[str]:
    """Merge several flag iterables into a sorted unique list."""
    merged: set[str] = set()
    for fl in flag_lists:
        merged.update(fl)
    return sorted(merged)
