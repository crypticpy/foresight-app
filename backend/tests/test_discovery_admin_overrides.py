"""Unit tests for live admin-settings overrides for ``DiscoveryConfig``.

Covers:
- ``load_discovery_admin_overrides`` reads from the ``admin_settings`` table.
- Resolution order: admin row > legacy env var > skip (caller falls back to
  in-code default).
- ``build_discovery_config`` merges admin overrides with explicit kwargs;
  explicit non-None kwargs win.
- Bad/uncoercible override values are logged and skipped, not raised.
- Supabase failures don't bubble up; we degrade to env / defaults.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []


class _MockTable:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows
        self._filter_in: tuple[str, list[Any]] | None = None

    def select(self, *_a, **_kw):
        return self

    def in_(self, key: str, values: list[Any]):
        self._filter_in = (key, values)
        return self

    def execute(self) -> _MockResponse:
        if not self._filter_in:
            return _MockResponse(self._rows)
        key, values = self._filter_in
        return _MockResponse(
            [row for row in self._rows if row.get(key) in values]
        )


class _MockSupabase:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def table(self, _name: str) -> _MockTable:
        return _MockTable(self._rows)


# ---------------------------------------------------------------------------
# load_discovery_admin_overrides
# ---------------------------------------------------------------------------


def _clear_legacy_env(monkeypatch):
    """Remove any legacy env vars so tests aren't sensitive to local .env state."""
    for var in (
        "DISCOVERY_MAX_QUERIES",
        "DISCOVERY_MAX_SOURCES_PER_QUERY",
        "DISCOVERY_MAX_SOURCES_TOTAL",
    ):
        monkeypatch.delenv(var, raising=False)


def test_load_overrides_reads_admin_settings(monkeypatch):
    from app import deps
    from app import discovery_service

    _clear_legacy_env(monkeypatch)
    rows = [
        {"key": "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN", "value": 42},
        {"key": "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD", "value": 0.99},
    ]
    monkeypatch.setattr(deps, "supabase", _MockSupabase(rows))

    overrides = discovery_service.load_discovery_admin_overrides()
    assert overrides == {
        "max_queries_per_run": 42,
        "auto_approve_threshold": 0.99,
    }


def test_load_overrides_legacy_env_fallback(monkeypatch):
    """When no admin row exists for a knob with a legacy env var, the env
    value is used. This preserves backward compat for ``DISCOVERY_MAX_QUERIES``,
    ``DISCOVERY_MAX_SOURCES_PER_QUERY``, and ``DISCOVERY_MAX_SOURCES_TOTAL``.
    """
    from app import deps
    from app import discovery_service

    monkeypatch.setattr(deps, "supabase", _MockSupabase([]))
    monkeypatch.setenv("DISCOVERY_MAX_QUERIES", "77")
    monkeypatch.setenv("DISCOVERY_MAX_SOURCES_TOTAL", "333")
    # Knobs without legacy env names are simply absent — defaults apply.
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_PER_QUERY", raising=False)

    overrides = discovery_service.load_discovery_admin_overrides()
    assert overrides == {
        "max_queries_per_run": 77,
        "max_sources_total": 333,
    }


def test_load_overrides_admin_row_wins_over_legacy_env(monkeypatch):
    from app import deps
    from app import discovery_service

    monkeypatch.setenv("DISCOVERY_MAX_QUERIES", "5")  # legacy env
    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase(
            [{"key": "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN", "value": 200}]
        ),
    )

    overrides = discovery_service.load_discovery_admin_overrides()
    assert overrides["max_queries_per_run"] == 200


def test_load_overrides_null_value_treated_as_no_override(monkeypatch):
    """An admin row with value=NULL means 'fall back to env / default'.
    Per the existing settings contract, ``list_admin_settings`` already
    surfaces this as ``has_override=true`` but a null effective value;
    the override loader must mirror that and skip the field entirely.
    """
    from app import deps
    from app import discovery_service

    monkeypatch.setenv("DISCOVERY_MAX_QUERIES", "88")
    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase(
            [{"key": "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN", "value": None}]
        ),
    )

    overrides = discovery_service.load_discovery_admin_overrides()
    # NULL row → fall through to legacy env var.
    assert overrides["max_queries_per_run"] == 88


def test_load_overrides_skips_uncoercible_value(monkeypatch, caplog):
    """A typo or bad row should warn, not crash, the discovery run."""
    from app import deps
    from app import discovery_service

    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase(
            [
                {
                    "key": "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD",
                    "value": "not-a-number",
                },
                {"key": "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN", "value": 50},
            ]
        ),
    )
    monkeypatch.delenv("DISCOVERY_MAX_QUERIES", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_PER_QUERY", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_TOTAL", raising=False)

    with caplog.at_level(logging.WARNING, logger="app.discovery_service"):
        overrides = discovery_service.load_discovery_admin_overrides()

    assert overrides == {"max_queries_per_run": 50}
    assert any(
        "Invalid discovery override" in rec.getMessage() for rec in caplog.records
    )


def test_load_overrides_swallows_supabase_errors(monkeypatch, caplog):
    """If supabase blows up the whole pipeline shouldn't take down a run.
    Discovery uses in-code defaults if it can't reach admin_settings.
    """
    from app import deps
    from app import discovery_service

    class _ExplodingSupabase:
        def table(self, _name):
            raise RuntimeError("boom")

    monkeypatch.setattr(deps, "supabase", _ExplodingSupabase())
    monkeypatch.delenv("DISCOVERY_MAX_QUERIES", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_PER_QUERY", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_TOTAL", raising=False)

    with caplog.at_level(logging.ERROR, logger="app.discovery_service"):
        overrides = discovery_service.load_discovery_admin_overrides()

    assert overrides == {}
    assert any(
        "Failed to read admin_settings" in rec.getMessage() for rec in caplog.records
    )


# ---------------------------------------------------------------------------
# build_discovery_config
# ---------------------------------------------------------------------------


def test_build_discovery_config_merges_admin_overrides(monkeypatch):
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service,
        "load_discovery_admin_overrides",
        lambda: {"max_queries_per_run": 42, "auto_approve_threshold": 0.99},
    )
    cfg = discovery_service.build_discovery_config()
    assert cfg.max_queries_per_run == 42
    assert cfg.auto_approve_threshold == 0.99


def test_build_discovery_config_explicit_wins(monkeypatch):
    """Per-call kwargs override admin settings — recovery / per-pillar runs
    set tighter caps and must not be relaxed by an aggressive admin preset.
    """
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service,
        "load_discovery_admin_overrides",
        lambda: {"max_new_cards_per_run": 5},
    )
    cfg = discovery_service.build_discovery_config(max_new_cards_per_run=50)
    assert cfg.max_new_cards_per_run == 50


def test_build_discovery_config_none_explicit_falls_through(monkeypatch):
    """An explicit ``max_queries_per_run=None`` (e.g. from a request that
    didn't specify) must NOT clobber the admin override with None.
    """
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service,
        "load_discovery_admin_overrides",
        lambda: {"max_queries_per_run": 42},
    )
    cfg = discovery_service.build_discovery_config(max_queries_per_run=None)
    assert cfg.max_queries_per_run == 42


def test_build_discovery_config_categories_to_scan_disables_others(monkeypatch):
    """``categories_to_scan`` from a schedule must turn off any category
    not in the list, otherwise scope overrides have no effect."""
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service, "load_discovery_admin_overrides", lambda: {}
    )
    monkeypatch.setattr(
        discovery_service, "load_active_source_urls", lambda category: []
    )
    cfg = discovery_service.build_discovery_config(categories_to_scan=["rss"])
    cats = cfg.source_categories
    assert cats[discovery_service.SourceCategory.RSS.value].enabled is True
    assert cats[discovery_service.SourceCategory.NEWS.value].enabled is False
    assert cats[discovery_service.SourceCategory.ACADEMIC.value].enabled is False


def test_build_discovery_config_source_ids_filters_registry(monkeypatch):
    """``source_ids`` must restrict each category's URL list to URLs from
    those registry rows, and disable categories with no matching rows."""
    from app import deps
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service, "load_discovery_admin_overrides", lambda: {}
    )
    monkeypatch.setattr(
        discovery_service, "load_active_source_urls", lambda category: []
    )

    class _Tbl:
        def __init__(self, rows):
            self._rows = rows
            self._ids = []

        def select(self, _cols):
            return self

        def in_(self, _key, ids):
            self._ids = list(ids)
            return self

        def execute(self):
            class _R:
                pass

            r = _R()
            r.data = [row for row in self._rows if row["id"] in self._ids]
            return r

    class _SB:
        def __init__(self, rows):
            self._rows = rows

        def table(self, _name):
            return _Tbl(self._rows)

    monkeypatch.setattr(
        deps,
        "supabase",
        _SB(
            [
                {
                    "id": "id-1",
                    "category": "rss",
                    "url": "https://feed-a/rss",
                    "enabled": True,
                },
                {
                    "id": "id-2",
                    "category": "rss",
                    "url": "https://feed-b/rss",
                    "enabled": False,
                },
            ]
        ),
    )

    cfg = discovery_service.build_discovery_config(source_ids=["id-1", "id-2"])
    rss_cat = cfg.source_categories[discovery_service.SourceCategory.RSS.value]
    assert rss_cat.enabled is True
    assert rss_cat.rss_feeds == ["https://feed-a/rss"]
    # Categories without matching rows should be disabled.
    news_cat = cfg.source_categories[discovery_service.SourceCategory.NEWS.value]
    assert news_cat.enabled is False


def test_build_discovery_config_no_overrides_returns_defaults(monkeypatch):
    from app import discovery_service

    monkeypatch.setattr(
        discovery_service, "load_discovery_admin_overrides", lambda: {}
    )
    monkeypatch.delenv("DISCOVERY_MAX_QUERIES", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_PER_QUERY", raising=False)
    monkeypatch.delenv("DISCOVERY_MAX_SOURCES_TOTAL", raising=False)
    cfg = discovery_service.build_discovery_config()
    # In-code defaults from DiscoveryConfig + get_discovery_defaults().
    assert cfg.auto_approve_threshold == 0.95
    assert cfg.similarity_threshold == 0.85
    assert cfg.max_new_cards_per_run == 15
    assert cfg.max_queries_per_run == 100  # env default in get_discovery_defaults
