"""Goal-to-query translator for the coverage balancer.

The balancer dispatcher (PR-E) needs concrete web-search queries when an
operator asks it to "fill the gap" under a starved CSP goal. Goal rows
ship with a ``name`` and ``description`` but no keywords/synonyms, so this
service uses the mini chat model to derive 4-6 short search queries for a
goal and caches them on ``csp_goals.query_aliases`` (see migration
``20260512000010_csp_goal_query_aliases.sql``).

Design points:

- **Pure async API.** ``derive_queries(goal_id)`` returns ``list[str]`` and
  is safe to call from a request handler. Supabase reads/writes are wrapped
  in ``asyncio.to_thread`` to keep the event loop unblocked.
- **Cache-first.** A goal whose stored ``query_aliases_version`` matches
  the active ``CLASSIFIER_VERSION`` short-circuits without an LLM call.
- **Best-effort persistence.** If the LLM returns a usable list but the
  cache write fails (Supabase down, schema drift), we still return the
  queries — discovery shouldn't block on a cache write.
- **Bounded blast radius.** Output is clamped to ``MAX_QUERIES`` and each
  query is bounded by ``MAX_QUERY_LENGTH`` chars. A malformed response
  (no JSON, empty list) raises ``QueryDerivationError`` so callers can
  decide whether to fall back to a static term.
- **Telemetry.** Cost & token usage land in ``usage_telemetry`` via the
  proxy wired in ``openai_provider``. No manual usage write needed here.

This module deliberately avoids any dependency on FastAPI types so it can
be exercised from worker code, scripts, and admin endpoints alike.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from uuid import UUID

from openai import AsyncOpenAI

from app.deps import supabase as default_supabase
from app.lens_classification_service import CLASSIFIER_VERSION
from app.openai_provider import (
    get_chat_mini_deployment,
    openai_async_client as default_openai_client,
)
from app.taxonomy import PILLAR_NAMES

logger = logging.getLogger(__name__)

# A goal yields at most six queries — enough variety for the discovery
# balancer's per-goal budget, few enough to fit the LLM's tendency to
# repeat itself. Min is two so a single noisy query doesn't anchor a run.
MIN_QUERIES = 2
MAX_QUERIES = 6
# Bound on individual query length. The discovery query builder treats
# anything over ~120 chars as a paragraph rather than a search phrase, so
# we trim aggressively here rather than at the call site.
MAX_QUERY_LENGTH = 120

# Prompt version is part of the cache key — bump it when the system prompt
# below changes so the next call invalidates stale aliases.
#
# v2 (2026-05-13): the v1 prompt produced broad topical queries
# ("equitable complete communities", "affordable housing development policy")
# that surfaced cross-pillar content — HH-seeded queries returned
# Complete-Streets/15-min-city sources, which the classifier then assigned
# to MC instead of HH. v2 anchors every query to the seeding pillar by
# demanding pillar-specific program names, statutory levers, and proper
# nouns instead of generic topical phrases.
PROMPT_VERSION = "v2"


class QueryDerivationError(RuntimeError):
    """Raised when the LLM response can't be parsed into a usable query list.

    Callers should fall back to a deterministic search term derived from
    the goal name when they catch this. The dispatcher in PR-E does this.
    """


class GoalNotFoundError(QueryDerivationError):
    """Raised when the requested goal_id has no row in ``csp_goals``.

    Subclasses ``QueryDerivationError`` so existing callers that catch the
    parent still work, but lets the admin refresh handler map this to 404
    (rather than 422) so a typo is distinguishable from an LLM parse
    failure.
    """


def _system_prompt() -> str:
    return (
        "You generate concise web-search queries for a municipal-government "
        "strategic-foresight system. Each query must surface news, "
        "research, or public-sector reports about the **specific strategic "
        "pillar** the goal belongs to — not adjacent or fashionable "
        "municipal topics.\n\n"
        "RULES:\n"
        "1. Prefer two-to-six-word phrases. No quotes, boolean operators, "
        "or site: filters.\n"
        "2. Anchor every query to the seeding pillar with pillar-specific "
        "vocabulary: program names (e.g. LIHTC, Section 8, Percent-for-Art, "
        "Vision Zero, CIT, Coordinated Entry), statutory levers (e.g. "
        "inclusionary zoning, housing trust fund, TIF district), or "
        "domain-of-art proper nouns. Avoid generic municipal phrases that "
        "fire across pillars ('complete communities', '15-minute city', "
        "'equitable access') unless paired with a pillar-specific modifier.\n"
        "3. Cover different angles per query (policy levers, peer-city "
        "programs, current legislation, research/evaluation, "
        "technology/tooling) — do NOT just rephrase the goal name.\n"
        "4. Each query should be one a domain practitioner in that pillar "
        "would actually type. If the same query would make sense to "
        "practitioners in three different pillars, rewrite it tighter.\n\n"
        "Return ONLY a JSON array of strings — no preamble, no trailing "
        "prose, no markdown fences."
    )


def _user_prompt(name: str, description: str, pillar_label: str) -> str:
    desc = (description or "").strip() or "(no description provided)"
    pillar = pillar_label.strip() or "(pillar unknown)"
    return (
        f"Seeding pillar: {pillar}\n"
        f"Goal name: {name.strip()}\n"
        f"Goal description: {desc}\n\n"
        f"Return {MIN_QUERIES}-{MAX_QUERIES} search queries (JSON array) "
        f"that a {pillar} practitioner would use. Each query must be "
        f"recognizably about {pillar} — not adjacent pillars."
    )


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _parse_query_list(raw: str | None) -> list[str]:
    """Coerce the LLM response into a clean ``list[str]``.

    Handles the most common failure shapes: fenced JSON, leading prose,
    duplicate or whitespace-only entries. Raises ``QueryDerivationError``
    if no usable queries can be extracted — the dispatcher decides on
    fallback behavior, not this service.
    """
    if not raw:
        raise QueryDerivationError("empty LLM response")
    cleaned = _FENCE_RE.sub("", raw.strip()).strip()
    if not cleaned:
        raise QueryDerivationError("empty LLM response after fence strip")

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        # Models occasionally return a leading sentence before the array.
        # Pull the first ``[...]`` substring and try again before giving up.
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start == -1 or end <= start:
            raise QueryDerivationError(f"unparseable response: {exc}") from exc
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc2:
            raise QueryDerivationError(
                f"unparseable response after slice: {exc2}"
            ) from exc2

    if not isinstance(parsed, list):
        raise QueryDerivationError("response was not a JSON array")

    seen: set[str] = set()
    out: list[str] = []
    for item in parsed:
        if not isinstance(item, str):
            continue
        text = item.strip().strip('"').strip()
        if not text:
            continue
        if len(text) > MAX_QUERY_LENGTH:
            text = text[:MAX_QUERY_LENGTH].rstrip()
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= MAX_QUERIES:
            break

    if len(out) < MIN_QUERIES:
        raise QueryDerivationError(
            f"too few usable queries in response ({len(out)} < {MIN_QUERIES})"
        )
    return out


def _cache_version() -> str:
    """Version stamp written alongside cached aliases.

    Composed of the lens-classifier version and this module's prompt
    version. Either bump invalidates the cache.
    """
    return f"{CLASSIFIER_VERSION}|prompt:{PROMPT_VERSION}"


async def _load_goal(goal_id: UUID, *, supabase: Any) -> dict[str, Any]:
    def fetch() -> dict[str, Any] | None:
        resp = (
            supabase.table("csp_goals")
            .select(
                "id,code,name,description,pillar_code,"
                "query_aliases,query_aliases_version"
            )
            .eq("id", str(goal_id))
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None

    row = await asyncio.to_thread(fetch)
    if not row:
        raise GoalNotFoundError(f"goal {goal_id} not found")
    return row


async def _persist_aliases(
    goal_id: UUID, queries: list[str], *, supabase: Any
) -> None:
    def write() -> None:
        # Pass the list directly — Supabase JSONB/TEXT[] columns accept
        # Python lists without json.dumps (see CLAUDE.md).
        (
            supabase.table("csp_goals")
            .update(
                {
                    "query_aliases": queries,
                    "query_aliases_version": _cache_version(),
                }
            )
            .eq("id", str(goal_id))
            .execute()
        )

    try:
        await asyncio.to_thread(write)
    except Exception:
        # Best-effort cache: don't fail the caller because we couldn't
        # persist. The next call will retry.
        logger.exception(
            "Failed to persist query_aliases for csp_goal %s", goal_id
        )


def _pillar_label(goal: dict[str, Any]) -> str:
    """Render a human-friendly pillar label for the LLM prompt.

    Format is ``"<CODE> (<full name>)"`` so the model gets both the short
    handle it sees in tool calls and the descriptive name it can latch onto.
    Goals without a known ``pillar_code`` collapse to an empty label so the
    prompt's "(pillar unknown)" fallback kicks in.
    """
    code = (goal.get("pillar_code") or "").strip().upper()
    if not code:
        return ""
    name = PILLAR_NAMES.get(code)
    return f"{code} ({name})" if name else code


async def _call_llm(
    goal: dict[str, Any], *, openai_client: AsyncOpenAI
) -> str | None:
    response = await openai_client.chat.completions.create(
        model=get_chat_mini_deployment(),
        messages=[
            {"role": "system", "content": _system_prompt()},
            {
                "role": "user",
                "content": _user_prompt(
                    goal.get("name") or "",
                    goal.get("description") or "",
                    _pillar_label(goal),
                ),
            },
        ],
        # ~6 queries x ~10 tokens each plus JSON overhead — 256 is comfortable.
        max_completion_tokens=256,
    )
    if not response.choices:
        return None
    msg = response.choices[0].message
    return getattr(msg, "content", None)


async def derive_queries(
    goal_id: UUID,
    *,
    force: bool = False,
    supabase: Any | None = None,
    openai_client: AsyncOpenAI | None = None,
) -> list[str]:
    """Return cached or freshly-derived search queries for a CSP goal.

    Args:
        goal_id: UUID of the goal in ``csp_goals``.
        force: When True, ignore the cache and re-derive even if the
            version stamp matches. Used by the manual refresh endpoint.
        supabase: Injection point for tests. Falls back to the
            ``app.deps.supabase`` singleton in production.
        openai_client: Injection point for tests. Falls back to the
            ``app.deps.openai_client`` (async) singleton in production.

    Raises:
        GoalNotFoundError: if the ``goal_id`` has no row in ``csp_goals``.
            Subclass of ``QueryDerivationError`` so existing broad
            ``except QueryDerivationError`` clauses still work; callers
            that need to distinguish a typo'd UUID from a parse failure
            (e.g. the refresh-queries handler, which maps to 404 vs 422)
            should catch this first.
        QueryDerivationError: if the goal exists but the LLM response is
            unusable. Cache misses caused by network errors propagate
            their original exceptions (so callers can retry) — only
            *parse* failures surface as ``QueryDerivationError``.
    """
    sb = supabase if supabase is not None else default_supabase
    oc = openai_client if openai_client is not None else default_openai_client

    goal = await _load_goal(goal_id, supabase=sb)

    cached = goal.get("query_aliases") or []
    current_version = _cache_version()
    # Cache-hit guard also enforces ``MIN_QUERIES`` on the stored list:
    # an old persistence written before the parser-side guard could carry
    # a single-query payload at the current version stamp, and returning
    # it here would route around the new minimum. Treat under-minimum
    # caches as misses so the next LLM call refreshes them.
    if (
        not force
        and isinstance(cached, list)
        and len(cached) >= MIN_QUERIES
        and goal.get("query_aliases_version") == current_version
    ):
        return list(cached)

    raw = await _call_llm(goal, openai_client=oc)
    queries = _parse_query_list(raw)  # Raises if unusable — caller decides.
    await _persist_aliases(goal_id, queries, supabase=sb)
    return queries
