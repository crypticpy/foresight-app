"""Unit tests for the rolling-window cost guardrail."""

from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import cost_guardrail  # noqa: E402
from fastapi import HTTPException  # noqa: E402


# ---------------------------------------------------------------------------
# Stub supabase client
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    """Mock just enough of supabase-py to drive ``cost_guardrail``."""

    def __init__(self, name: str, store: dict[str, list[dict[str, Any]]]):
        self._name = name
        self._store = store
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._lt: dict[str, Any] = {}
        self._in: dict[str, list[Any]] = {}
        self._is_select = False
        self._update: dict[str, Any] | None = None
        self._range: tuple[int, int] | None = None

    def select(self, *_a, **_kw):
        self._is_select = True
        return self

    def eq(self, k, v):
        self._eq[k] = v
        return self

    def gte(self, k, v):
        self._gte[k] = v
        return self

    def lt(self, k, v):
        self._lt[k] = v
        return self

    def in_(self, k, v):
        self._in[k] = list(v)
        return self

    def limit(self, _n):
        return self

    def order(self, _column, desc=False):  # noqa: ARG002 — stub
        # Real PostgREST orders rows; the stub returns a stable order from
        # the underlying list, which is sufficient for the guardrail tests.
        return self

    def range(self, start: int, end: int):
        # PostgREST range is inclusive on both ends.
        self._range = (start, end)
        return self

    def insert(self, row):
        self._store.setdefault(self._name, []).append(row)
        return _InsertExec(row)

    def update(self, patch):
        self._update = patch
        return self

    def execute(self):
        rows = self._store.get(self._name, [])
        if self._update is not None:
            updated = []
            for r in rows:
                if all(r.get(k) == v for k, v in self._eq.items()):
                    r.update(self._update)
                    updated.append(r)
            return _Resp(updated)

        out = []
        for r in rows:
            ok = True
            for k, v in self._eq.items():
                if r.get(k) != v:
                    ok = False
                    break
            if not ok:
                continue
            for k, allowed in self._in.items():
                if r.get(k) not in allowed:
                    ok = False
                    break
            if not ok:
                continue
            for k, v in self._gte.items():
                rv = r.get(k)
                if rv is None or rv < v:
                    ok = False
                    break
            if not ok:
                continue
            for k, v in self._lt.items():
                rv = r.get(k)
                if rv is None or rv >= v:
                    ok = False
                    break
            if ok:
                out.append(r)
        if self._range is not None:
            start, end = self._range
            out = out[start : end + 1]
        return _Resp(out)


class _InsertExec:
    def __init__(self, row):
        self._row = row

    def execute(self):
        return _Resp([self._row])


class _StubSupabase:
    def __init__(self):
        self.store: dict[str, list[dict[str, Any]]] = {
            "admin_settings": [],
            "cost_guardrail_state": [{"id": 1}],
            "llm_usage_events": [],
            "external_api_usage_events": [],
            "admin_audit_log": [],
        }

    def table(self, name: str):
        return _Query(name, self.store)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _put_setting(sb: _StubSupabase, key: str, value: Any) -> None:
    sb.store["admin_settings"].append({"key": key, "value": value})


def _put_event(
    sb: _StubSupabase,
    table: str,
    cost: float,
    *,
    when: datetime | None = None,
) -> None:
    when = when or datetime.now(timezone.utc)
    sb.store[table].append(
        {"estimated_cost_usd": cost, "created_at": when.isoformat()}
    )


@pytest.fixture(autouse=True)
def reset_cache():
    """Each test gets a fresh module cache."""
    cost_guardrail.invalidate_cache()
    yield
    cost_guardrail.invalidate_cache()


@pytest.fixture
def stub_supabase(monkeypatch):
    sb = _StubSupabase()
    monkeypatch.setattr(cost_guardrail, "supabase", sb)
    # Strip any FORESIGHT_COST_* env vars from the developer shell so the
    # env-fallback path doesn't leak between tests.
    for key in (
        cost_guardrail.COST_BUDGET_KEY,
        cost_guardrail.COST_WINDOW_KEY,
        cost_guardrail.COST_ALERT_KEY,
        cost_guardrail.COST_ENABLED_KEY,
    ):
        monkeypatch.delenv(key, raising=False)
    return sb


# ---------------------------------------------------------------------------
# Behavior under guardrail-disabled
# ---------------------------------------------------------------------------


def test_disabled_guardrail_skips_spend_and_does_not_raise(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", False)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 1.0)
    _put_event(stub_supabase, "llm_usage_events", 999.0)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.enabled is False
    assert state.tripped is False
    assert state.spent_usd == 0.0  # spend query is skipped when disabled


# ---------------------------------------------------------------------------
# Hard-cap trip
# ---------------------------------------------------------------------------


def test_check_budget_or_raise_trips_when_spend_exceeds_cap(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_WINDOW_DAYS", 7)
    _put_event(stub_supabase, "llm_usage_events", 6.0)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(cost_guardrail.check_budget_or_raise())
    assert excinfo.value.status_code == 503
    # Trip should have written an audit row.
    audit = stub_supabase.store["admin_audit_log"]
    assert any(row.get("action") == "cost.trip" for row in audit)


def test_check_budget_or_skip_raises_budget_exceeded(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 10.0)

    with pytest.raises(cost_guardrail.BudgetExceededError):
        asyncio.run(cost_guardrail.check_budget_or_skip())


def test_check_budget_does_not_raise_when_below_cap(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 1.5)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.tripped is False
    assert state.spent_usd == pytest.approx(1.5)


# ---------------------------------------------------------------------------
# Spend aggregation
# ---------------------------------------------------------------------------


def test_spend_sums_across_llm_and_external_tables(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 100.0)
    _put_event(stub_supabase, "llm_usage_events", 1.25)
    _put_event(stub_supabase, "llm_usage_events", 0.75)
    _put_event(stub_supabase, "external_api_usage_events", 2.00)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.spent_usd == pytest.approx(4.0)
    assert state.tripped is False


def test_spend_excludes_events_outside_rolling_window(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_WINDOW_DAYS", 7)
    # Inside the 7-day window
    _put_event(stub_supabase, "llm_usage_events", 1.0)
    # 30 days ago — outside the window
    long_ago = datetime.now(timezone.utc) - timedelta(days=30)
    _put_event(stub_supabase, "llm_usage_events", 999.0, when=long_ago)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.spent_usd == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# reset_after handling
# ---------------------------------------------------------------------------


def test_reset_after_excludes_prior_spend(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    # Reset stamped 1 minute ago.
    reset_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    stub_supabase.store["cost_guardrail_state"][0]["reset_after"] = reset_at.isoformat()
    # Spend before reset (should be excluded)
    pre_reset = reset_at - timedelta(minutes=5)
    _put_event(stub_supabase, "llm_usage_events", 100.0, when=pre_reset)
    # Spend after reset (should be counted)
    post_reset = reset_at + timedelta(seconds=10)
    _put_event(stub_supabase, "llm_usage_events", 0.50, when=post_reset)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.tripped is False
    assert state.spent_usd == pytest.approx(0.5)
    assert state.reset_after == reset_at.isoformat()


def test_reset_guardrail_clears_trip(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 10.0)

    # Initially tripped.
    with pytest.raises(HTTPException):
        asyncio.run(cost_guardrail.check_budget_or_raise())

    # Reset, then the guardrail should clear because spend is pre-reset.
    new_state = asyncio.run(
        cost_guardrail.reset_guardrail({"id": "admin-id", "email": "a@b"})
    )
    assert new_state.tripped is False
    assert new_state.spent_usd == 0.0


# ---------------------------------------------------------------------------
# Cache behavior
# ---------------------------------------------------------------------------


def test_cache_returns_stale_state_within_ttl(stub_supabase, monkeypatch):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 1.0)

    # Prime the cache.
    first = asyncio.run(cost_guardrail.get_budget_state())
    assert first.spent_usd == pytest.approx(1.0)

    # Add more spend — but cache should still return the old number.
    _put_event(stub_supabase, "llm_usage_events", 50.0)
    second = asyncio.run(cost_guardrail.get_budget_state())
    assert second.spent_usd == pytest.approx(1.0), "cache should mask new spend"

    # Force=True bypasses the cache.
    third = asyncio.run(cost_guardrail.get_budget_state(force=True))
    assert third.spent_usd == pytest.approx(51.0)


def test_cache_invalidate_forces_refetch(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 1.0)

    asyncio.run(cost_guardrail.get_budget_state())
    _put_event(stub_supabase, "llm_usage_events", 2.0)

    cost_guardrail.invalidate_cache()
    refreshed = asyncio.run(cost_guardrail.get_budget_state())
    assert refreshed.spent_usd == pytest.approx(3.0)


def test_cache_expires_after_ttl(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 1.0)

    asyncio.run(cost_guardrail.get_budget_state())
    _put_event(stub_supabase, "llm_usage_events", 4.0)
    # Simulate the cache having aged past TTL by stamping an expiry in the past.
    cost_guardrail._cache["expires"] = time.monotonic() - 1.0
    refreshed = asyncio.run(cost_guardrail.get_budget_state())
    assert refreshed.spent_usd == pytest.approx(5.0)


# ---------------------------------------------------------------------------
# Soft-alert audit dedupe
# ---------------------------------------------------------------------------


def test_alerting_writes_single_audit_row_per_window(stub_supabase):
    _put_setting(stub_supabase, "FORESIGHT_COST_GUARDRAIL_ENABLED", True)
    _put_setting(stub_supabase, "FORESIGHT_COST_BUDGET_USD", 100.0)
    _put_setting(stub_supabase, "FORESIGHT_COST_ALERT_THRESHOLD_USD", 5.0)
    _put_event(stub_supabase, "llm_usage_events", 6.0)

    state1 = asyncio.run(cost_guardrail.check_budget_or_raise())
    state2 = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state1.alerting is True
    assert state2.alerting is True

    alert_rows = [
        r for r in stub_supabase.store["admin_audit_log"] if r.get("action") == "cost.alert"
    ]
    assert len(alert_rows) == 1, "should dedupe within the same window"


# ---------------------------------------------------------------------------
# Env-var fallback for settings
# ---------------------------------------------------------------------------


def test_env_var_falls_back_when_admin_settings_row_is_missing(
    stub_supabase, monkeypatch
):
    """Operators who configure the guardrail purely via env should see it apply."""
    monkeypatch.setenv(cost_guardrail.COST_ENABLED_KEY, "true")
    monkeypatch.setenv(cost_guardrail.COST_BUDGET_KEY, "10.0")
    _put_event(stub_supabase, "llm_usage_events", 25.0)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(cost_guardrail.check_budget_or_raise())
    assert exc.value.status_code == 503


def test_admin_setting_overrides_env_var(stub_supabase, monkeypatch):
    """Admin override wins over env-var value when both are present."""
    monkeypatch.setenv(cost_guardrail.COST_ENABLED_KEY, "true")
    monkeypatch.setenv(cost_guardrail.COST_BUDGET_KEY, "1.0")
    # Admin override raises the cap to 1000, so a $25 event should NOT trip.
    _put_setting(stub_supabase, cost_guardrail.COST_ENABLED_KEY, True)
    _put_setting(stub_supabase, cost_guardrail.COST_BUDGET_KEY, 1000.0)
    _put_event(stub_supabase, "llm_usage_events", 25.0)

    state = asyncio.run(cost_guardrail.check_budget_or_raise())
    assert state.tripped is False
    assert state.cap_usd == 1000.0


# ---------------------------------------------------------------------------
# Spend pagination
# ---------------------------------------------------------------------------


def test_sum_spend_paginates_past_page_size(stub_supabase, monkeypatch):
    """High-volume windows must sum every page, not just the first."""
    # Force a tiny page so the test is fast but still exercises pagination.
    monkeypatch.setattr(cost_guardrail, "_SPEND_PAGE_SIZE", 3)
    _put_setting(stub_supabase, cost_guardrail.COST_ENABLED_KEY, True)
    _put_setting(stub_supabase, cost_guardrail.COST_BUDGET_KEY, 100.0)
    # 7 events at $1 each → $7 total. With page=3, three pages are needed
    # (rows 0–2, 3–5, 6) before the loop terminates.
    for _ in range(7):
        _put_event(stub_supabase, "llm_usage_events", 1.0)

    state = asyncio.run(cost_guardrail.get_budget_state(force=True))
    assert state.spent_usd == pytest.approx(7.0)


# ---------------------------------------------------------------------------
# Fail-closed when spend cannot be computed
# ---------------------------------------------------------------------------


def test_fails_closed_when_spend_unavailable(stub_supabase, monkeypatch):
    """If pagination breaks, the guardrail must trip — not silently undercount.

    Substituting the cap for unknown spend is the safe choice: callers see
    ``tripped=True`` and stop guarded work until an admin investigates.
    """
    _put_setting(stub_supabase, cost_guardrail.COST_ENABLED_KEY, True)
    _put_setting(stub_supabase, cost_guardrail.COST_BUDGET_KEY, 50.0)

    def _boom(*_a, **_kw):
        raise cost_guardrail.SpendUnavailableError("simulated outage")

    monkeypatch.setattr(cost_guardrail, "_sum_spend", _boom)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(cost_guardrail.check_budget_or_raise())
    assert exc.value.status_code == 503
