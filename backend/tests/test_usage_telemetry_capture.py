"""Tests for prompt/response payload capture in record_llm_usage_event.

Covers the FORESIGHT_AUDIT_LLM_CONTENT gate, redaction wiring, and
request-kind filtering (embeddings stay metric-only).
"""

from __future__ import annotations

import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _capture_inserts(monkeypatch) -> list[dict[str, Any]]:
    """Replace the telemetry submit hook with a synchronous capture sink.

    Telemetry now flows through ``_submit_telemetry`` (a hand-rolled bounded
    queue), so we monkeypatch it to invoke its task inline. That keeps the
    audit-payload build (inside ``_insert_llm_usage_event``) running against
    the test's monkeypatched ``is_audit_content_enabled``. The DB-touching
    ``_insert_event`` is stubbed to capture the assembled row instead of
    issuing a Supabase insert.
    """
    from app import usage_telemetry

    captured: list[dict[str, Any]] = []

    def _capture_insert(table: str, event: dict[str, Any]) -> None:
        if table == "llm_usage_events":
            captured.append(dict(event))

    def _sync_submit(task):
        task()

    monkeypatch.setattr(usage_telemetry, "_submit_telemetry", _sync_submit)
    monkeypatch.setattr(usage_telemetry, "_insert_event", _capture_insert)
    return captured


def test_capture_disabled_omits_payload_columns(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: False)

    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="gpt-5.4",
        operation="openai.chat.completions",
        request_kind="chat.completions",
        input_tokens=10,
        output_tokens=20,
        total_tokens=30,
        messages=[{"role": "user", "content": "ping me at jane@example.com"}],
        response_text="hi",
    )

    assert len(captured) == 1
    event = captured[0]
    assert "prompt_excerpt" not in event
    assert "response_excerpt" not in event
    assert "redaction_flags" not in event
    # Metrics still flow through.
    assert event["input_tokens"] == 10
    assert event["model"] == "gpt-5.4"


def test_capture_enabled_redacts_and_stores_excerpts(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: True)

    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="gpt-5.4",
        operation="openai.chat.completions",
        request_kind="chat.completions",
        input_tokens=10,
        output_tokens=20,
        total_tokens=30,
        messages=[
            {"role": "system", "content": "you are helpful"},
            {"role": "user", "content": "email me at jane@example.com please"},
        ],
        response_text="OK, calling 512-555-1234",
    )

    assert len(captured) == 1
    event = captured[0]
    assert "[REDACTED:EMAIL]" in event["prompt_excerpt"]
    assert "[REDACTED:PHONE_US]" in event["response_excerpt"]
    assert set(event["redaction_flags"]) == {"EMAIL", "PHONE_US"}


def test_embeddings_request_kind_not_audited_even_when_enabled(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: True)

    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="text-embedding-ada-002",
        operation="openai.embeddings",
        request_kind="embeddings",
        input_tokens=100,
        messages=[{"role": "user", "content": "card body to embed jane@example.com"}],
    )

    assert len(captured) == 1
    event = captured[0]
    assert "prompt_excerpt" not in event
    assert "redaction_flags" not in event


def test_capture_enabled_with_no_payload_skips_payload_columns(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: True)

    # Error path inside the proxy passes neither response_text nor messages
    # (e.g. the LLM call raised before kwargs even reached the API).
    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="gpt-5.4",
        operation="openai.chat.completions",
        request_kind="chat.completions",
        status="error",
        error_type="TimeoutError",
    )

    event = captured[0]
    assert "prompt_excerpt" not in event
    assert event["status"] == "error"


def test_capture_truncates_excerpt_to_4kb(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: True)

    huge = "x" * 10000
    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="gpt-5.4",
        operation="openai.chat.completions",
        request_kind="chat.completions",
        messages=[{"role": "user", "content": huge}],
        response_text=huge,
    )

    event = captured[0]
    assert event["prompt_excerpt"].endswith("…[truncated]")
    assert event["response_excerpt"].endswith("…[truncated]")
    # Encoded byte length of the body (before the marker) should be at most
    # 4 KB.
    body = event["response_excerpt"].removesuffix("…[truncated]")
    assert len(body.encode("utf-8")) <= 4096


def test_capture_serializes_tool_calls_and_redacts_arguments(monkeypatch):
    from app import usage_telemetry

    captured = _capture_inserts(monkeypatch)
    monkeypatch.setattr(usage_telemetry, "is_audit_content_enabled", lambda: True)

    usage_telemetry.record_llm_usage_event(
        provider="openai",
        model="gpt-5.4",
        operation="openai.chat.completions",
        request_kind="chat.completions",
        tool_calls=[
            {
                "name": "lookup_user",
                "arguments": '{"email": "jane@example.com"}',
            }
        ],
    )

    event = captured[0]
    assert event["tool_calls"][0]["name"] == "lookup_user"
    assert "[REDACTED:EMAIL]" in event["tool_calls"][0]["arguments"]
    assert "EMAIL" in event["redaction_flags"]
