"""Unit tests for the PII / secret redactor used by audit-content capture."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.redaction import (
    merge_flags,
    redact,
    redact_and_truncate,
    truncate_excerpt,
)


def test_redact_email_replaces_inline():
    out, flags = redact("contact me at jane.doe+work@example.com please")
    assert "[REDACTED:EMAIL]" in out
    assert "jane.doe" not in out
    assert flags == ["EMAIL"]


def test_redact_phone_us_variants():
    cases = [
        "call (512) 555-1234",
        "phone: 512-555-1234",
        "+1 512.555.1234 mobile",
        "5125551234",
    ]
    for text in cases:
        out, flags = redact(text)
        assert "[REDACTED:PHONE_US]" in out, f"missed phone in {text!r} -> {out!r}"
        assert "PHONE_US" in flags


def test_redact_phone_does_not_match_dates_or_short_runs():
    # 10-digit timestamps and dates should not match because the area code
    # rule rejects leading 0/1 (and dates aren't 10 contiguous digits anyway).
    for safe in [
        "build 1234567890",  # 1-prefixed area code rejected
        "version 1.2.3.4",  # IPv4-shaped, not phone
        "year 2026 month 05",
    ]:
        out, flags = redact(safe)
        assert "PHONE_US" not in flags, f"false positive on {safe!r}: {flags}"


def test_redact_ssn():
    out, flags = redact("SSN: 123-45-6789 verified")
    assert "[REDACTED:SSN]" in out
    assert flags == ["SSN"]


def test_redact_api_keys():
    text = (
        "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAAAA "
        "GH=ghp_BBBBBBBBBBBBBBBBBBBBBBBB "
        "AWS=AKIAIOSFODNN7EXAMPLE"
    )
    out, flags = redact(text)
    assert "sk-proj-A" not in out
    assert "ghp_B" not in out
    assert "AKIAIOSFOD" not in out
    assert "API_KEY" in flags


def test_redact_jwt():
    jwt = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ."
        "AAAAAAAAAAAAAAAAAAAAAA"
    )
    out, flags = redact(f"token: {jwt}")
    assert "[REDACTED:JWT]" in out
    assert "JWT" in flags


def test_redact_ipv4_validates_octets():
    # Valid IP redacted, invalid (>255) left alone, version string left alone.
    text = "client 10.0.0.5 via 999.1.2.3 build 1.2.3.4"
    out, flags = redact(text)
    assert "[REDACTED:IPV4]" in out
    # 999.x.x.x must not be redacted
    assert "999.1.2.3" in out
    assert "IPV4" in flags
    # 1.2.3.4 is technically a valid IP — should be redacted too.
    assert out.count("[REDACTED:IPV4]") == 2


def test_redact_multiple_pii_types_sets_all_flags():
    out, flags = redact(
        "Hi jane@example.com — call (512) 555-1234, ssn 123-45-6789"
    )
    assert set(flags) == {"EMAIL", "PHONE_US", "SSN"}
    assert "[REDACTED:EMAIL]" in out
    assert "[REDACTED:PHONE_US]" in out
    assert "[REDACTED:SSN]" in out


def test_redact_empty_and_none():
    assert redact("") == ("", [])
    assert redact(None) == ("", [])


def test_truncate_excerpt_preserves_short_text():
    assert truncate_excerpt("hello") == "hello"


def test_truncate_excerpt_caps_long_text():
    text = "a" * 5000
    out = truncate_excerpt(text)
    assert out.endswith("…[truncated]")
    # Body before the marker should be exactly 4096 'a's.
    body = out.removesuffix("…[truncated]")
    assert body == "a" * 4096


def test_truncate_excerpt_safe_on_multibyte_boundary():
    text = "héllo " * 1000  # multi-byte chars near the boundary
    out = truncate_excerpt(text)
    # No UnicodeDecodeError, ends with marker, decodes cleanly.
    assert out.endswith("…[truncated]")
    out.encode("utf-8")  # round-trip


def test_redact_and_truncate_runs_both():
    text = "ping 10.0.0.1 " + ("x" * 5000)
    out, flags = redact_and_truncate(text)
    assert "[REDACTED:IPV4]" in out
    assert out.endswith("…[truncated]")
    assert "IPV4" in flags


def test_merge_flags_dedupes_and_sorts():
    assert merge_flags([["EMAIL"], ["EMAIL", "SSN"], []]) == ["EMAIL", "SSN"]
