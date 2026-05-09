"""Unit tests for the usage-anomaly / abuse monitor."""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.safety import abuse


def _evt(user_id: str, status: str = "success", cost: float = 0.001) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "status": status,
        "estimated_cost_usd": cost,
        "created_at": "2026-05-09T12:00:00+00:00",
    }


def test_aggregate_counts_calls_errors_costs():
    uid = str(uuid.uuid4())
    events = [
        _evt(uid, status="success", cost=0.10),
        _evt(uid, status="error", cost=0.05),
        _evt(uid, status="success", cost=0.20),
    ]
    out = abuse._aggregate(events)
    bucket = out[uid]
    assert bucket["call_count"] == 3
    assert bucket["error_count"] == 1
    assert round(bucket["cost_usd"], 4) == 0.35
    assert round(bucket["error_rate"], 3) == round(1 / 3, 3)


def test_classify_high_volume_high_severity(monkeypatch):
    monkeypatch.setattr(abuse, "ABUSE_VOLUME_THRESHOLD", 100)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_MIN_CALLS", 9999)
    monkeypatch.setattr(abuse, "ABUSE_COST_THRESHOLD_USD", 9999.0)
    bucket = {"call_count": 250, "error_count": 0, "cost_usd": 0.0, "error_rate": 0.0}
    start = datetime.now(timezone.utc)
    end = start
    findings = abuse._classify_user("u", bucket, start, end)
    assert any(f.kind == "high_volume" and f.severity == "high" for f in findings)


def test_classify_error_storm(monkeypatch):
    monkeypatch.setattr(abuse, "ABUSE_VOLUME_THRESHOLD", 9999)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_MIN_CALLS", 10)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_THRESHOLD", 0.5)
    monkeypatch.setattr(abuse, "ABUSE_COST_THRESHOLD_USD", 9999.0)
    bucket = {
        "call_count": 30,
        "error_count": 27,
        "cost_usd": 0.0,
        "error_rate": 0.9,
    }
    findings = abuse._classify_user(
        "u", bucket, datetime.now(timezone.utc), datetime.now(timezone.utc)
    )
    assert any(f.kind == "error_storm" and f.severity == "high" for f in findings)


def test_classify_cost_spike(monkeypatch):
    monkeypatch.setattr(abuse, "ABUSE_VOLUME_THRESHOLD", 9999)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_MIN_CALLS", 9999)
    monkeypatch.setattr(abuse, "ABUSE_COST_THRESHOLD_USD", 1.0)
    bucket = {"call_count": 5, "error_count": 0, "cost_usd": 5.0, "error_rate": 0.0}
    findings = abuse._classify_user(
        "u", bucket, datetime.now(timezone.utc), datetime.now(timezone.utc)
    )
    assert any(f.kind == "cost_spike" and f.severity == "high" for f in findings)


def test_classify_no_findings_below_threshold(monkeypatch):
    monkeypatch.setattr(abuse, "ABUSE_VOLUME_THRESHOLD", 100)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_MIN_CALLS", 20)
    monkeypatch.setattr(abuse, "ABUSE_ERROR_RATE_THRESHOLD", 0.5)
    monkeypatch.setattr(abuse, "ABUSE_COST_THRESHOLD_USD", 5.0)
    bucket = {
        "call_count": 50,
        "error_count": 5,
        "cost_usd": 1.0,
        "error_rate": 0.1,
    }
    findings = abuse._classify_user(
        "u", bucket, datetime.now(timezone.utc), datetime.now(timezone.utc)
    )
    assert findings == []


# ---------------------------------------------------------------------------
# Persistence dedupe
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, name: str, store: dict[str, list[dict[str, Any]]]):
        self._name = name
        self._store = store
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._select_only = False

    def select(self, *_a, **_kw):
        self._select_only = True
        return self

    def eq(self, k, v):
        self._eq[k] = v
        return self

    def gte(self, k, v):
        self._gte[k] = v
        return self

    def limit(self, _n):
        return self

    def insert(self, row):
        # The real DB sets created_at via DEFAULT NOW(); mirror that so the
        # dedupe query (gte created_at, window_start) can match.
        row.setdefault("created_at", "2026-05-09T12:30:00+00:00")
        self._store.setdefault(self._name, []).append(row)
        return _InsertExec(row)

    def execute(self):
        rows = self._store.get(self._name, [])
        out = []
        for r in rows:
            ok = True
            for k, v in self._eq.items():
                if r.get(k) != v:
                    ok = False
                    break
            if not ok:
                continue
            for k, v in self._gte.items():
                rv = r.get(k)
                if rv is None or rv < v:
                    ok = False
                    break
            if ok:
                out.append(r)
        return _Resp(out)


class _InsertExec:
    def __init__(self, row):
        self._row = row

    def execute(self):
        return _Resp([self._row])


class _StubSupabase:
    def __init__(self):
        self._store: dict[str, list[dict[str, Any]]] = {"safety_incidents": []}

    def table(self, name: str):
        return _Query(name, self._store)


def test_record_abuse_findings_dedupes_existing_window():
    sb = _StubSupabase()
    uid = str(uuid.uuid4())
    finding = abuse.AbuseFinding(
        user_id=uid,
        kind="high_volume",
        severity="high",
        window_start="2026-05-09T11:00:00+00:00",
        window_end="2026-05-09T12:00:00+00:00",
        metrics={"call_count": 1500},
    )

    # First insert lands.
    inserted = abuse.record_abuse_findings(sb, [finding])
    assert inserted == 1
    assert len(sb._store["safety_incidents"]) == 1

    # Same window, same pattern_id, same user → dedupes.
    inserted = abuse.record_abuse_findings(sb, [finding])
    assert inserted == 0
    assert len(sb._store["safety_incidents"]) == 1


def test_record_abuse_findings_empty_returns_zero():
    sb = _StubSupabase()
    assert abuse.record_abuse_findings(sb, []) == 0
