"""
Chat tools for the Foresight chat agent.

Defines OpenAI function-call tool schemas plus a dispatcher that executes
each tool against Supabase / RAG. Tools fall into three groups:

- Read tools: get_card_details, list_workstreams, get_workstream,
  list_patterns, search_signals
- Write tools: follow_signal, unfollow_signal, pin_signal, unpin_signal
- Web tool: web_search (kept here for centralized dispatch)

Every tool returns a JSON-serializable dict. The dispatcher always returns
a string (json.dumps of the result) suitable for use as the `content`
field of an OpenAI tool message — including for failure cases, so the
streaming loop never has to special-case errors.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from supabase import Client

from app.helpers.search_utils import sanitize_ilike
from app.openai_provider import (
    azure_openai_async_embedding_client,
    get_embedding_deployment,
)
from app.supabase_in_guard import chunked_in_query

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_TOOL_CALLS_PER_MESSAGE = 8
MAX_WEB_SEARCHES_PER_MESSAGE = 2
SEARCH_RESULT_LIMIT = 10
EMBEDDING_DIM = 1536


# ---------------------------------------------------------------------------
# Tool schemas (OpenAI function-call format)
# ---------------------------------------------------------------------------

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for current, real-time information. Use when "
            "the provided context lacks information for the user's question, "
            "especially recent events or current statistics."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The web search query.",
                }
            },
            "required": ["query"],
        },
    },
}

GET_CARD_DETAILS_TOOL = {
    "type": "function",
    "function": {
        "name": "get_card_details",
        "description": (
            "Fetch the full record for a single signal (card) by its slug or "
            "ID — including description, scores, pillar/horizon/stage, source "
            "count, and whether the current user follows or pins it. Use when "
            "the user asks about a specific signal by name and you need detail "
            "beyond the snippet in the prompt context."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "card": {
                    "type": "string",
                    "description": "The card slug (preferred) or UUID.",
                }
            },
            "required": ["card"],
        },
    },
}

LIST_WORKSTREAMS_TOOL = {
    "type": "function",
    "function": {
        "name": "list_workstreams",
        "description": (
            "List the current user's research workstreams with name, "
            "description, and how many cards each contains. Use when the user "
            "asks 'what am I tracking', 'show my workstreams', etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}

GET_WORKSTREAM_TOOL = {
    "type": "function",
    "function": {
        "name": "get_workstream",
        "description": (
            "Fetch a workstream's details and the list of signals (cards) it "
            "contains. Accepts a workstream UUID or a name (case-insensitive "
            "best match). Use when the user asks about a specific workstream's "
            "contents."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "workstream": {
                    "type": "string",
                    "description": "Workstream UUID or name.",
                }
            },
            "required": ["workstream"],
        },
    },
}

LIST_PATTERNS_TOOL = {
    "type": "function",
    "function": {
        "name": "list_patterns",
        "description": (
            "List AI-detected cross-signal patterns. Each pattern bundles "
            "multiple signals into a strategic theme with a confidence score "
            "and an opportunity statement. Use when the user asks about "
            "emerging themes, what's trending, or what AI has detected."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "acted_on", "dismissed"],
                    "description": "Filter by status (default: active).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max patterns to return (default 10, max 25).",
                },
            },
        },
    },
}

SEARCH_SIGNALS_TOOL = {
    "type": "function",
    "function": {
        "name": "search_signals",
        "description": (
            "Semantic + full-text hybrid search over the signal database. By "
            "default this respects the current chat scope (workstream limits "
            "to that workstream's cards), but you can pass scope_override to "
            "search globally or in a different scope. Use this for refining "
            "or expanding beyond what's already in the prompt context."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language search query.",
                },
                "pillar": {
                    "type": "string",
                    "description": (
                        "Optional pillar filter: CH, MC, HS, EC, ES, or CE."
                    ),
                },
                "horizon": {
                    "type": "string",
                    "enum": ["H1", "H2", "H3"],
                    "description": "Optional horizon filter.",
                },
                "scope_override": {
                    "type": "string",
                    "enum": ["global", "current"],
                    "description": (
                        "'current' (default) respects the chat's scope; "
                        "'global' searches all signals regardless of scope."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 10, max 25).",
                },
            },
            "required": ["query"],
        },
    },
}

FOLLOW_SIGNAL_TOOL = {
    "type": "function",
    "function": {
        "name": "follow_signal",
        "description": (
            "Add a signal to the current user's followed list. Reversible "
            "with unfollow_signal. Confirm in your response after calling."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "card": {
                    "type": "string",
                    "description": "Card slug or UUID.",
                }
            },
            "required": ["card"],
        },
    },
}

UNFOLLOW_SIGNAL_TOOL = {
    "type": "function",
    "function": {
        "name": "unfollow_signal",
        "description": "Remove a signal from the user's followed list.",
        "parameters": {
            "type": "object",
            "properties": {
                "card": {
                    "type": "string",
                    "description": "Card slug or UUID.",
                }
            },
            "required": ["card"],
        },
    },
}

PIN_SIGNAL_TOOL = {
    "type": "function",
    "function": {
        "name": "pin_signal",
        "description": (
            "Pin a signal to the user's personal Signals page for quick "
            "access. Reversible with unpin_signal."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "card": {
                    "type": "string",
                    "description": "Card slug or UUID.",
                }
            },
            "required": ["card"],
        },
    },
}

UNPIN_SIGNAL_TOOL = {
    "type": "function",
    "function": {
        "name": "unpin_signal",
        "description": "Unpin a signal from the user's Signals page.",
        "parameters": {
            "type": "object",
            "properties": {
                "card": {
                    "type": "string",
                    "description": "Card slug or UUID.",
                }
            },
            "required": ["card"],
        },
    },
}


READ_TOOLS = [
    GET_CARD_DETAILS_TOOL,
    LIST_WORKSTREAMS_TOOL,
    GET_WORKSTREAM_TOOL,
    LIST_PATTERNS_TOOL,
    SEARCH_SIGNALS_TOOL,
]

WRITE_TOOLS = [
    FOLLOW_SIGNAL_TOOL,
    UNFOLLOW_SIGNAL_TOOL,
    PIN_SIGNAL_TOOL,
    UNPIN_SIGNAL_TOOL,
]


def get_all_tools() -> List[Dict[str, Any]]:
    """Return the tool list to send to the model.

    web_search is included only when a working search provider (SearXNG or
    Serper) is configured so we don't advertise an action we cannot fulfill.
    """
    from app import search_provider

    tools: List[Dict[str, Any]] = []
    tools.extend(READ_TOOLS)
    tools.extend(WRITE_TOOLS)
    if search_provider.is_available():
        tools.append(WEB_SEARCH_TOOL)
    return tools


KNOWN_TOOL_NAMES = {
    t["function"]["name"] for t in READ_TOOLS + WRITE_TOOLS + [WEB_SEARCH_TOOL]
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_uuid(value: str) -> bool:
    if not isinstance(value, str) or len(value) != 36:
        return False
    return value.count("-") == 4


def _err(message: str) -> str:
    return json.dumps({"error": message})


def _ok(payload: Any) -> str:
    return json.dumps(payload, default=str)


async def _resolve_card_id(supabase: Client, card_ref: str) -> Optional[str]:
    """Resolve a slug-or-UUID to a card UUID. Returns None if not found."""
    if _is_uuid(card_ref):
        return card_ref
    result = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select("id")
        .eq("slug", card_ref)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None


async def _resolve_workstream_id(
    supabase: Client, ref: str, user_id: str
) -> Optional[str]:
    """Resolve a workstream UUID or name (case-insensitive) for this user."""
    if _is_uuid(ref):
        return ref
    result = await asyncio.to_thread(
        lambda: supabase.table("workstreams")
        .select("id")
        .eq("user_id", user_id)
        .ilike("name", sanitize_ilike(ref))
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    return None


async def _generate_embedding(text: str) -> List[float]:
    try:
        truncated = text[:8000]
        response = await azure_openai_async_embedding_client.embeddings.create(
            model=get_embedding_deployment(),
            input=truncated,
        )
        return response.data[0].embedding
    except Exception:
        logger.error("Tool embedding generation failed", exc_info=True)
        return [0.0] * EMBEDDING_DIM


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


async def _tool_get_card_details(
    supabase: Client,
    user_id: str,
    args: Dict[str, Any],
) -> str:
    card_ref = (args.get("card") or "").strip()
    if not card_ref:
        return _err("Missing 'card' argument.")

    card_id = await _resolve_card_id(supabase, card_ref)
    if not card_id:
        return _err(f"No card found matching '{card_ref}'.")

    card_res = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select(
            "id, slug, name, summary, description, pillar_id, stage_id, "
            "horizon, novelty_score, maturity_score, impact_score, "
            "relevance_score, velocity_score, opportunity_score, risk_score, "
            "signal_quality_score, top25_relevance, created_at, updated_at"
        )
        .eq("id", card_id)
        .limit(1)
        .execute()
    )
    if not card_res.data:
        return _err(f"Card '{card_ref}' not found.")
    card = card_res.data[0]

    follow_res, pin_res, source_res = await asyncio.gather(
        asyncio.to_thread(
            lambda: supabase.table("card_follows")
            .select("user_id")
            .eq("user_id", user_id)
            .eq("card_id", card_id)
            .limit(1)
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("user_signal_preferences")
            .select("is_pinned")
            .eq("user_id", user_id)
            .eq("card_id", card_id)
            .limit(1)
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("card_sources")
            .select("id", count="exact")
            .eq("card_id", card_id)
            .execute()
        ),
    )

    return _ok(
        {
            **card,
            "is_followed": bool(follow_res.data),
            "is_pinned": bool(
                pin_res.data and pin_res.data[0].get("is_pinned")
            ),
            "source_count": getattr(source_res, "count", 0)
            or len(source_res.data or []),
            "url": f"/signals/{card['slug']}",
        }
    )


async def _tool_list_workstreams(
    supabase: Client, user_id: str, args: Dict[str, Any]
) -> str:
    ws_res = await asyncio.to_thread(
        lambda: supabase.table("workstreams")
        .select("id, name, description, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    workstreams = ws_res.data or []
    if not workstreams:
        return _ok({"workstreams": []})

    ws_ids = [w["id"] for w in workstreams]

    def _fetch_ws_counts(chunk):
        resp = (
            supabase.table("workstream_cards")
            .select("workstream_id")
            .in_("workstream_id", chunk)
            .execute()
        )
        return resp.data or []

    count_rows = await asyncio.to_thread(chunked_in_query, _fetch_ws_counts, ws_ids)
    counts: Dict[str, int] = {}
    for row in count_rows:
        counts[row["workstream_id"]] = counts.get(row["workstream_id"], 0) + 1

    return _ok(
        {
            "workstreams": [
                {
                    **w,
                    "card_count": counts.get(w["id"], 0),
                    "url": f"/workstreams/{w['id']}",
                }
                for w in workstreams
            ]
        }
    )


async def _tool_get_workstream(
    supabase: Client, user_id: str, args: Dict[str, Any]
) -> str:
    ref = (args.get("workstream") or "").strip()
    if not ref:
        return _err("Missing 'workstream' argument.")

    ws_id = await _resolve_workstream_id(supabase, ref, user_id)
    if not ws_id:
        return _err(f"No workstream matching '{ref}'.")

    ws_res = await asyncio.to_thread(
        lambda: supabase.table("workstreams")
        .select("id, name, description, created_at, updated_at, user_id")
        .eq("id", ws_id)
        .limit(1)
        .execute()
    )
    if not ws_res.data:
        return _err("Workstream not found.")
    ws = ws_res.data[0]
    if ws.get("user_id") != user_id:
        return _err("You don't have access to this workstream.")

    card_link_res = await asyncio.to_thread(
        lambda: supabase.table("workstream_cards")
        .select("card_id, stage, added_at, cards(id, slug, name, summary, "
                "pillar_id, stage_id, horizon, impact_score, relevance_score)")
        .eq("workstream_id", ws_id)
        .execute()
    )
    cards = []
    for link in card_link_res.data or []:
        card = link.get("cards") or {}
        if not card:
            continue
        cards.append(
            {
                **card,
                "kanban_stage": link.get("stage"),
                "added_at": link.get("added_at"),
                "url": f"/signals/{card.get('slug')}",
            }
        )

    return _ok(
        {
            "id": ws["id"],
            "name": ws["name"],
            "description": ws.get("description"),
            "created_at": ws.get("created_at"),
            "updated_at": ws.get("updated_at"),
            "card_count": len(cards),
            "cards": cards,
            "url": f"/workstreams/{ws_id}",
        }
    )


async def _tool_list_patterns(
    supabase: Client, user_id: str, args: Dict[str, Any]
) -> str:
    status = args.get("status") or "active"
    if status not in {"active", "acted_on", "dismissed"}:
        return _err(f"Invalid status '{status}'.")
    limit = max(1, min(25, int(args.get("limit") or 10)))

    res = await asyncio.to_thread(
        lambda: supabase.table("pattern_insights")
        .select(
            "id, pattern_title, pattern_summary, opportunity, confidence, "
            "affected_pillars, urgency, related_card_ids, status, created_at"
        )
        .eq("status", status)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    patterns = res.data or []
    return _ok(
        {
            "patterns": [
                {**p, "url": f"/patterns/{p['id']}"} for p in patterns
            ],
            "count": len(patterns),
        }
    )


async def _tool_search_signals(
    supabase: Client,
    user_id: str,
    args: Dict[str, Any],
    chat_scope: str,
    chat_scope_id: Optional[str],
) -> str:
    query = (args.get("query") or "").strip()
    if not query:
        return _err("Missing 'query' argument.")
    pillar = args.get("pillar")
    horizon = args.get("horizon")
    scope_override = args.get("scope_override") or "current"
    limit = max(1, min(25, int(args.get("limit") or SEARCH_RESULT_LIMIT)))

    embedding = await _generate_embedding(query)

    # Determine card scope ids: respect chat scope unless override='global'
    scope_card_ids: Optional[List[str]] = None
    if scope_override != "global":
        if chat_scope == "workstream" and chat_scope_id:
            link_res = await asyncio.to_thread(
                lambda: supabase.table("workstream_cards")
                .select("card_id")
                .eq("workstream_id", chat_scope_id)
                .execute()
            )
            scope_card_ids = [
                row["card_id"] for row in (link_res.data or []) if row.get("card_id")
            ] or None

    rpc_params: Dict[str, Any] = {
        "query_text": query,
        "query_embedding": embedding,
        "match_count": limit * 2,  # over-fetch to leave room for filtering
    }
    if scope_card_ids is not None:
        rpc_params["scope_card_ids"] = scope_card_ids

    try:
        rpc_res = await asyncio.to_thread(
            lambda: supabase.rpc("hybrid_search_cards", rpc_params).execute()
        )
        rows = rpc_res.data or []
    except Exception as e:
        logger.warning("hybrid_search_cards failed: %s", e)
        return _err("Search failed; please try a different query.")

    # Apply optional pillar / horizon filters
    if pillar:
        rows = [r for r in rows if r.get("pillar_id") == pillar]
    if horizon:
        rows = [r for r in rows if r.get("horizon") == horizon]
    rows = rows[:limit]

    # Slim the response so we don't bloat the model context
    results = [
        {
            "id": r.get("id"),
            "slug": r.get("slug"),
            "name": r.get("name"),
            "summary": r.get("summary"),
            "pillar_id": r.get("pillar_id"),
            "horizon": r.get("horizon"),
            "stage_id": r.get("stage_id"),
            "impact_score": r.get("impact_score"),
            "relevance_score": r.get("relevance_score"),
            "url": f"/signals/{r.get('slug')}" if r.get("slug") else None,
        }
        for r in rows
    ]
    return _ok(
        {
            "query": query,
            "scope_used": scope_override,
            "result_count": len(results),
            "results": results,
        }
    )


async def _set_follow(
    supabase: Client, user_id: str, args: Dict[str, Any], should_follow: bool
) -> str:
    card_ref = (args.get("card") or "").strip()
    if not card_ref:
        return _err("Missing 'card' argument.")
    card_id = await _resolve_card_id(supabase, card_ref)
    if not card_id:
        return _err(f"No card found matching '{card_ref}'.")

    if should_follow:
        try:
            await asyncio.to_thread(
                lambda: supabase.table("card_follows")
                .insert({"user_id": user_id, "card_id": card_id})
                .execute()
            )
        except Exception as e:
            # Likely duplicate-key — treat as already-followed
            msg = str(e).lower()
            if "duplicate" in msg or "23505" in msg:
                return _ok(
                    {
                        "card_id": card_id,
                        "is_followed": True,
                        "note": "Already following.",
                    }
                )
            logger.exception("follow_signal failed")
            return _err("Failed to follow signal.")
        return _ok({"card_id": card_id, "is_followed": True})

    try:
        await asyncio.to_thread(
            lambda: supabase.table("card_follows")
            .delete()
            .eq("user_id", user_id)
            .eq("card_id", card_id)
            .execute()
        )
    except Exception:
        logger.exception("unfollow_signal failed")
        return _err("Failed to unfollow signal.")
    return _ok({"card_id": card_id, "is_followed": False})


async def _set_pin(
    supabase: Client, user_id: str, args: Dict[str, Any], should_pin: bool
) -> str:
    card_ref = (args.get("card") or "").strip()
    if not card_ref:
        return _err("Missing 'card' argument.")
    card_id = await _resolve_card_id(supabase, card_ref)
    if not card_id:
        return _err(f"No card found matching '{card_ref}'.")

    existing = await asyncio.to_thread(
        lambda: supabase.table("user_signal_preferences")
        .select("id, is_pinned")
        .eq("user_id", user_id)
        .eq("card_id", card_id)
        .limit(1)
        .execute()
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        if existing.data:
            await asyncio.to_thread(
                lambda: supabase.table("user_signal_preferences")
                .update({"is_pinned": should_pin, "updated_at": now_iso})
                .eq("id", existing.data[0]["id"])
                .execute()
            )
        elif should_pin:
            await asyncio.to_thread(
                lambda: supabase.table("user_signal_preferences")
                .insert(
                    {
                        "user_id": user_id,
                        "card_id": card_id,
                        "is_pinned": True,
                    }
                )
                .execute()
            )
        # else: not pinned and unpin requested → no-op
    except Exception:
        logger.exception("pin/unpin failed")
        return _err("Failed to update pin status.")

    # Atomically also follow when pinning to match Signals-page UX
    if should_pin:
        try:
            await asyncio.to_thread(
                lambda: supabase.table("card_follows")
                .insert({"user_id": user_id, "card_id": card_id})
                .execute()
            )
        except Exception as e:
            msg = str(e).lower()
            if "duplicate" not in msg and "23505" not in msg:
                logger.warning("follow-on-pin failed: %s", e)

    return _ok({"card_id": card_id, "is_pinned": should_pin})


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


async def dispatch_tool(
    name: str,
    args: Dict[str, Any],
    *,
    supabase: Client,
    user_id: str,
    chat_scope: str,
    chat_scope_id: Optional[str],
) -> str:
    """Run a tool by name. Always returns a JSON string for the tool message."""
    try:
        if name == "get_card_details":
            return await _tool_get_card_details(supabase, user_id, args)
        if name == "list_workstreams":
            return await _tool_list_workstreams(supabase, user_id, args)
        if name == "get_workstream":
            return await _tool_get_workstream(supabase, user_id, args)
        if name == "list_patterns":
            return await _tool_list_patterns(supabase, user_id, args)
        if name == "search_signals":
            return await _tool_search_signals(
                supabase, user_id, args, chat_scope, chat_scope_id
            )
        if name == "follow_signal":
            return await _set_follow(supabase, user_id, args, True)
        if name == "unfollow_signal":
            return await _set_follow(supabase, user_id, args, False)
        if name == "pin_signal":
            return await _set_pin(supabase, user_id, args, True)
        if name == "unpin_signal":
            return await _set_pin(supabase, user_id, args, False)
    except Exception as e:
        logger.exception("Tool '%s' raised", name)
        return _err(f"Tool '{name}' failed: {type(e).__name__}")

    return _err(f"Unknown tool '{name}'.")


def progress_label(name: str, args: Dict[str, Any]) -> str:
    """Short user-facing label for progress events."""
    if name == "web_search":
        return f"Searching the web for: {args.get('query', '')}"
    if name == "get_card_details":
        return f"Looking up signal: {args.get('card', '')}"
    if name == "list_workstreams":
        return "Listing your workstreams"
    if name == "get_workstream":
        return f"Opening workstream: {args.get('workstream', '')}"
    if name == "list_patterns":
        return "Loading AI-detected patterns"
    if name == "search_signals":
        return f"Searching signals for: {args.get('query', '')}"
    if name == "follow_signal":
        return f"Following: {args.get('card', '')}"
    if name == "unfollow_signal":
        return f"Unfollowing: {args.get('card', '')}"
    if name == "pin_signal":
        return f"Pinning: {args.get('card', '')}"
    if name == "unpin_signal":
        return f"Unpinning: {args.get('card', '')}"
    return f"Running tool: {name}"
