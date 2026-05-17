"""Unit tests for the admin audit log.

Verifies:
- ``update_admin_user`` writes a row into ``admin_audit_log`` with
  before/after restricted to fields that actually changed.
- ``update_admin_setting`` writes a row with prior value -> new value.
- The helper swallows insert errors instead of bubbling them up
  (mutation has already succeeded by then).
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase chain — supports the subset used by admin.py:
# .select / .update / .insert / .upsert / .eq / .single / .execute
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(
        self,
        data: Optional[List[Dict[str, Any]]] = None,
        count: Optional[int] = None,
    ) -> None:
        self.data = data or []
        self.count = count


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
        self._single = False

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def update(self, payload: Dict[str, Any]):
        self._mode = "update"
        self._payload = payload
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

    def limit(self, *_a, **_kw):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self) -> _MockResponse:
        if self._mode == "insert":
            self._sink.setdefault(self._table_name, []).append(self._payload or {})
            return _MockResponse([self._payload or {}])

        if self._mode in ("update", "upsert"):
            self._sink.setdefault(f"{self._table_name}__updates", []).append(
                {"payload": self._payload, "filters": dict(self._filters)}
            )
            # Apply onto the in-memory rows so subsequent selects see the change.
            updated_rows: List[Dict[str, Any]] = []
            for row in self._rows:
                if all(row.get(k) == v for k, v in self._filters.items()):
                    row.update(self._payload or {})
                    updated_rows.append(row)
            if self._mode == "upsert" and not updated_rows:
                # Insert-style upsert.
                self._rows.append(dict(self._payload or {}))
                updated_rows = [self._rows[-1]]
            return _MockResponse(updated_rows)

        # select
        out = []
        for row in self._rows:
            if all(row.get(k) == v for k, v in self._filters.items()):
                out.append(row)
        if self._single:
            data = out[:1]
            return _MockResponse(data[0] if data else None)  # type: ignore[arg-type]
        return _MockResponse(out, count=len(out))


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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


def _mock_request() -> Any:
    """Just enough Request-shape for slowapi + the audit helper.

    slowapi reads ``request.client.host`` and writes through ``request.state``.
    The audit helper reads ``request.client.host`` for the audit row.
    """
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        state=SimpleNamespace(),
        scope={"type": "http"},
        method="PATCH",
        headers={},
    )


def _disable_rate_limiter(monkeypatch):
    from app.deps import limiter

    monkeypatch.setattr(limiter, "enabled", False)


def _bypass_admin_check(monkeypatch):
    """`require_admin` looks at user role; tests use ``role="admin"`` users
    so this is a no-op, but we keep the seam in case the role check evolves."""
    from app import authz

    monkeypatch.setattr(authz, "require_admin", lambda user: None)


def _patch_supabase(monkeypatch, mock_sb) -> None:
    """Patch the supabase singleton everywhere the admin paths reach for it.

    ``app.routers.admin`` holds the reference used by the primary
    mutation, and ``app.audit_service`` holds a separate top-level
    reference used by the audit insert. Tests must replace both so a
    single mock captures the full mutation + audit write.
    """
    from app import audit_service
    from app.routers import admin as admin_router

    monkeypatch.setattr(admin_router, "supabase", mock_sb)
    monkeypatch.setattr(audit_service, "supabase", mock_sb)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_update_admin_user_writes_audit_log(monkeypatch):
    from app.routers import admin as admin_router

    user_id = _uuid()
    actor_id = _uuid()
    actor_email = "admin@example.com"

    tables: Dict[str, List[Dict[str, Any]]] = {
        "users": [
            {
                "id": user_id,
                "email": "subject@example.com",
                "role": "user",
                "account_type": "guest",
                "display_name": "Old Name",
            }
        ],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    monkeypatch.setattr(
        admin_router, "evict_cached_profile", lambda _uid: None
    )
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    body = admin_router.AdminUserUpdate(role="admin", account_type="paid")
    request = _mock_request()
    actor = {"id": actor_id, "email": actor_email, "role": "admin"}

    result = asyncio.run(
        admin_router.update_admin_user(
            request=request,
            user_id=user_id,
            update=body,
            current_user=actor,
        )
    )
    assert result["role"] == "admin"
    assert result["account_type"] == "paid"

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1, "exactly one audit row should be written"
    row = audit_rows[0]
    assert row["actor_id"] == actor_id
    assert row["actor_email"] == actor_email
    assert row["action"] == "admin.user.update"
    assert row["target_type"] == "user"
    assert row["target_id"] == user_id
    # before/after only contain the fields actually being changed.
    assert row["before"] == {"role": "user", "account_type": "guest"}
    assert row["after"] == {"role": "admin", "account_type": "paid"}
    assert row["request_ip"] == "127.0.0.1"


def test_update_admin_setting_writes_audit_log(monkeypatch):
    from app.routers import admin as admin_router

    actor_id = _uuid()
    actor_email = "admin@example.com"
    key = "FORESIGHT_CHAT_DAILY_SESSIONS"

    tables: Dict[str, List[Dict[str, Any]]] = {
        "admin_settings": [
            {
                "key": key,
                "value": 3,
                "value_type": "number",
                "group_name": "chat",
                "label": "Daily chat sessions",
            }
        ],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    body = admin_router.AdminSettingUpdate(value=10)
    request = _mock_request()
    actor = {"id": actor_id, "email": actor_email, "role": "admin"}

    asyncio.run(
        admin_router.update_admin_setting(
            request=request,
            key=key,
            update=body,
            current_user=actor,
        )
    )

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert row["action"] == "admin.setting.update"
    assert row["target_type"] == "setting"
    assert row["target_id"] == key
    assert row["before"] == {"value": 3}
    assert row["after"] == {"value": 10}


def test_update_admin_setting_no_prior_override(monkeypatch):
    """First-time save (no admin_settings row yet) should still write a clean
    audit entry with before={"value": None}, distinguishing "no override" from
    a real prior value."""
    from app.routers import admin as admin_router

    actor_id = _uuid()
    key = "FORESIGHT_CHAT_DAILY_SESSIONS"

    # Empty admin_settings — this is the upsert-as-insert path.
    mock_sb = _MockSupabase({"admin_settings": []})
    _patch_supabase(monkeypatch, mock_sb)
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    body = admin_router.AdminSettingUpdate(value=10)
    request = _mock_request()
    actor = {"id": actor_id, "email": "admin@example.com", "role": "admin"}

    asyncio.run(
        admin_router.update_admin_setting(
            request=request,
            key=key,
            update=body,
            current_user=actor,
        )
    )

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert row["target_id"] == key
    # No prior override row → before captures None, not the env default.
    assert row["before"] == {"value": None}
    assert row["after"] == {"value": 10}


def test_update_admin_user_returns_404_when_target_missing(monkeypatch):
    """Concurrent delete must return 404, not 500.

    Earlier the read-before-write used .single(), which PostgREST treats as an
    error on zero rows. The fix uses .limit(1) so a missing user cleanly
    surfaces as 404.
    """
    import pytest
    from fastapi import HTTPException

    from app.routers import admin as admin_router

    mock_sb = _MockSupabase({"users": []})
    _patch_supabase(monkeypatch, mock_sb)
    monkeypatch.setattr(
        admin_router, "evict_cached_profile", lambda _uid: None
    )
    _disable_rate_limiter(monkeypatch)
    _bypass_admin_check(monkeypatch)

    body = admin_router.AdminUserUpdate(role="admin")
    request = _mock_request()
    actor = {"id": _uuid(), "email": "admin@example.com", "role": "admin"}

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_router.update_admin_user(
                request=request,
                user_id=_uuid(),
                update=body,
                current_user=actor,
            )
        )
    assert exc.value.status_code == 404


def test_redact_for_audit_masks_sensitive_keys():
    from app.audit_service import redact_for_audit

    # A field that *itself* names a secret gets masked.
    assert redact_for_audit("FORESIGHT_SOMETHING", {"api_key": "abc"}) == {
        "api_key": "***REDACTED***"
    }
    # A non-sensitive field passes through.
    assert redact_for_audit("FORESIGHT_X", {"value": 7}) == {"value": 7}
    # When the *target_id* names a secret, every field's value is masked
    # (a setting like AZURE_OPENAI_API_KEY would route into here).
    assert redact_for_audit("AZURE_OPENAI_API_KEY", {"value": "sk-xyz"}) == {
        "value": "***REDACTED***"
    }
    # None values stay None — distinguishes "no override" from "had a value
    # but we hid it".
    assert redact_for_audit("AZURE_OPENAI_API_KEY", {"value": None}) == {
        "value": None
    }


def test_redact_for_audit_masks_nested_and_scalar_secrets():
    """Defense-in-depth: redaction must walk nested dicts and lists, and
    a sensitive ``target_id`` must mask scalar/list payloads too — not
    just top-level dict values.

    Current admin routes only pass flat dicts, but the audit_service is a
    shared utility; a future caller passing ``{"config": {"api_key": ...}}``
    or a bare scalar under a key like ``AZURE_OPENAI_API_KEY`` must not
    leak the secret into ``admin_audit_log``.
    """
    from app.audit_service import redact_for_audit

    # Nested dict — secret one level down is masked, surrounding structure
    # is preserved so the audit row still tells the shape of what was hidden.
    assert redact_for_audit(
        "FORESIGHT_X", {"config": {"api_key": "sk-abc", "model": "gpt-5.4"}}
    ) == {
        "config": {"api_key": "***REDACTED***", "model": "gpt-5.4"}
    }

    # List of dicts — recursion walks every element.
    assert redact_for_audit(
        "FORESIGHT_X",
        {"creds": [{"token": "t1"}, {"token": "t2"}, {"safe": "ok"}]},
    ) == {
        "creds": [
            {"token": "***REDACTED***"},
            {"token": "***REDACTED***"},
            {"safe": "ok"},
        ]
    }

    # Sensitive ``target_id`` + scalar payload — the bare value must be
    # masked, not pass through.
    assert redact_for_audit("AZURE_OPENAI_API_KEY", "sk-xyz") == "***REDACTED***"

    # Sensitive ``target_id`` + list payload — every leaf scalar masked.
    assert redact_for_audit(
        "AZURE_OPENAI_API_KEY", ["sk-1", "sk-2"]
    ) == ["***REDACTED***", "***REDACTED***"]

    # Sensitive ``target_id`` + None payload still preserves None.
    assert redact_for_audit("AZURE_OPENAI_API_KEY", None) is None

    # Non-sensitive ``target_id`` + scalar payload passes through (we only
    # redact scalars when the target_id flags the whole subtree as suspect).
    assert redact_for_audit("FORESIGHT_X", "plain-value") == "plain-value"


def test_log_admin_action_swallows_insert_errors(monkeypatch, caplog):
    """Audit insert failure must not raise — the underlying mutation already
    succeeded by the time we get here, and a missed audit row is a logging
    concern, not an HTTP error.
    """
    import logging

    from app import audit_service

    class _ExplodingSupabase:
        def table(self, _name):
            raise RuntimeError("boom")

    monkeypatch.setattr(audit_service, "supabase", _ExplodingSupabase())

    # Should not raise.
    with caplog.at_level(logging.ERROR, logger="app.audit_service"):
        audit_service.log_admin_action(
            actor={"id": _uuid(), "email": "a@b.c"},
            action="admin.test",
            target_type="user",
            target_id=_uuid(),
            before=None,
            after=None,
            request=_mock_request(),
        )

    # The swallowed error must surface in logs so operators can notice —
    # check the message, the level, and that the offending action is named
    # so a grep through logs can trace it back to the call site.
    matching = [
        r
        for r in caplog.records
        if r.name == "app.audit_service"
        and r.levelno == logging.ERROR
        and "Failed to write admin_audit_log" in r.getMessage()
        and "admin.test" in r.getMessage()
    ]
    assert matching, (
        "expected a logger.exception('Failed to write admin_audit_log ...') "
        "call on app.audit_service when the insert raises"
    )
