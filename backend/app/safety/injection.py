"""Prompt-injection scanner.

Pattern library for detecting prompt-injection / jailbreak attempts in
text that's about to be fed to an LLM. The two callers are:

- ``discovery_service`` triage stage: scans fetched RSS / web content
  *before* the LLM triage call. On match we tag the discovered_source,
  skip the LLM call, and write a ``safety_incident`` row.
- ``chat_service``: scans incoming user messages. On a high-severity
  match we refuse to proceed; lower severities pass with a warning
  incident logged.

The detector is intentionally pattern-based (regex + keyword) rather
than LLM-based — the whole point is to make a decision *before*
spending an LLM call. False positives are recoverable (admins can mark
incidents as ``false_positive`` in the Safety tab); false negatives are
the failure mode we accept.

Pattern categories cover the well-known prompt-injection surface
(instruction override, role hijack, system-prompt leak, jailbreak
keywords, embedded URL exfiltration, encoded payloads). Each pattern
carries a category and severity so the consumer can choose to block
vs. flag.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class InjectionSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class _Pattern:
    pattern_id: str
    category: str
    severity: InjectionSeverity
    regex: re.Pattern[str]
    description: str


def _compile(text: str) -> re.Pattern[str]:
    return re.compile(text, re.IGNORECASE | re.MULTILINE)


# ---------------------------------------------------------------------------
# Pattern library
# ---------------------------------------------------------------------------
#
# Patterns are ordered roughly by directness of attack — the most explicit
# instruction-override and system-prompt-leak attempts are HIGH severity
# (block on chat input, skip LLM call on discovered content). Softer
# indicators (jailbreak slang, lone "system:" tokens) fire at MEDIUM and
# are mostly informational.
#
# When adding a pattern, prefer specific phrases over broad keywords. The
# scanner runs on every fetched document so a pattern that matches "the
# system rules" in normal prose burns FOIA cost for no signal.

_PATTERNS: tuple[_Pattern, ...] = (
    # Direct instruction override
    _Pattern(
        pattern_id="injection.instruction_override.ignore",
        category="instruction_override",
        severity=InjectionSeverity.HIGH,
        regex=_compile(
            r"\b(?:ignore|disregard|forget|override)\s+"
            r"(?:all\s+)?(?:the\s+|your\s+|previous\s+|prior\s+|above\s+)"
            r"(?:instructions?|prompts?|rules?|system\s+messages?|guidelines?)\b"
        ),
        description="Direct instruction-override phrase",
    ),
    _Pattern(
        pattern_id="injection.instruction_override.new_instructions",
        category="instruction_override",
        severity=InjectionSeverity.HIGH,
        regex=_compile(
            r"\b(?:new|updated|revised|important)\s+"
            r"(?:instructions?|directives?|orders?|task)\s*[:\-]"
        ),
        description="Pivot to attacker-supplied instructions",
    ),
    # Role hijack
    _Pattern(
        pattern_id="injection.role_hijack.you_are_now",
        category="role_hijack",
        severity=InjectionSeverity.HIGH,
        regex=_compile(
            r"\b(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|"
            r"act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+"
            r"(?:a\s+|an\s+)?[A-Za-z][\w\s\-]{2,40}"
        ),
        description="Role-reassignment phrase",
    ),
    # System-prompt leak
    _Pattern(
        pattern_id="injection.prompt_leak.show_system",
        category="prompt_leak",
        severity=InjectionSeverity.HIGH,
        regex=_compile(
            r"\b(?:show|reveal|print|repeat|output|display|tell\s+me)\s+"
            r"(?:me\s+)?(?:the\s+|your\s+)?"
            r"(?:system\s+(?:prompt|message|instructions?)|initial\s+prompt|"
            r"original\s+(?:prompt|instructions?|directive)|"
            r"all\s+(?:above|prior|previous)\s+text)"
        ),
        description="System-prompt exfiltration attempt",
    ),
    _Pattern(
        pattern_id="injection.prompt_leak.repeat_above",
        category="prompt_leak",
        severity=InjectionSeverity.MEDIUM,
        regex=_compile(
            r"\brepeat\s+(?:everything\s+)?(?:above|before)\s+(?:this\s+)?"
            r"(?:line|verbatim|word\s+for\s+word)"
        ),
        description="Echo-the-context request",
    ),
    # Jailbreak keywords
    _Pattern(
        pattern_id="injection.jailbreak.dan_mode",
        category="jailbreak",
        severity=InjectionSeverity.MEDIUM,
        regex=_compile(
            r"\b(?:DAN\s+mode|developer\s+mode|jailbreak|"
            r"unrestricted\s+(?:mode|model|ai)|no\s+restrictions|"
            r"without\s+(?:any\s+)?(?:filters?|safety|guardrails?|limits?))\b"
        ),
        description="Jailbreak-mode invocation",
    ),
    # Tool / output coercion (specific to Foresight: we never want a
    # discovered RSS item to coerce the triage LLM into emitting a tool
    # call). On chat input these are LOW — operators legitimately ask
    # for JSON or scripts.
    _Pattern(
        pattern_id="injection.tool_coercion.respond_only",
        category="tool_coercion",
        severity=InjectionSeverity.MEDIUM,
        regex=_compile(
            r"\b(?:respond|reply|answer)\s+(?:only|just)\s+with\s+"
            r"(?:the\s+)?(?:json|code|a\s+script|the\s+command|the\s+url)"
        ),
        description="Output-format coercion",
    ),
    # Data exfiltration / SSRF beacons
    _Pattern(
        pattern_id="injection.exfil.beacon_url",
        category="exfiltration",
        severity=InjectionSeverity.HIGH,
        regex=_compile(
            r"\b(?:send|post|fetch|curl|wget|GET|POST)\s+"
            r"(?:the\s+|all\s+)?(?:above|previous|context|conversation|secrets?)"
            r"\s+(?:to|from)\s+https?://"
        ),
        description="Out-of-band data-exfiltration request",
    ),
    # Hidden-channel markers — invisible / homoglyph attacks tend to
    # smuggle the actual payload via Unicode tag chars or zero-width
    # space sequences. We don't try to decode; we just flag.
    _Pattern(
        pattern_id="injection.hidden.zero_width_run",
        category="hidden_channel",
        severity=InjectionSeverity.MEDIUM,
        regex=re.compile(r"[\u200B-\u200F\u202A-\u202E\U000E0020-\U000E007F\U000E0100-\U000E01EF]{6,}"),
        description="Zero-width / Unicode-tag run",
    ),
    # Marker tokens that imitate the system delimiter. Lone tokens (no
    # "ignore" / "new instructions" verb nearby) are MEDIUM; consumers
    # can decide whether to escalate.
    _Pattern(
        pattern_id="injection.delimiter.system_token",
        category="delimiter_spoof",
        severity=InjectionSeverity.MEDIUM,
        regex=_compile(
            r"(?:^|\n)\s*(?:###\s*)?(?:system|assistant|user)\s*[:\-]\s*"
        ),
        description="Spoofed chat-role delimiter",
    ),
)


@dataclass(frozen=True)
class IncidentMatch:
    """One pattern hit on a piece of scanned text."""

    pattern_id: str
    category: str
    severity: InjectionSeverity
    excerpt: str  # truncated + redacted snippet around the match
    description: str

    @property
    def is_blocking(self) -> bool:
        """High-severity matches should block the downstream LLM call."""
        return self.severity == InjectionSeverity.HIGH


_EXCERPT_WINDOW = 160
_MAX_SCAN_CHARS = 200_000  # protect against pathological inputs


def _excerpt_around(text: str, start: int, end: int) -> str:
    a = max(0, start - _EXCERPT_WINDOW // 2)
    b = min(len(text), end + _EXCERPT_WINDOW // 2)
    snippet = text[a:b].strip()
    if a > 0:
        snippet = "…" + snippet
    if b < len(text):
        snippet = snippet + "…"
    return snippet


def scan_text(text: Optional[str]) -> list[IncidentMatch]:
    """Run every pattern against ``text`` and return all hits.

    De-duplicates: a pattern that fires twice in the same document is
    reported once (highest-severity excerpt kept). Returns an empty
    list for ``None`` / empty / very short inputs.
    """
    if not text or len(text.strip()) < 8:
        return []
    body = text[:_MAX_SCAN_CHARS]
    seen: dict[str, IncidentMatch] = {}
    for pat in _PATTERNS:
        match = pat.regex.search(body)
        if match is None:
            continue
        excerpt = _excerpt_around(body, match.start(), match.end())
        seen[pat.pattern_id] = IncidentMatch(
            pattern_id=pat.pattern_id,
            category=pat.category,
            severity=pat.severity,
            excerpt=excerpt,
            description=pat.description,
        )
    return list(seen.values())


def highest_severity(matches: list[IncidentMatch]) -> Optional[InjectionSeverity]:
    if not matches:
        return None
    order = (
        InjectionSeverity.HIGH,
        InjectionSeverity.MEDIUM,
        InjectionSeverity.LOW,
    )
    by_id = {m.severity: m for m in matches}
    for sev in order:
        if sev in by_id:
            return sev
    return None


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def record_injection_incident(
    supabase: Any,
    *,
    matches: list[IncidentMatch],
    source: str,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    discovered_source_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Insert one row per match into ``safety_incidents``.

    All matches from a single scan share the same ``source`` (chat /
    discovery) and link fields. We write one row per pattern_id rather
    than collapsing into one row so the admin UI can show which
    pattern fired and so dispositions are per-pattern.

    Returns the first inserted row (mostly used by the chat-blocking
    path which only cares that *something* was logged). Returns
    ``None`` and logs a warning on persistence failure — the caller
    is expected to continue (we'd rather block the LLM call and lose
    the audit row than skip blocking because logging failed).
    """
    if not matches:
        return None
    rows = [
        {
            "kind": "injection",
            "severity": m.severity.value,
            "source": source,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "discovered_source_id": discovered_source_id,
            "pattern_id": m.pattern_id,
            "category": m.category,
            "excerpt": m.excerpt,
            "metadata": metadata or {},
        }
        for m in matches
    ]
    try:
        result = (
            supabase.table("safety_incidents").insert(rows).execute()
        )
        first = (result.data or [None])[0]
        return first
    except Exception as exc:
        # Don't let a logging failure mask the security signal — the
        # caller's "block on match" decision still stands.
        logger.warning(
            "Failed to persist %d safety incident row(s): %s", len(rows), exc
        )
        return None
