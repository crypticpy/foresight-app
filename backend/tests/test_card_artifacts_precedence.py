"""Precedence tests for get_card_artifacts state resolution.

`executive_briefs` and `research_tasks` are loaded newest-first. The loop must
not let an older `generating` row overwrite a newer `failed` row's state — the
frontend `ArtifactStrip` resolves pending before failed, so without the guard a
newest-attempt failure would render as still-in-progress.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.card_artifacts import _artifact_cache, get_card_artifacts


class _Query:
    """Tiny stand-in for the supabase chained-query builder."""

    def __init__(self, rows):
        self._rows = rows
        self._is_null_cols: list[str] = []

    def select(self, *_a, **_kw):
        return self

    def in_(self, *_a, **_kw):
        return self

    def eq(self, *_a, **_kw):
        return self

    def is_(self, column, value):
        # Mirror PostgREST `.is_(col, "null")`: keep only rows whose column is
        # null. Filtering for real (rather than a passthrough stub) lets tests
        # verify the workstream_id IS NULL guard in _fetch_research actually
        # excludes workstream-scoped deep-research rows from the badge.
        if value in ("null", None):
            self._is_null_cols.append(column)
        return self

    def order(self, *_a, **_kw):
        return self

    def execute(self):
        rows = list(self._rows)
        for col in self._is_null_cols:
            rows = [r for r in rows if r.get(col) is None]
        return SimpleNamespace(data=rows)


class _Client:
    def __init__(self, briefs=None, research=None, workstream_cards=None, scans=None):
        self._briefs = briefs or []
        self._research = research or []
        self._workstream_cards = workstream_cards or []
        self._scans = scans or []

    def table(self, name):
        if name == "executive_briefs":
            return _Query(self._briefs)
        if name == "research_tasks":
            return _Query(self._research)
        if name == "workstream_cards":
            return _Query(self._workstream_cards)
        if name == "workstream_scans":
            return _Query(self._scans)
        return _Query([])


@pytest.fixture(autouse=True)
def _clear_cache():
    _artifact_cache.clear()
    yield
    _artifact_cache.clear()


def test_newest_failed_brief_not_masked_by_older_generating_row():
    # Newest first: failed (latest attempt) followed by an older generating
    # row. Without the precedence guard, the older row would set
    # pending_brief=True and the strip would render a spinner for a brief
    # that has actually errored.
    client = _Client(
        briefs=[
            {"card_id": "c1", "status": "failed", "error_message": "boom"},
            {"card_id": "c1", "status": "generating"},
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].failed_brief is True
    assert artifacts["c1"].pending_brief is False
    assert artifacts["c1"].brief_error_message == "boom"


def test_newest_failed_research_not_masked_by_older_processing_row():
    client = _Client(
        research=[
            {
                "card_id": "c1",
                "status": "failed",
                "task_type": "deep_research",
                "error_message": "nope",
            },
            {
                "card_id": "c1",
                "status": "processing",
                "task_type": "deep_research",
            },
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].failed_research is True
    assert artifacts["c1"].pending_research is False
    assert artifacts["c1"].research_error_message == "nope"


def test_completed_research_still_wins_over_pending_and_failed():
    # Even if a later row reports a queued retry, a completed deep-research
    # artifact for the card means the user has a ready artifact and the
    # strip should render `ready`.
    client = _Client(
        research=[
            {
                "card_id": "c1",
                "status": "completed",
                "task_type": "deep_research",
                "completed_at": "2026-05-15T00:00:00Z",
            },
            {
                "card_id": "c1",
                "status": "queued",
                "task_type": "deep_research",
            },
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].has_deep_research is True
    # An in-flight retry alongside a ready artifact still surfaces as
    # pending so the user knows a refresh is happening.
    assert artifacts["c1"].pending_research is False


def test_newest_pending_brief_set_when_no_failure_exists():
    client = _Client(
        briefs=[
            {"card_id": "c1", "status": "generating"},
            {"card_id": "c1", "status": "generating"},
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].pending_brief is True
    assert artifacts["c1"].failed_brief is False


def test_workstream_scoped_deep_research_excluded_from_badge():
    # A completed deep_research row tagged with a workstream_id is owner-private
    # (visible only via the owner arm of the research_tasks RLS policy) and must
    # NOT light the card-level badge — otherwise the cross-user Deep Research tab
    # would be empty while the badge claims a report. _fetch_research scopes the
    # badge query to workstream_id IS NULL; this asserts that exclusion.
    client = _Client(
        research=[
            {
                "card_id": "c1",
                "status": "completed",
                "task_type": "deep_research",
                "workstream_id": "ws-1",
                "completed_at": "2026-06-03T00:00:00Z",
            },
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].has_deep_research is False


def test_global_deep_research_counts_toward_badge():
    # The mirror case: a global card report (workstream_id IS NULL) survives the
    # filter and lights the badge, proving the exclusion above is the workstream
    # scoping rather than the filter dropping every row.
    client = _Client(
        research=[
            {
                "card_id": "c1",
                "status": "completed",
                "task_type": "deep_research",
                "workstream_id": None,
                "completed_at": "2026-06-03T00:00:00Z",
            },
        ]
    )
    artifacts = get_card_artifacts(client, ["c1"])
    assert artifacts["c1"].has_deep_research is True
