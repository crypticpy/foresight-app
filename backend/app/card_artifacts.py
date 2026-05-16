"""Batch helpers for card follower and artifact response enrichment."""

from __future__ import annotations

import time
from collections import OrderedDict, defaultdict
from typing import Any

from app.models.card_artifacts import CardArtifacts

_ARTIFACT_CACHE_TTL_SECONDS = 60
_ARTIFACT_CACHE_MAX_ENTRIES = 256
# Artifact data (briefs, research, scans) is not viewer-scoped, so the cache
# key is just the sorted card-id tuple — no user partition needed. An
# OrderedDict gives us cheap LRU eviction to keep long-running web pods from
# growing the cache without bound.
_artifact_cache: "OrderedDict[tuple[str, ...], tuple[float, dict[str, CardArtifacts]]]" = OrderedDict()


def _dedupe_card_ids(card_ids: list[str]) -> list[str]:
    return [cid for cid in dict.fromkeys(str(card_id) for card_id in card_ids if card_id)]


def get_follower_counts(client: Any, card_ids: list[str]) -> dict[str, int]:
    """Return follower counts keyed by card id using the existing card_follows table."""
    ids = _dedupe_card_ids(card_ids)
    if not ids:
        return {}

    try:
        rows = client.rpc("card_follower_counts", {"card_ids": ids}).execute().data or []
        return {row["card_id"]: int(row.get("follower_count") or 0) for row in rows}
    except Exception:
        # Local/dev databases may not have the RPC until migrations are pushed.
        rows = (
            client.table("card_follows")
            .select("card_id")
            .in_("card_id", ids)
            .execute()
            .data
            or []
        )
        counts: dict[str, int] = defaultdict(int)
        for row in rows:
            if row.get("card_id"):
                counts[row["card_id"]] += 1
        return dict(counts)


def get_followed_card_ids(client: Any, user_id: str, card_ids: list[str]) -> set[str]:
    ids = _dedupe_card_ids(card_ids)
    if not ids:
        return set()
    rows = (
        client.table("card_follows")
        .select("card_id")
        .eq("user_id", user_id)
        .in_("card_id", ids)
        .execute()
        .data
        or []
    )
    return {row["card_id"] for row in rows if row.get("card_id")}


def get_card_artifacts(
    client: Any, card_ids: list[str], cache_key_user_id: str | None = None
) -> dict[str, CardArtifacts]:
    """Return generated artifact summaries keyed by card id.

    The `cache_key_user_id` arg is accepted for back-compat but ignored —
    artifacts are not viewer-scoped, so we cache globally.
    """
    ids = _dedupe_card_ids(card_ids)
    if not ids:
        return {}

    cache_key = tuple(sorted(ids))
    cached = _artifact_cache.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < _ARTIFACT_CACHE_TTL_SECONDS:
        _artifact_cache.move_to_end(cache_key)
        return cached[1]

    artifacts = {card_id: CardArtifacts() for card_id in ids}

    # Rows arrive newest-first (ORDER BY updated_at DESC). We walk every row
    # so we can surface the latest "generating" or "failed" attempt on cards
    # that don't yet have a completed brief — the kanban needs to show
    # in-flight progress and actionable errors, not just the happy path.
    brief_rows = (
        client.table("executive_briefs")
        .select("card_id, status, error_message, generated_at, updated_at, created_at")
        .in_("card_id", ids)
        .order("updated_at", desc=True)
        .execute()
        .data
        or []
    )
    for row in brief_rows:
        card_id = row.get("card_id")
        if not card_id or card_id not in artifacts:
            continue
        current = artifacts[card_id]
        status = row.get("status")
        if status == "completed":
            if not current.has_brief:
                current.has_brief = True
                current.brief_updated_at = (
                    row.get("generated_at") or row.get("updated_at") or row.get("created_at")
                )
        # Rows are newest-first. Once we've captured a non-completed state
        # for this card (pending OR failed), older rows must not overwrite
        # it — otherwise an older `generating` attempt would mask the
        # newest `failed` attempt (ArtifactStrip resolves pending before
        # failed, so the user would see a spinner for a brief that already
        # errored).
        elif (
            status == "generating"
            and not current.has_brief
            and not current.pending_brief
            and not current.failed_brief
        ):
            current.pending_brief = True
        elif (
            status == "failed"
            and not current.has_brief
            and not current.pending_brief
            and not current.failed_brief
        ):
            current.failed_brief = True
            current.brief_error_message = row.get("error_message")

    research_rows = (
        client.table("research_tasks")
        .select("card_id, status, task_type, error_message, completed_at, created_at")
        .in_("card_id", ids)
        .eq("task_type", "deep_research")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    for row in research_rows:
        card_id = row.get("card_id")
        if not card_id or card_id not in artifacts:
            continue
        current = artifacts[card_id]
        status = row.get("status")
        if status == "completed" and not current.has_deep_research:
            current.has_deep_research = True
            current.deep_research_updated_at = (
                row.get("completed_at") or row.get("created_at")
            )
        # Same newest-first guard as the brief loop above: once a card has
        # a non-completed state captured, an older row must not flip it
        # back to pending.
        elif (
            status in {"queued", "processing"}
            and not current.has_deep_research
            and not current.pending_research
            and not current.failed_research
        ):
            current.pending_research = True
        elif (
            status == "failed"
            and not current.has_deep_research
            and not current.pending_research
            and not current.failed_research
        ):
            current.failed_research = True
            current.research_error_message = row.get("error_message")

    # Workstream scans add new cards to a workstream's inbox. There is no
    # explicit per-card scan join, so we approximate by checking that the
    # card's workstream_cards.added_at falls at or after a completed scan's
    # started_at on that same workstream. Without this guard, every card in
    # any scanned workstream would be tagged has_scan, even cards added by
    # other flows long before/after the scan.
    wc_rows = (
        client.table("workstream_cards")
        .select("card_id, workstream_id, added_at")
        .in_("card_id", ids)
        .execute()
        .data
        or []
    )
    workstream_to_card_added: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    for row in wc_rows:
        ws_id = row.get("workstream_id")
        cid = row.get("card_id")
        if ws_id and cid:
            workstream_to_card_added[ws_id].append((cid, row.get("added_at")))

    if workstream_to_card_added:
        scan_rows = (
            client.table("workstream_scans")
            .select("workstream_id, status, started_at, completed_at, created_at")
            .in_("workstream_id", list(workstream_to_card_added.keys()))
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .execute()
            .data
            or []
        )
        for row in scan_rows:
            ws_id = row.get("workstream_id")
            scan_start = row.get("started_at") or row.get("created_at")
            scan_finished = row.get("completed_at") or row.get("created_at")
            if not ws_id or not scan_start:
                continue
            for cid, added_at in workstream_to_card_added.get(ws_id, []):
                # Card must have been added during or after the scan window;
                # missing added_at is treated as "unknown", not "covered".
                if not added_at or added_at < scan_start:
                    continue
                current = artifacts[cid]
                if not current.has_scan:
                    current.has_scan = True
                    current.scan_updated_at = scan_finished

    _artifact_cache[cache_key] = (now, artifacts)
    _artifact_cache.move_to_end(cache_key)
    while len(_artifact_cache) > _ARTIFACT_CACHE_MAX_ENTRIES:
        _artifact_cache.popitem(last=False)
    return artifacts


def enrich_cards_with_collab(
    client: Any, cards: list[dict[str, Any]], user_id: str | None = None
) -> list[dict[str, Any]]:
    """Merge follower state and artifacts into raw card dictionaries."""
    card_ids = [card.get("id") for card in cards if card.get("id")]
    counts = get_follower_counts(client, card_ids)
    followed = get_followed_card_ids(client, user_id, card_ids) if user_id else set()
    artifacts = get_card_artifacts(client, card_ids, cache_key_user_id=user_id)

    enriched: list[dict[str, Any]] = []
    for card in cards:
        card_id = card.get("id")
        item = dict(card)
        item["follower_count"] = counts.get(card_id, 0)
        item["is_following"] = card_id in followed
        item["artifacts"] = (artifacts.get(card_id) or CardArtifacts()).dict()
        enriched.append(item)
    return enriched
