"""Unit tests for the discovery preset endpoint.

POST /admin/discovery/preset bulk-applies one of three coded presets
(``conservative`` / ``balanced`` / ``aggressive``). Each preset writes
8 setting rows + 8 audit rows so that a later revert of a single knob
remains searchable in the audit log.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []


class _MockTable:
    def __init__(
        self,
        rows: List[Dict[str, Any]],
        sink: Dict[str, List[Dict[str, Any]]],
        table_name: str,
    ) -> None:
        self._rows = rows
        self._sink = sink
        self._table_name = table_name
        self._mode: str = "select"
        self._payload: Optional[Dict[str, Any]] = None
        self._filters: Dict[str, Any] = {}

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def insert(self, payload: Dict[str, Any]):
        self._mode = "insert"
        self._payload = payload
        return self

    def upsert(self, payload: Dict[str, Any], **_kw):
        self._mode = "upsert"
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def execute(self) -> _MockResponse:
        if self._mode == "insert":
            self._sink.setdefault(self._table_name, []).append(self._payload or {})
            return _MockResponse([self._payload or {}])
        if self._mode == "upsert":
            self._sink.setdefault(f"{self._table_name}__upserts", []).append(
                self._payload or {}
            )
            payload = self._payload or {}
            key = payload.get("key")
            if key is not None:
                # Replace any existing row with the same key.
                self._rows[:] = [row for row in self._rows if row.get("key") != key]
            self._rows.append(dict(payload))
            return _MockResponse([dict(payload)])
        # select
        out = [
            row for row in self._rows
            if all(row.get(k) == v for k, v in self._filters.items())
        ]
        return _MockResponse(out)


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables
        self.sink: Dict[str, List[Dict[str, Any]]] = {}

    def table(self, name: str) -> _MockTable:
        return _MockTable(
            self._tables.setdefault(name, []),
            self.sink,
            name,
        )


def _mock_request() -> Any:
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        state=SimpleNamespace(),
        scope={"type": "http"},
        method="POST",
        headers={},
    )


def _disable_rate_limiter(monkeypatch):
    from app.deps import limiter

    monkeypatch.setattr(limiter, "enabled", False)


def _bypass_admin_check(monkeypatch):
    from app import authz

    monkeypatch.setattr(authz, "require_admin", lambda user: None)


def test_apply_discovery_preset_writes_eight_rows(monkeypatch):
    from app import audit_service
    from app.routers import admin as admin_router
    from app.routers import admin_settings

    actor_id = str(uuid.uuid4())
    mock_sb = _MockSupabase({"admin_settings": []})
    # apply_discovery_preset now lives in admin_settings; admin.py only
    # re-exports it for back-compat. Patch the sub-router's binding so
    # the upsert + audit insert both land on the mock.
    monkeypatch.setattr(admin_settings, "supabase", mock_sb)
    monkeypatch.setattr(audit_service, "supabase", mock_sb)
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    body = admin_router.DiscoveryPresetApply(preset="aggressive")
    actor = {"id": actor_id, "email": "admin@example.com", "role": "admin"}
    request = _mock_request()

    result = asyncio.run(
        admin_router.apply_discovery_preset(
            request=request, body=body, current_user=actor
        )
    )

    assert result["preset"] == "aggressive"
    assert len(result["items"]) == 8

    expected = admin_router.DISCOVERY_PRESETS["aggressive"]
    upserts = mock_sb.sink.get("admin_settings__upserts", [])
    assert len(upserts) == 8
    saved_by_key = {row["key"]: row for row in upserts}
    for key, value in expected.items():
        assert saved_by_key[key]["value"] == value
        assert saved_by_key[key]["group_name"] == "discovery"
        assert saved_by_key[key]["updated_by"] == actor_id

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 8
    actions = {row["action"] for row in audit_rows}
    assert actions == {"admin.discovery.preset.apply"}
    audit_keys = {row["target_id"] for row in audit_rows}
    assert audit_keys == set(expected.keys())


def test_apply_discovery_preset_records_prior_value_in_audit(monkeypatch):
    """A second preset apply should capture the first preset's values as `before`.
    This proves the per-knob audit shape is preserved across bulk applies — the
    operator can grep the audit log for "this is the moment we shifted from
    Conservative to Aggressive on weak_match_threshold".
    """
    from app import audit_service
    from app.routers import admin as admin_router
    from app.routers import admin_settings

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    mock_sb = _MockSupabase({"admin_settings": []})
    # apply_discovery_preset now lives in admin_settings; admin.py only
    # re-exports it for back-compat. Patch the sub-router's binding so
    # the upsert + audit insert both land on the mock.
    monkeypatch.setattr(admin_settings, "supabase", mock_sb)
    monkeypatch.setattr(audit_service, "supabase", mock_sb)
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    asyncio.run(
        admin_router.apply_discovery_preset(
            request=_mock_request(),
            body=admin_router.DiscoveryPresetApply(preset="conservative"),
            current_user=actor,
        )
    )
    asyncio.run(
        admin_router.apply_discovery_preset(
            request=_mock_request(),
            body=admin_router.DiscoveryPresetApply(preset="aggressive"),
            current_user=actor,
        )
    )

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    # 8 from conservative + 8 from aggressive = 16 rows total.
    assert len(audit_rows) == 16

    # Find the auto-approve-threshold transitions to verify `before` chains.
    threshold_rows = [
        row
        for row in audit_rows
        if row["target_id"] == "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD"
    ]
    assert len(threshold_rows) == 2
    # First write: no prior override -> before.value == None.
    assert threshold_rows[0]["before"] == {"value": None}
    assert threshold_rows[0]["after"] == {"value": 0.97}
    # Second write: prior is the conservative value.
    assert threshold_rows[1]["before"] == {"value": 0.97}
    assert threshold_rows[1]["after"] == {"value": 0.92}


def test_apply_discovery_preset_rejects_unknown(monkeypatch):
    """Pydantic Literal already enforces the allowed names, but the route's
    fallback ``HTTPException`` exists for paths that bypass validation
    (e.g. internal call). The Literal validation itself is tested implicitly:
    constructing ``DiscoveryPresetApply(preset='nonexistent')`` raises.
    """
    from pydantic import ValidationError
    import pytest

    from app.routers import admin as admin_router

    with pytest.raises(ValidationError):
        admin_router.DiscoveryPresetApply(preset="experimental")


def test_balanced_preset_matches_in_code_defaults():
    """Picking 'balanced' should be a clean reset to the dataclass defaults
    used by ``DiscoveryConfig``. If these drift, an admin clicking Balanced
    expecting 'go back to defaults' will be surprised.
    """
    from app.discovery_service import DiscoveryConfig
    from app.routers.admin import DISCOVERY_PRESETS

    balanced = DISCOVERY_PRESETS["balanced"]
    cfg = DiscoveryConfig()  # __post_init__ fills env defaults
    assert balanced["FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD"] == cfg.auto_approve_threshold
    assert balanced["FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD"] == cfg.similarity_threshold
    assert balanced["FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD"] == cfg.weak_match_threshold
    assert balanced["FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD"] == cfg.name_similarity_threshold
    assert balanced["FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN"] == cfg.max_new_cards_per_run
    assert balanced["FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN"] == cfg.max_queries_per_run
    assert balanced["FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY"] == cfg.max_sources_per_query
    assert balanced["FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL"] == cfg.max_sources_total
