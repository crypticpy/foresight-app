"""Property tests for the admin model-setting allowlist.

Guards three invariants that, if broken, silently route prod traffic to a
retired or non-existent model:

1. Every model SETTING_DEFINITIONS entry carries an allowed_values list.
2. The factory DEFAULT_* values are themselves members of the allowlist —
   otherwise an admin "reset to default" would be rejected.
3. Known-retired model IDs (gpt-5.5, gpt-4o, gpt-4.1) are not in the
   chat allowlist — these are the values we're actively guarding against.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Required env so openai_provider can import. Tests don't make real calls.
os.environ.setdefault("OPENAI_API_KEY", "test-key-for-import-only")

from app.openai_provider import (  # noqa: E402
    ALLOWED_CHAT_MODELS,
    ALLOWED_EMBEDDING_MODELS,
    ALLOWED_REASONING_EFFORTS,
    DEFAULT_CHAT_AGENT_MODEL,
    DEFAULT_CHAT_MINI_MODEL,
    DEFAULT_CHAT_MODEL,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_REASONING_EFFORT,
)
from app.routers.admin import SETTING_DEFINITIONS  # noqa: E402


_MODEL_KEYS_WITH_ALLOWLIST = {
    "OPENAI_CHAT_MODEL": ALLOWED_CHAT_MODELS,
    "OPENAI_CHAT_AGENT_MODEL": ALLOWED_CHAT_MODELS,
    "OPENAI_CHAT_MINI_MODEL": ALLOWED_CHAT_MODELS,
    "OPENAI_EMBEDDING_MODEL": ALLOWED_EMBEDDING_MODELS,
    "OPENAI_REASONING_EFFORT": ALLOWED_REASONING_EFFORTS,
}


def _definition(key: str) -> dict:
    for item in SETTING_DEFINITIONS:
        if item["key"] == key:
            return item
    raise AssertionError(f"SETTING_DEFINITIONS missing key {key!r}")


@pytest.mark.parametrize("key,allowlist", list(_MODEL_KEYS_WITH_ALLOWLIST.items()))
def test_model_settings_carry_allowed_values(key, allowlist):
    definition = _definition(key)
    assert "allowed_values" in definition, (
        f"{key} must declare allowed_values so the admin endpoint rejects "
        f"retired or typo'd model IDs"
    )
    # Hardening: catch malformed definitions early — an empty list would
    # silently accept any value (membership check passes when set is empty
    # only against another empty set, but a missing/None entry could fail
    # confusingly downstream); a non-string entry would never match a real
    # admin payload (always str) and is almost certainly a typo.
    assert definition["allowed_values"], (
        f"{key} allowed_values must be non-empty"
    )
    assert all(isinstance(v, str) for v in definition["allowed_values"]), (
        f"{key} allowed_values must be strings; got "
        f"{definition['allowed_values']!r}"
    )
    assert set(definition["allowed_values"]) == set(allowlist), (
        f"{key} allowed_values drifted from openai_provider; keep them in sync"
    )


@pytest.mark.parametrize(
    "key,default",
    [
        ("OPENAI_CHAT_MODEL", DEFAULT_CHAT_MODEL),
        ("OPENAI_CHAT_AGENT_MODEL", DEFAULT_CHAT_AGENT_MODEL),
        ("OPENAI_CHAT_MINI_MODEL", DEFAULT_CHAT_MINI_MODEL),
        ("OPENAI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
        ("OPENAI_REASONING_EFFORT", DEFAULT_REASONING_EFFORT),
    ],
)
def test_factory_defaults_are_in_their_allowlist(key, default):
    """A reset-to-default must round-trip through the allowlist check."""
    definition = _definition(key)
    assert default in definition["allowed_values"], (
        f"{key} default {default!r} is missing from its own allowlist — "
        f"admin reset-to-default would 400"
    )


@pytest.mark.parametrize(
    "retired_id",
    ["gpt-5.5", "gpt-5.5-preview", "gpt-4o", "gpt-4o-mini", "gpt-4.1"],
)
def test_retired_models_are_blocked_from_chat_tiers(retired_id):
    assert retired_id not in ALLOWED_CHAT_MODELS, (
        f"{retired_id} is retired per CLAUDE.md; it must not be settable on "
        f"any chat tier"
    )
