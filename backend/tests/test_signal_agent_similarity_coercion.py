"""Regression tests for find_similar_cards NaN-similarity handling.

The signal agent's centroid search (``_prefetch_related_signals``) and its
``search_existing_signals`` tool both read the RPC's ``similarity`` column.
When a *stored* card embedding is a zero/degenerate vector (embedding
generation failed and fell back to all-zeros), pgvector's cosine distance
(``<=>``) is NaN, so the RPC returns ``similarity = 1 - NaN = NaN``. Because
JSON has no NaN literal, PostgREST serializes the float8 NaN as the JSON
*string* ``"NaN"``. Formatting that string with ``:.2f`` raised
``ValueError: Unknown format code 'f' for object of type 'str'`` and killed
every pillar batch *before any LLM call* — 0 cards created on every discovery
run (the production "no net-new cards" outage of 2026-06-03).

These tests pin the boundary coercion (``_coerce_similarity``) and that
``_prefetch_related_signals`` drops NaN matches so downstream ``:.2f``
formatting can never crash again.

CI does not install pytest-asyncio (see requirements-dev.txt) — async
coroutines are driven via ``asyncio.run``, matching the rest of the suite.
"""

from __future__ import annotations

import asyncio
import math
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import signal_agent_service as svc  # noqa: E402


# ---------------------------------------------------------------------------
# _coerce_similarity — the boundary helper
# ---------------------------------------------------------------------------


def test_coerce_similarity_passes_finite_floats():
    assert svc._coerce_similarity(0.85) == 0.85
    assert svc._coerce_similarity(0) == 0.0
    assert svc._coerce_similarity(1) == 1.0


def test_coerce_similarity_parses_numeric_strings():
    """PostgREST serializes Postgres numeric as a JSON string — finite
    numeric strings must still round-trip to a float."""
    assert svc._coerce_similarity("0.85") == 0.85
    assert svc._coerce_similarity("1") == 1.0


def test_coerce_similarity_rejects_nan_string():
    """The exact production payload: float8 NaN serialized as the string
    'NaN'. This is the value that crashed every run."""
    assert svc._coerce_similarity("NaN") is None


def test_coerce_similarity_rejects_nonfinite_floats():
    assert svc._coerce_similarity(float("nan")) is None
    assert svc._coerce_similarity(float("inf")) is None
    assert svc._coerce_similarity(float("-inf")) is None


def test_coerce_similarity_rejects_garbage_and_none():
    assert svc._coerce_similarity(None) is None
    assert svc._coerce_similarity("abc") is None
    assert svc._coerce_similarity("") is None


def test_coerced_value_is_safe_for_float_formatting():
    """The whole point: a coerced value must never raise on ``:.2f``."""
    for raw in (0.85, "0.5", 0, 1):
        coerced = svc._coerce_similarity(raw)
        assert coerced is not None
        assert f"{coerced:.2f}"  # would raise pre-fix on a stray string


# ---------------------------------------------------------------------------
# _prefetch_related_signals — drops NaN matches at the boundary
# ---------------------------------------------------------------------------


def _make_service(rpc_rows):
    """Service whose find_similar_cards RPC returns ``rpc_rows``."""
    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = MagicMock(data=rpc_rows)
    return svc.SignalAgentService(
        supabase=supabase,
        run_id="00000000-0000-0000-0000-000000000000",
    )


def _src_with_embedding():
    """Minimal ProcessedSource-like stub exposing a non-empty .embedding."""
    s = MagicMock()
    s.embedding = [0.1] * 1536
    return s


def test_prefetch_drops_nan_rows_and_coerces_strings():
    rows = [
        {"id": "a", "name": "Real match", "pillar_id": "PS",
         "horizon": "H2", "summary": "x", "similarity": 0.91},
        {"id": "b", "name": "Numeric string", "pillar_id": "CH",
         "horizon": "H1", "summary": "y", "similarity": "0.80"},
        {"id": "c", "name": "Zero-vector match", "pillar_id": "HG",
         "horizon": "H2", "summary": "z", "similarity": "NaN"},
    ]
    service = _make_service(rows)

    related = asyncio.run(service._prefetch_related_signals([_src_with_embedding()]))

    ids = [r["id"] for r in related]
    assert ids == ["a", "b"]  # NaN row dropped
    # All retained similarities are finite floats, safe to format.
    for r in related:
        assert isinstance(r["similarity"], float)
        assert math.isfinite(r["similarity"])
        assert f"{r['similarity']:.2f}"


def test_prefetch_returns_empty_when_all_matches_are_nan():
    """The exact production scenario: the 9 zero-vector cards match every
    centroid, so the RPC returns only NaN rows. Prefetch must return [] so
    the agent sees 'None found' and proceeds to create new signals."""
    rows = [
        {"id": str(i), "name": f"zero-{i}", "pillar_id": "HG",
         "horizon": "H2", "summary": "", "similarity": "NaN"}
        for i in range(9)
    ]
    service = _make_service(rows)

    related = asyncio.run(service._prefetch_related_signals([_src_with_embedding()]))

    assert related == []


def test_prefetch_output_never_crashes_existing_text_format():
    """End-to-end guard: the existing_text loop (`:.2f`) over the prefetch
    output must never raise, even when the RPC mixes NaN and finite rows."""
    rows = [
        {"id": "a", "name": "ok", "pillar_id": "PS", "horizon": "H2",
         "summary": "s", "similarity": "NaN"},
        {"id": "b", "name": "ok2", "pillar_id": "CH", "horizon": "H1",
         "summary": "s2", "similarity": 0.77},
    ]
    service = _make_service(rows)
    related = asyncio.run(service._prefetch_related_signals([_src_with_embedding()]))

    # Mirror the production existing_text construction.
    text = "\n".join(
        f"- [{s['id']}] \"{s['name']}\" "
        f"(pillar: {s.get('pillar_id', '?')}, "
        f"horizon: {s.get('horizon', '?')}, "
        f"similarity: {s.get('similarity', 0):.2f})"
        for s in related
    )
    assert "0.77" in text
    assert "NaN" not in text
