"""
Chat Service for Foresight Application (Ask Foresight / NLQ).

Provides RAG-powered conversational AI with three scopes:
- signal: Deep Q&A about a single card and its sources
- workstream: Analysis across cards within a workstream
- global: Broad strategic intelligence search using vector similarity

Uses Azure OpenAI for streaming chat completions and embedding generation.
Context is assembled from Supabase and injected into the system prompt.
"""

import asyncio
import json
import os
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from supabase import Client

from app.rag_engine import RAGEngine
from app.openai_provider import (
    azure_openai_async_client,
    get_chat_deployment,
    get_chat_mini_deployment,
    get_reasoning_effort,
)
from app.chat_tools import (
    MAX_TOOL_CALLS_PER_MESSAGE,
    MAX_WEB_SEARCHES_PER_MESSAGE,
    dispatch_tool,
    get_all_tools,
    progress_label,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RATE_LIMIT_PER_MINUTE = 20
MAX_CONVERSATION_MESSAGES = 50  # Max history messages to include
MAX_CONTEXT_CHARS = 120_000  # Cap RAG context size sent to the LLM
STREAM_TIMEOUT = 120  # seconds

# Tool defs and dispatcher live in chat_tools.py — imported above.


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _to_responses_tools(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert chat.completions tool schemas to Responses API tool schemas.

    chat.completions: {"type": "function", "function": {"name", "description", "parameters"}}
    responses:        {"type": "function", "name", "description", "parameters"}
    """
    out: List[Dict[str, Any]] = []
    for t in tools or []:
        if t.get("type") == "function" and isinstance(t.get("function"), dict):
            fn = t["function"]
            out.append(
                {
                    "type": "function",
                    "name": fn.get("name"),
                    "description": fn.get("description"),
                    "parameters": fn.get("parameters") or {"type": "object", "properties": {}},
                }
            )
        else:
            out.append(t)
    return out


def _sse_event(event_type: str, data: Any) -> str:
    """Format a Server-Sent Event."""
    return f"data: {json.dumps({'type': event_type, 'data': data if event_type != 'token' else None, 'content': data if event_type == 'token' else None})}\n\n"


def _sse_token(content: str) -> str:
    """Format a streaming token SSE event."""
    return f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"


def _sse_error(message: str) -> str:
    """Format an error SSE event."""
    return f"data: {json.dumps({'type': 'error', 'content': message})}\n\n"


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------


async def _check_rate_limit(supabase: Client, user_id: str) -> bool:
    """
    Check if user has exceeded the chat rate limit.

    Returns True if the request should be allowed, False if rate limited.
    """
    try:
        one_minute_ago = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

        # Count messages sent by this user in the last minute
        # We join through conversations to filter by user_id
        await asyncio.to_thread(
            lambda: supabase.table("chat_messages")
            .select("id", count="exact")
            .eq("role", "user")
            .gte("created_at", one_minute_ago)
            .execute()
        )

        # Since we can't easily filter by user_id through a join in postgrest,
        # we count via conversations
        conv_result = await asyncio.to_thread(
            lambda: supabase.table("chat_conversations")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        if not conv_result.data:
            return True  # No conversations = no messages = not rate limited

        conv_ids = [c["id"] for c in conv_result.data]

        # Count recent user messages across all their conversations
        count = 0
        # Process in batches to avoid query length limits
        for i in range(0, len(conv_ids), 20):
            batch = conv_ids[i : i + 20]
            msg_result = await asyncio.to_thread(
                lambda batch=batch: supabase.table("chat_messages")
                .select("id", count="exact")
                .in_("conversation_id", batch)
                .eq("role", "user")
                .gte("created_at", one_minute_ago)
                .execute()
            )
            count += msg_result.count or 0

        return count < RATE_LIMIT_PER_MINUTE

    except Exception as e:
        logger.warning(f"Rate limit check failed (allowing request): {e}")
        return True  # Fail open


# ---------------------------------------------------------------------------
# System Prompt Builder
# ---------------------------------------------------------------------------


def _build_system_prompt(
    scope: str,
    context_text: str,
    scope_metadata: Dict[str, Any],
) -> str:
    """
    Build the system prompt with RAG context injected.

    The prompt instructs the LLM to:
    - Act as the City of Austin's strategic intelligence assistant
    - Use the provided context to answer questions
    - Cite sources using [N] notation matching context order
    - Be analytical, strategic, and forward-looking
    """
    scope_descriptions = {
        "signal": (
            f"You are answering questions about a specific signal (intelligence card): "
            f"\"{scope_metadata.get('card_name', 'Unknown Signal')}\". "
            f"You have comprehensive context about the signal '{scope_metadata.get('card_name', 'Unknown Signal')}' "
            f"including {scope_metadata.get('source_count', 0)} sources, timeline events, "
            f"and deep research reports, plus {scope_metadata.get('matched_cards', 0)} related "
            f"signals found via semantic search."
        ),
        "workstream": (
            f"You are answering questions about a research workstream: "
            f"\"{scope_metadata.get('workstream_name', 'Unknown Workstream')}\". "
            f"You have context about the workstream '{scope_metadata.get('workstream_name', 'Unknown Workstream')}' "
            f"with {scope_metadata.get('card_count', scope_metadata.get('matched_cards', 0))} tracked signals "
            f"and {scope_metadata.get('matched_sources', 0)} relevant sources found via hybrid search."
        ),
        "global": (
            f"You are answering a broad strategic intelligence question. "
            f"Hybrid search found {scope_metadata.get('matched_cards', 0)} relevant signals "
            f"and {scope_metadata.get('matched_sources', 0)} sources matching your query "
            f"across the entire intelligence database."
        ),
    }

    scope_desc = scope_descriptions.get(scope, scope_descriptions["global"])

    tool_instructions = """
## Tools

You have tools to fetch live data from the user's Foresight workspace and to take light, reversible actions on their behalf. Reach for them when the prompt context isn't enough — do not invent details about cards, workstreams, or patterns you haven't looked up.

Read tools (use freely):
- get_card_details(card) — full record for one signal by slug or UUID
- list_workstreams() — the user's workstreams with card counts
- get_workstream(workstream) — workstream contents (UUID or name)
- list_patterns(status?, limit?) — AI-detected cross-signal patterns
- search_signals(query, pillar?, horizon?, scope_override?, limit?) — hybrid search over the signal database

Action tools (reversible, no extra confirmation needed — but tell the user what you did):
- follow_signal(card) / unfollow_signal(card)
- pin_signal(card) / unpin_signal(card) — pin also follows; unpin only unpins

Scope behavior: search_signals defaults to the current chat scope (e.g. limited to a workstream's cards when in workstream scope). Pass scope_override="global" if the user asks to look beyond the current view, or if a scoped search returns too little.

When you take an action or pull live data, briefly tell the user what you did. Cite returned results with [N] when they map to the existing source_map; otherwise reference cards by name and link.
"""
    if os.getenv("TAVILY_API_KEY"):
        tool_instructions += """
Web search:
- web_search(query) — current external information. Up to 2 calls per message. Cite results with [N]. Do NOT use when internal context already answers the question.
"""

    return f"""You are Foresight, the City of Austin's AI strategic intelligence assistant.

You help city leaders, analysts, and decision-makers understand emerging trends, technologies, and issues that could impact municipal operations. You are part of a horizon scanning system aligned with Austin's strategic framework.

## Your Current Context
{scope_desc}

## Instructions
- Prioritize the provided context — it contains the most relevant signals, sources, and analysis. You may supplement with general knowledge when the context is insufficient, but always prefer cited evidence.
- You have extensive context available. Provide thorough, detailed responses with specific evidence and citations.
- Cite your sources using [N] notation (e.g., [1], [2]) that corresponds to the numbered sources in the context.
- Be analytical, strategic, and forward-looking in your responses.
- When discussing implications, consider impact on city services, budgets, equity, and residents.
- Provide actionable insights when possible — what should the city consider, prepare for, or investigate?
- Use clear, professional language suitable for government officials and analysts.
- If asked about topics outside the provided context, acknowledge the limitation and supplement with general knowledge where appropriate.
{tool_instructions}
## Strategic Framework Reference
- Pillars: CH (Community Health), MC (Mobility), HS (Housing), EC (Economic), ES (Environmental), CE (Cultural)
- Horizons: H1 (Mainstream), H2 (Transitional/Pilots), H3 (Weak Signals/Emerging)
- Stages: 1-Concept, 2-Emerging, 3-Prototype, 4-Pilot, 5-Municipal Pilot, 6-Early Adoption, 7-Mainstream, 8-Mature

## Context
{context_text}
"""


# ---------------------------------------------------------------------------
# Citation Parsing
# ---------------------------------------------------------------------------


def _parse_citations(
    response_text: str,
    source_map: Dict[int, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Parse [N] citation references from the response text and resolve
    them to actual source data from the source_map.

    Returns a list of citation objects with card_id, source_id, title, url, excerpt.
    """
    # Find all [N] references in the text
    citation_refs = re.findall(r"\[(\d+)\]", response_text)
    seen = set()
    citations = []

    for ref_str in citation_refs:
        ref_num = int(ref_str)
        if ref_num in seen:
            continue
        seen.add(ref_num)

        if source_info := source_map.get(ref_num):
            citations.append(
                {
                    "index": ref_num,
                    "card_id": source_info.get("card_id"),
                    "card_slug": source_info.get("card_slug", ""),
                    "source_id": source_info.get("source_id"),
                    "title": source_info.get("title", ""),
                    "url": source_info.get("url", ""),
                    "published_date": source_info.get("published_date"),
                    "excerpt": source_info.get("excerpt"),
                }
            )

    return citations


# ---------------------------------------------------------------------------
# Conversation Management
# ---------------------------------------------------------------------------


async def _get_or_create_conversation(
    supabase: Client,
    user_id: str,
    scope: str,
    scope_id: Optional[str],
    conversation_id: Optional[str],
    first_message: str,
) -> Tuple[str, bool]:
    """
    Get existing or create new conversation.

    Returns (conversation_id, is_new).
    """
    if conversation_id:
        # Verify the conversation exists and belongs to the user
        result = await asyncio.to_thread(
            lambda: supabase.table("chat_conversations")
            .select("id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .execute()
        )
        if result.data:
            return conversation_id, False
        else:
            logger.warning(
                f"Conversation {conversation_id} not found for user {user_id}"
            )
            # Fall through to create new one

    # Generate title from first message using mini model
    title = first_message[:100]
    try:
        title_response = await azure_openai_async_client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise title (max 60 chars) for a conversation "
                    "that starts with this message. Return ONLY the title text, "
                    "no quotes or extra formatting.",
                },
                {"role": "user", "content": first_message[:500]},
            ],
            max_completion_tokens=30,
        )
        if generated_title := title_response.choices[0].message.content.strip():
            title = generated_title[:100]
    except Exception as e:
        logger.warning(f"Failed to generate conversation title: {e}")

    # Create new conversation
    now = datetime.now(timezone.utc).isoformat()
    insert_data = {
        "user_id": user_id,
        "scope": scope,
        "scope_id": scope_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }

    result = await asyncio.to_thread(
        lambda: supabase.table("chat_conversations").insert(insert_data).execute()
    )

    if result.data:
        return result.data[0]["id"], True
    else:
        raise ValueError("Failed to create conversation")


async def _get_conversation_history(
    supabase: Client,
    conversation_id: str,
) -> List[Dict[str, str]]:
    """
    Fetch recent conversation history for inclusion in the chat context.

    Returns messages in OpenAI format: [{"role": "...", "content": "..."}]
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("chat_messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .limit(MAX_CONVERSATION_MESSAGES)
        .execute()
    )

    return [
        {"role": msg["role"], "content": msg["content"]} for msg in (result.data or [])
    ]


async def _store_message(
    supabase: Client,
    conversation_id: str,
    role: str,
    content: str,
    citations: Optional[List[Dict]] = None,
    tokens_used: Optional[int] = None,
    model: Optional[str] = None,
) -> str:
    """Store a message in the database. Returns the message ID."""
    now = datetime.now(timezone.utc).isoformat()
    insert_data = {
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "citations": citations or [],
        "tokens_used": tokens_used,
        "model": model,
        "created_at": now,
    }

    result = await asyncio.to_thread(
        lambda: supabase.table("chat_messages").insert(insert_data).execute()
    )

    if result.data:
        return result.data[0]["id"]

    logger.error(f"Failed to store {role} message for conversation {conversation_id}")
    return ""


async def _update_conversation_timestamp(
    supabase: Client, conversation_id: str
) -> None:
    """Update the conversation's updated_at timestamp."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("chat_conversations")
            .update({"updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", conversation_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Failed to update conversation timestamp: {e}")


# ---------------------------------------------------------------------------
# Main Chat Function
# ---------------------------------------------------------------------------


async def chat(
    scope: str,
    scope_id: Optional[str],
    message: str,
    conversation_id: Optional[str],
    user_id: str,
    supabase_client: Client,
    mentions: Optional[List[Dict[str, Any]]] = None,
) -> AsyncGenerator[str, None]:
    """
    Main chat function that returns an async generator of SSE events.

    Orchestrates:
    1. Rate limiting
    2. Conversation management
    3. Context retrieval (scope-dependent)
    4. Streaming LLM response
    5. Citation parsing and storage

    Yields SSE-formatted strings:
    - {"type": "token", "content": "..."} for streaming tokens
    - {"type": "citation", "data": {...}} for each resolved citation
    - {"type": "suggestions", "data": [...]} for follow-up questions
    - {"type": "done", "data": {"conversation_id": "...", "message_id": "..."}}
    - {"type": "error", "content": "..."} on errors
    """
    try:
        # 1. Rate limiting
        if not await _check_rate_limit(supabase_client, user_id):
            yield _sse_error(
                "Rate limit exceeded. Please wait a moment before sending another message."
            )
            return

        # 2. Conversation management
        try:
            conv_id, is_new = await _get_or_create_conversation(
                supabase_client,
                user_id,
                scope,
                scope_id,
                conversation_id,
                message,
            )
        except Exception as e:
            logger.error(f"Failed to manage conversation: {e}")
            yield _sse_error("Failed to create or find conversation. Please try again.")
            return

        # Store the user message
        await _store_message(supabase_client, conv_id, "user", message)

        # 3. Context retrieval via hybrid RAG engine
        yield _sse_event(
            "progress",
            {"step": "searching", "detail": "Searching signals and sources..."},
        )

        try:
            engine = RAGEngine(supabase_client)
            context_text, scope_metadata = await engine.retrieve(
                query=message,
                scope=scope,
                scope_id=scope_id,
                mentions=mentions,
                max_context_chars=MAX_CONTEXT_CHARS,
            )
            source_map = scope_metadata.get("source_map", {})
        except Exception as e:
            logger.error(f"Context retrieval failed for scope={scope}: {e}")
            yield _sse_error("Failed to retrieve context. Please try again.")
            return

        if scope_metadata.get("error"):
            yield _sse_error(f"Context error: {scope_metadata['error']}")
            return

        yield _sse_event(
            "progress",
            {
                "step": "analyzing",
                "detail": f"Found {scope_metadata.get('matched_cards', 0)} signals and {scope_metadata.get('matched_sources', 0)} sources",
            },
        )

        # 4. Build input items for the Responses API
        system_prompt = _build_system_prompt(scope, context_text, scope_metadata)

        # Get conversation history (for multi-turn context)
        history = await _get_conversation_history(supabase_client, conv_id)

        # Build input items list. The Responses API takes `instructions` for
        # the system prompt separately from the `input` items list.
        input_items: List[Dict[str, Any]] = []

        # Include recent history (skip the last user message since we'll add it fresh)
        if history:
            prior = history[:-1] if history else []
            for h in prior[-20:]:
                # History rows are stored chat-completions style. Strip any
                # role we can't replay (system) and pass user/assistant
                # through as plain message items.
                if h.get("role") in ("user", "assistant") and h.get("content"):
                    input_items.append(
                        {"role": h["role"], "content": h["content"]}
                    )
        input_items.append({"role": "user", "content": message})

        yield _sse_event(
            "progress",
            {
                "step": "synthesizing",
                "detail": "Analyzing sources and synthesizing response...",
            },
        )

        # 5. Stream the LLM response
        full_response = ""
        total_tokens = 0
        model_used = get_chat_deployment()

        try:
            available_tools = get_all_tools()
            responses_tools = _to_responses_tools(available_tools)

            base_kwargs: Dict[str, Any] = {
                "model": model_used,
                "stream": True,
                "max_output_tokens": 8192,
                "instructions": system_prompt,
                "reasoning": {"effort": get_reasoning_effort()},
            }
            if responses_tools:
                base_kwargs["tools"] = responses_tools
                base_kwargs["tool_choice"] = "auto"

            stream = await azure_openai_async_client.responses.create(
                input=input_items,
                **base_kwargs,
            )

            tool_call_count = 0
            web_search_count = 0
            tools_disabled = False  # set when budget is exhausted

            # Outer loop allows re-streaming after tool calls. We rebind
            # `stream` and re-enter; the inner async-for is bound at entry.
            while True:
                # Per-stream accumulators keyed by output item_id
                fc_items: Dict[str, Dict[str, str]] = {}

                async for event in stream:
                    etype = getattr(event, "type", "")

                    # Plain text deltas → stream to client
                    if etype == "response.output_text.delta":
                        delta_text = getattr(event, "delta", "") or ""
                        if delta_text:
                            full_response += delta_text
                            yield _sse_token(delta_text)
                        continue

                    # A new output item is emitted (could be reasoning,
                    # message, or function_call). We capture function_call
                    # items so we can both replay them in the next request
                    # and dispatch their tool result.
                    if etype == "response.output_item.added":
                        item = getattr(event, "item", None)
                        if item is not None and getattr(item, "type", "") == "function_call":
                            fc_items[item.id] = {
                                "item_id": item.id,
                                "call_id": getattr(item, "call_id", "") or "",
                                "name": getattr(item, "name", "") or "",
                                "arguments": getattr(item, "arguments", "") or "",
                            }
                        continue

                    # Function-call argument deltas accumulate into the item
                    if etype == "response.function_call_arguments.delta":
                        item_id = getattr(event, "item_id", "")
                        delta_args = getattr(event, "delta", "") or ""
                        if item_id in fc_items and delta_args:
                            fc_items[item_id]["arguments"] += delta_args
                        continue

                    # Final args for a function call (snapshot)
                    if etype == "response.function_call_arguments.done":
                        item_id = getattr(event, "item_id", "")
                        final_args = getattr(event, "arguments", "") or ""
                        if item_id in fc_items and final_args:
                            fc_items[item_id]["arguments"] = final_args
                        continue

                    # When an output item finishes, ensure we have the most
                    # complete snapshot for function_call items (name, call_id).
                    if etype == "response.output_item.done":
                        item = getattr(event, "item", None)
                        if item is not None and getattr(item, "type", "") == "function_call":
                            entry = fc_items.setdefault(
                                item.id,
                                {
                                    "item_id": item.id,
                                    "call_id": "",
                                    "name": "",
                                    "arguments": "",
                                },
                            )
                            entry["call_id"] = (
                                getattr(item, "call_id", "") or entry["call_id"]
                            )
                            entry["name"] = (
                                getattr(item, "name", "") or entry["name"]
                            )
                            entry["arguments"] = (
                                getattr(item, "arguments", "") or entry["arguments"]
                            )
                        continue

                    if etype == "response.completed":
                        resp = getattr(event, "response", None)
                        if resp is not None:
                            usage = getattr(resp, "usage", None)
                            if usage is not None:
                                total_tokens = (
                                    getattr(usage, "total_tokens", 0)
                                    or total_tokens
                                )
                        continue

                    if etype in ("response.failed", "response.error"):
                        err = getattr(event, "error", None) or getattr(
                            event, "response", None
                        )
                        logger.error(
                            "Responses API stream error: %s", err
                        )
                        raise RuntimeError(
                            f"Responses API stream failed: {err}"
                        )

                # Stream exhausted. If the model emitted function calls,
                # dispatch them and re-issue with their outputs appended.
                if not fc_items:
                    break  # done — no tool calls

                # Order tool calls by item_id stability (insertion order is
                # preserved in dicts since 3.7).
                pending = list(fc_items.values())
                budget_exhausted = False
                next_input_appendix: List[Dict[str, Any]] = []

                for fc in pending:
                    tool_name = fc["name"]
                    call_id = fc["call_id"]

                    # Replay the assistant's function_call item so the next
                    # request has the full conversation context.
                    next_input_appendix.append(
                        {
                            "type": "function_call",
                            "name": tool_name,
                            "call_id": call_id,
                            "arguments": fc["arguments"] or "{}",
                        }
                    )

                    try:
                        args = json.loads(fc["arguments"] or "{}")
                    except json.JSONDecodeError:
                        args = {}

                    # Per-message budgets
                    if tool_call_count >= MAX_TOOL_CALLS_PER_MESSAGE:
                        next_input_appendix.append(
                            {
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": json.dumps(
                                    {
                                        "error": (
                                            "Tool call budget reached "
                                            "for this message. Answer "
                                            "with the information you "
                                            "already have."
                                        )
                                    }
                                ),
                            }
                        )
                        budget_exhausted = True
                        continue
                    if (
                        tool_name == "web_search"
                        and web_search_count >= MAX_WEB_SEARCHES_PER_MESSAGE
                    ):
                        next_input_appendix.append(
                            {
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": json.dumps(
                                    {
                                        "error": (
                                            "Web search limit reached. "
                                            "Use other tools or answer "
                                            "with what you have."
                                        )
                                    }
                                ),
                            }
                        )
                        continue

                    tool_call_count += 1
                    if tool_name == "web_search":
                        web_search_count += 1

                    # Surface activity to the UI
                    yield _sse_event(
                        "progress",
                        {
                            "step": "tool_call",
                            "tool": tool_name,
                            "detail": progress_label(tool_name, args),
                        },
                    )

                    # Web search has its own integration with source_map
                    if tool_name == "web_search":
                        search_query = (args.get("query") or "").strip()
                        if not search_query:
                            next_input_appendix.append(
                                {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": json.dumps(
                                        {"error": "Empty search query."}
                                    ),
                                }
                            )
                            continue
                        try:
                            web_results = await asyncio.wait_for(
                                RAGEngine.web_search(
                                    search_query, max_results=5
                                ),
                                timeout=10.0,
                            )
                        except asyncio.TimeoutError:
                            web_results = []
                            logger.warning(
                                "Web search timed out for: %s",
                                search_query,
                            )

                        base_idx = max(source_map.keys(), default=0) + 1
                        for i, wr in enumerate(web_results):
                            source_map[base_idx + i] = {
                                "title": wr.get("title", "Web Result"),
                                "url": wr.get("url", ""),
                                "excerpt": (wr.get("content", ""))[:500],
                                "source_type": "web_search",
                            }

                        if web_results:
                            result_text = (
                                "Web search results for "
                                f"'{search_query}':\n\n"
                            )
                            for i, wr in enumerate(web_results):
                                result_text += (
                                    f"[{base_idx + i}] "
                                    f"{wr.get('title', 'Untitled')}\n"
                                )
                                result_text += (
                                    f"URL: {wr.get('url', '')}\n"
                                )
                                result_text += (
                                    f"{(wr.get('content', ''))[:800]}"
                                    "\n\n"
                                )
                        else:
                            result_text = "No web results found."

                        next_input_appendix.append(
                            {
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": result_text,
                            }
                        )
                        continue

                    # All other tools route through the dispatcher
                    tool_result = await dispatch_tool(
                        tool_name,
                        args,
                        supabase=supabase_client,
                        user_id=user_id,
                        chat_scope=scope,
                        chat_scope_id=scope_id,
                    )
                    next_input_appendix.append(
                        {
                            "type": "function_call_output",
                            "call_id": call_id,
                            "output": tool_result,
                        }
                    )

                # Append the function calls + their outputs to the input,
                # then re-issue the request. We use stateless mode (full
                # input list) rather than previous_response_id so that
                # everything is reproducible and we don't need to persist
                # response IDs across turns.
                input_items.extend(next_input_appendix)

                if budget_exhausted:
                    tools_disabled = True

                restream_kwargs: Dict[str, Any] = {
                    "model": model_used,
                    "stream": True,
                    "max_output_tokens": 8192,
                    "instructions": system_prompt,
                    "reasoning": {"effort": get_reasoning_effort()},
                }
                if responses_tools and not tools_disabled:
                    restream_kwargs["tools"] = responses_tools
                    restream_kwargs["tool_choice"] = "auto"

                stream = await azure_openai_async_client.responses.create(
                    input=input_items,
                    **restream_kwargs,
                )
                # Re-enter while loop with new stream

        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"Azure OpenAI streaming error ({error_type}): {e}")

            if "rate_limit" in str(e).lower() or "429" in str(e):
                yield _sse_error(
                    "The AI service is currently busy. Please try again in a moment."
                )
            elif "timeout" in str(e).lower():
                yield _sse_error(
                    "The request timed out. Please try a simpler question."
                )
            elif "connection" in str(e).lower():
                yield _sse_error("Connection to AI service lost. Please try again.")
            else:
                yield _sse_error(
                    "An error occurred while generating a response. Please try again."
                )

            # Still store partial response if we got any
            if full_response:
                await _store_message(
                    supabase_client,
                    conv_id,
                    "assistant",
                    full_response,
                    model=model_used,
                )
                await _update_conversation_timestamp(supabase_client, conv_id)
            return

        yield _sse_event(
            "progress", {"step": "citing", "detail": "Resolving citations..."}
        )

        # 6. Post-processing: parse citations
        citations = _parse_citations(full_response, source_map)
        for citation in citations:
            yield f"data: {json.dumps({'type': 'citation', 'data': citation})}\n\n"

        # Collect confidence metadata
        meta = {
            "source_count": len(source_map),
            "citation_count": len(citations),
        }
        # Scope-specific metadata
        if scope == "signal":
            meta["signal_name"] = scope_metadata.get("card_name")
            meta["source_count"] = scope_metadata.get("source_count", len(source_map))
        elif scope == "workstream":
            meta["workstream_name"] = scope_metadata.get("workstream_name")
            meta["card_count"] = scope_metadata.get("card_count", 0)
        elif scope == "global":
            meta["matched_cards"] = scope_metadata.get("matched_cards", 0)

        yield _sse_event("metadata", meta)

        # 7. Store assistant message
        message_id = await _store_message(
            supabase_client,
            conv_id,
            "assistant",
            full_response,
            citations=citations,
            tokens_used=total_tokens or None,
            model=model_used,
        )

        # Update conversation timestamp
        await _update_conversation_timestamp(supabase_client, conv_id)

        # 8. Generate follow-up suggestions (non-blocking, best-effort)
        try:
            suggestions = await _generate_suggestions_internal(
                scope, scope_metadata, full_response, message
            )
            if suggestions:
                yield f"data: {json.dumps({'type': 'suggestions', 'data': suggestions})}\n\n"
        except Exception as e:
            logger.warning(f"Failed to generate suggestions: {e}")

        # 9. Done event
        yield f"data: {json.dumps({'type': 'done', 'data': {'conversation_id': conv_id, 'message_id': message_id}})}\n\n"

    except Exception as e:
        logger.error(f"Unhandled error in chat generator: {e}", exc_info=True)
        yield _sse_error("An unexpected error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Suggestion Generation
# ---------------------------------------------------------------------------


async def _generate_suggestions_internal(
    scope: str,
    scope_metadata: Dict[str, Any],
    last_response: str,
    last_question: str,
) -> List[str]:
    """
    Generate follow-up question suggestions based on the conversation context.

    Uses the mini model for speed and cost efficiency.
    """
    scope_hints = {
        "signal": f"""The user is exploring a signal called \"{scope_metadata.get('card_name', 'Unknown')}\". Suggest questions about its implications for Austin, implementation timeline, risks, comparison with similar trends, or what other cities are doing.""",
        "workstream": f"""The user is exploring a workstream called \"{scope_metadata.get('workstream_name', 'Unknown')}\" with {scope_metadata.get('card_count', 0)} signals. Suggest questions about cross-cutting themes, priority signals, resource allocation, or strategic recommendations.""",
        "global": "The user asked a broad strategic question. Suggest questions about specific pillars, emerging patterns, comparisons between trends, or actionable next steps for the city.",
    }

    prompt = f"""Based on this Q&A exchange, suggest exactly 3 follow-up questions the user might ask.

User's question: {last_question[:300]}
Assistant's response (excerpt): {last_response[:600]}

Context: {scope_hints.get(scope, scope_hints['global'])}

Return a JSON array of exactly 3 short questions (max 80 chars each).
Example: ["What are the implementation costs?", "Which cities have adopted this?", "What are the equity implications?"]
"""

    try:
        response = await azure_openai_async_client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[
                {
                    "role": "system",
                    "content": "You suggest follow-up questions. Respond with a JSON array only.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=200,
        )

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        # Handle both {"suggestions": [...]} and plain [...] formats
        if isinstance(result, list):
            return [str(q)[:100] for q in result[:3]]
        elif isinstance(result, dict):
            suggestions = result.get("suggestions") or result.get("questions") or []
            return [str(q)[:100] for q in suggestions[:3]]

    except Exception as e:
        logger.warning(f"Suggestion generation failed: {e}")

    return []


async def generate_suggestions(
    scope: str,
    scope_id: Optional[str],
    supabase_client: Client,
    user_id: str,
) -> List[str]:
    """
    Generate context-aware suggested questions for a given scope.

    This is the public-facing function called by the API endpoint
    when the user hasn't started a conversation yet.
    """
    scope_metadata: Dict[str, Any] = {}

    try:
        if scope == "signal" and scope_id:
            # Fetch just the card name/summary for generating suggestions
            card_result = await asyncio.to_thread(
                lambda: supabase_client.table("cards")
                .select("name, summary, pillar_id, horizon, stage_id")
                .eq("id", scope_id)
                .execute()
            )
            if card_result.data:
                card = card_result.data[0]
                scope_metadata = {
                    "card_name": card.get("name"),
                    "card_summary": card.get("summary", ""),
                }
        elif scope == "workstream" and scope_id:
            ws_result = await asyncio.to_thread(
                lambda: supabase_client.table("workstreams")
                .select("name, description, keywords")
                .eq("id", scope_id)
                .execute()
            )
            if ws_result.data:
                ws = ws_result.data[0]
                scope_metadata = {
                    "workstream_name": ws.get("name"),
                    "workstream_description": ws.get("description", ""),
                    "card_count": 0,
                }
    except Exception as e:
        logger.warning(f"Failed to fetch scope metadata for suggestions: {e}")

    scope_hints = {
        "signal": (
            f"Generate 3 starter questions a city analyst might ask about "
            f"the signal \"{scope_metadata.get('card_name', 'this signal')}\". "
            f"Summary: {scope_metadata.get('card_summary', 'N/A')[:300]}. "
            f"Focus on implications for Austin, implementation, risks, and opportunities."
        ),
        "workstream": (
            f"Generate 3 starter questions a city analyst might ask about "
            f"the research workstream \"{scope_metadata.get('workstream_name', 'this workstream')}\". "
            f"Description: {scope_metadata.get('workstream_description', 'N/A')[:300]}. "
            f"Focus on trends, priorities, resource needs, and strategic recommendations."
        ),
        "global": (
            "Generate 3 starter questions a city analyst might ask about "
            "emerging trends and strategic intelligence for the City of Austin. "
            "Focus on cross-cutting themes, high-velocity signals, new patterns, "
            "and actionable intelligence."
        ),
    }

    prompt = scope_hints.get(scope, scope_hints["global"])

    try:
        response = await azure_openai_async_client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[
                {
                    "role": "system",
                    "content": "You generate starter questions for a strategic intelligence chat. "
                    'Respond with a JSON object: {"suggestions": ["q1", "q2", "q3"]}',
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=200,
        )

        content = response.choices[0].message.content.strip()
        result = json.loads(content)

        if isinstance(result, dict):
            suggestions = result.get("suggestions") or result.get("questions") or []
            return [str(q)[:100] for q in suggestions[:3]]
        elif isinstance(result, list):
            return [str(q)[:100] for q in result[:3]]

    except Exception as e:
        logger.error(f"Suggestion generation failed: {e}")

    # Fallback suggestions
    fallbacks = {
        "signal": [
            "What are the key implications of this signal for Austin?",
            "How does this compare to what other cities are doing?",
            "What should the city do to prepare for this trend?",
        ],
        "workstream": [
            "What are the most important trends in this workstream?",
            "Which signals require the most urgent attention?",
            "What are the common themes across these signals?",
        ],
        "global": [
            "What are the fastest-moving trends right now?",
            "Are there any new cross-cutting patterns emerging?",
            "What should Austin prioritize in the next 12 months?",
        ],
    }

    return fallbacks.get(scope, fallbacks["global"])
