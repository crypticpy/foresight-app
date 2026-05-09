"""Usage-anomaly / abuse monitor.

Looks for patterns in ``llm_usage_events`` that suggest a user is
hammering the system: high error rate, very high call volume, or
runaway $ in a short window. These are *not* security incidents in
the prompt-injection sense — they're usage anomalies that an admin
should review (could be a buggy client, a stuck loop, or a real
abuser).

The detector is pure SQL aggregation. Run on a schedule (default 30
min via APScheduler) or on demand from the admin Safety tab. Each
finding becomes a ``safety_incidents`` row with ``kind='abuse'`` so
the UI presents both kinds in one queue.

Thresholds are conservative defaults; admins can tune them via env
vars or a future settings row. We don't mutate any user-facing state
here — we only write incidents. Enforcement (rate-limit lockouts,
quota holds, etc.) is a separate concern that would consume these
incidents.
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid int for %s=%r — using default %d", name, raw, default)
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid float for %s=%r — using default %f", name, raw, default)
        return default


# Defaults are deliberately loose — pilot has 1 user. Tighten when the
# pilot gets more traffic. Anything dramatically over these means
# something is wrong, not just busy.
ABUSE_WINDOW_MIN = _env_int("FORESIGHT_ABUSE_WINDOW_MIN", 60)
ABUSE_VOLUME_THRESHOLD = _env_int("FORESIGHT_ABUSE_VOLUME", 500)
ABUSE_ERROR_RATE_MIN_CALLS = _env_int("FORESIGHT_ABUSE_ERROR_MIN_CALLS", 20)
ABUSE_ERROR_RATE_THRESHOLD = _env_float("FORESIGHT_ABUSE_ERROR_RATE", 0.5)
ABUSE_COST_THRESHOLD_USD = _env_float("FORESIGHT_ABUSE_COST_USD", 5.0)


@dataclass
class AbuseFinding:
    user_id: str
    kind: str  # "high_volume" | "error_storm" | "cost_spike"
    severity: str  # "low" | "medium" | "high"
    window_start: str  # ISO8601
    window_end: str
    metrics: dict[str, Any] = field(default_factory=dict)

    @property
    def description(self) -> str:
        return {
            "high_volume": (
                f"{self.metrics.get('call_count')} calls in "
                f"{ABUSE_WINDOW_MIN} min (threshold {ABUSE_VOLUME_THRESHOLD})"
            ),
            "error_storm": (
                f"{int(self.metrics.get('error_rate', 0) * 100)}% error rate "
                f"over {self.metrics.get('call_count')} calls"
            ),
            "cost_spike": (
                f"${self.metrics.get('cost_usd', 0):.2f} spent in "
                f"{ABUSE_WINDOW_MIN} min (threshold ${ABUSE_COST_THRESHOLD_USD:.2f})"
            ),
        }.get(self.kind, "abuse signal")


def _aggregate(
    events: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Group raw events by user_id and compute per-user aggregates.

    Pulled out for unit-testability — the SQL fetch is the only thing
    that touches Supabase, and tests can pass synthetic event lists.
    """
    by_user: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "call_count": 0,
            "error_count": 0,
            "cost_usd": 0.0,
        }
    )
    for evt in events:
        uid = evt.get("user_id")
        if not uid:
            continue
        bucket = by_user[uid]
        bucket["call_count"] += 1
        if evt.get("status") == "error":
            bucket["error_count"] += 1
        cost = evt.get("estimated_cost_usd")
        if isinstance(cost, (int, float)):
            bucket["cost_usd"] += float(cost)
    # Compute derived fields once.
    for bucket in by_user.values():
        calls = bucket["call_count"] or 1
        bucket["error_rate"] = bucket["error_count"] / calls
    return by_user


def _classify_user(
    user_id: str,
    bucket: dict[str, Any],
    window_start: datetime,
    window_end: datetime,
) -> list[AbuseFinding]:
    findings: list[AbuseFinding] = []
    calls = bucket["call_count"]
    errors = bucket["error_count"]
    cost = bucket["cost_usd"]
    error_rate = bucket["error_rate"]

    if calls >= ABUSE_VOLUME_THRESHOLD:
        # Severity scales with how far over the threshold we are.
        sev = "high" if calls >= 2 * ABUSE_VOLUME_THRESHOLD else "medium"
        findings.append(
            AbuseFinding(
                user_id=user_id,
                kind="high_volume",
                severity=sev,
                window_start=window_start.isoformat(),
                window_end=window_end.isoformat(),
                metrics={
                    "call_count": calls,
                    "threshold": ABUSE_VOLUME_THRESHOLD,
                },
            )
        )

    if calls >= ABUSE_ERROR_RATE_MIN_CALLS and error_rate >= ABUSE_ERROR_RATE_THRESHOLD:
        sev = "high" if error_rate >= 0.8 else "medium"
        findings.append(
            AbuseFinding(
                user_id=user_id,
                kind="error_storm",
                severity=sev,
                window_start=window_start.isoformat(),
                window_end=window_end.isoformat(),
                metrics={
                    "call_count": calls,
                    "error_count": errors,
                    "error_rate": round(error_rate, 3),
                },
            )
        )

    if cost >= ABUSE_COST_THRESHOLD_USD:
        sev = "high" if cost >= 4 * ABUSE_COST_THRESHOLD_USD else "medium"
        findings.append(
            AbuseFinding(
                user_id=user_id,
                kind="cost_spike",
                severity=sev,
                window_start=window_start.isoformat(),
                window_end=window_end.isoformat(),
                metrics={
                    "cost_usd": round(cost, 4),
                    "threshold": ABUSE_COST_THRESHOLD_USD,
                    "call_count": calls,
                },
            )
        )

    return findings


def detect_user_abuse(
    supabase: Any,
    *,
    window_min: Optional[int] = None,
    now: Optional[datetime] = None,
) -> list[AbuseFinding]:
    """Run the abuse aggregation over the most recent ``window_min`` minutes.

    Returns the list of findings. Persisting them is a separate step
    so the scheduled-job caller can decide whether to dedupe with
    existing open incidents.
    """
    window = window_min or ABUSE_WINDOW_MIN
    end = now or datetime.now(timezone.utc)
    start = end - timedelta(minutes=window)

    try:
        resp = (
            supabase.table("llm_usage_events")
            .select("user_id,status,estimated_cost_usd,created_at")
            .gte("created_at", start.isoformat())
            .lt("created_at", end.isoformat())
            .limit(50_000)
            .execute()
        )
        events = resp.data or []
    except Exception as exc:
        logger.warning("Abuse monitor: usage-event fetch failed: %s", exc)
        return []

    by_user = _aggregate(events)
    findings: list[AbuseFinding] = []
    for user_id, bucket in by_user.items():
        findings.extend(_classify_user(user_id, bucket, start, end))
    return findings


def record_abuse_findings(
    supabase: Any, findings: list[AbuseFinding]
) -> int:
    """Persist findings as ``safety_incidents`` with ``kind='abuse'``.

    De-dupes against incidents already written for the same
    (user_id, kind, window_start) tuple within the past window so a
    scheduled re-run doesn't create duplicates. Returns the number of
    new rows actually inserted.
    """
    if not findings:
        return 0
    rows: list[dict[str, Any]] = []
    for f in findings:
        rows.append(
            {
                "kind": "abuse",
                "severity": f.severity,
                "source": "monitor",
                "user_id": f.user_id,
                "pattern_id": f"abuse.{f.kind}",
                "category": f.kind,
                "excerpt": f.description,
                "metadata": {
                    "window_start": f.window_start,
                    "window_end": f.window_end,
                    "metrics": f.metrics,
                },
            }
        )

    # Cheap dedupe: skip insert if a matching (user_id, pattern_id, window_start)
    # already exists. We do this in Python rather than SQL because the supabase
    # client doesn't expose a clean "ON CONFLICT DO NOTHING" for jsonb fields.
    inserted = 0
    for row in rows:
        try:
            existing = (
                supabase.table("safety_incidents")
                .select("id")
                .eq("kind", "abuse")
                .eq("user_id", row["user_id"])
                .eq("pattern_id", row["pattern_id"])
                .gte(
                    "created_at",
                    row["metadata"]["window_start"],
                )
                .limit(1)
                .execute()
            )
            if existing.data:
                continue
            supabase.table("safety_incidents").insert(row).execute()
            inserted += 1
        except Exception as exc:
            logger.warning(
                "Abuse monitor: failed to insert incident for user %s: %s",
                row["user_id"],
                exc,
            )
    return inserted
