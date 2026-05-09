"""Best-effort usage telemetry for LLM and external API spend.

This module intentionally avoids importing ``app.deps`` so the OpenAI provider
can use it without creating an import cycle. Telemetry writes are asynchronous
fire-and-forget and must never break the user-facing request path.
"""

from __future__ import annotations

import contextlib
import contextvars
import atexit
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from typing import Any, Iterator

from supabase import Client, create_client

from app.redaction import merge_flags, redact_and_truncate

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="usage-telemetry")
atexit.register(lambda: _executor.shutdown(wait=False, cancel_futures=True))
_supabase_client: Client | None = None

_usage_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "usage_context", default={}
)

# Audit-content capture flag, cached to avoid hitting admin_settings on every
# LLM call. The flag is admin-controlled via the FORESIGHT_AUDIT_LLM_CONTENT
# row; the cache TTL bounds how long a flip takes to propagate.
_AUDIT_FLAG_KEY = "FORESIGHT_AUDIT_LLM_CONTENT"
_AUDIT_FLAG_TTL_S = 60.0
_audit_flag_cache: dict[str, Any] = {"value": False, "expires_at": 0.0}

# Request kinds that carry semantically interesting prompt/response content.
# Embeddings are excluded — capturing every embedded card body would balloon
# the audit table without adding investigative value the metadata doesn't
# already provide.
_AUDIT_REQUEST_KINDS = frozenset({"chat.completions", "responses"})


# Order matters — _load_pricing's matcher uses ``model.startswith(prefix)`` and
# returns the first hit, so longer / more-specific prefixes must come first.
DEFAULT_MODEL_PRICING_PER_MILLION = {
    "gpt-5.5-pro": {"input": 30.00, "output": 180.00, "cached_input": 0.0},
    "gpt-5.5": {"input": 5.00, "output": 30.00, "cached_input": 0.50},
    "gpt-5.4-mini": {"input": 0.75, "output": 4.50, "cached_input": 0.075},
    "gpt-5.4-nano": {"input": 0.20, "output": 1.25, "cached_input": 0.02},
    "gpt-5.4-pro": {"input": 30.00, "output": 180.00, "cached_input": 0.0},
    "gpt-5.4": {"input": 2.50, "output": 15.00, "cached_input": 0.25},
    "gpt-5.2-pro": {"input": 21.00, "output": 168.00, "cached_input": 0.0},
    "gpt-5.2": {"input": 1.75, "output": 14.00, "cached_input": 0.0},
    "gpt-5.1": {"input": 1.25, "output": 10.00, "cached_input": 0.125},
    "gpt-5-mini": {"input": 0.25, "output": 2.00, "cached_input": 0.025},
    "gpt-5-nano": {"input": 0.05, "output": 0.40, "cached_input": 0.005},
    "gpt-5-pro": {"input": 15.00, "output": 120.00, "cached_input": 0.0},
    "gpt-5": {"input": 1.25, "output": 10.00, "cached_input": 0.125},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60, "cached_input": 0.10},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40, "cached_input": 0.025},
    "gpt-4.1": {"input": 2.00, "output": 8.00, "cached_input": 0.50},
    "text-embedding-ada-002": {"input": 0.10, "output": 0.00, "cached_input": 0.10},
}


@contextlib.contextmanager
def llm_usage_context(**fields: Any) -> Iterator[None]:
    """Attach task/user/card/workstream metadata to OpenAI telemetry."""
    previous = _usage_context.get()
    merged = {**previous, **{k: v for k, v in fields.items() if v is not None}}
    token = _usage_context.set(merged)
    try:
        yield
    finally:
        _usage_context.reset(token)


def get_usage_context() -> dict[str, Any]:
    """Return a copy of the current telemetry context."""
    return dict(_usage_context.get())


def _get_supabase_client() -> Client | None:
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not service_key:
        return None

    _supabase_client = create_client(url, service_key)
    return _supabase_client


def _load_pricing() -> dict[str, dict[str, float]]:
    raw = os.getenv("OPENAI_MODEL_PRICING_JSON")
    if not raw:
        return DEFAULT_MODEL_PRICING_PER_MILLION
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid OPENAI_MODEL_PRICING_JSON; using built-in defaults")
        return DEFAULT_MODEL_PRICING_PER_MILLION

    pricing: dict[str, dict[str, float]] = {}
    for model_prefix, values in parsed.items():
        if not isinstance(values, dict):
            continue
        pricing[model_prefix] = {
            "input": float(values.get("input", 0)),
            "output": float(values.get("output", 0)),
            "cached_input": float(values.get("cached_input", values.get("input", 0))),
        }
    return pricing or DEFAULT_MODEL_PRICING_PER_MILLION


def estimate_openai_cost_usd(
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    cached_input_tokens: int | None = None,
) -> Decimal | None:
    """Estimate USD cost from configured per-million-token pricing."""
    if not model:
        return None

    pricing = None
    for prefix, price in _load_pricing().items():
        if model.startswith(prefix):
            pricing = price
            break
    if pricing is None:
        return None

    input_count = max(int(input_tokens or 0), 0)
    cached_count = max(int(cached_input_tokens or 0), 0)
    billable_input = max(input_count - cached_count, 0)
    output_count = max(int(output_tokens or 0), 0)

    cost = (
        (billable_input / 1_000_000) * pricing["input"]
        + (cached_count / 1_000_000) * pricing["cached_input"]
        + (output_count / 1_000_000) * pricing["output"]
    )
    return Decimal(str(round(cost, 8)))


def _getattr_nested(obj: Any, *names: str) -> Any:
    current = obj
    for name in names:
        if current is None:
            return None
        current = getattr(current, name, None)
    return current


def extract_openai_usage(response: Any) -> dict[str, int | None]:
    """Extract token usage across Chat Completions, Responses, and Embeddings."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return {
            "input_tokens": None,
            "output_tokens": None,
            "cached_input_tokens": None,
            "total_tokens": None,
        }

    input_tokens = getattr(usage, "prompt_tokens", None)
    if input_tokens is None:
        input_tokens = getattr(usage, "input_tokens", None)

    output_tokens = getattr(usage, "completion_tokens", None)
    if output_tokens is None:
        output_tokens = getattr(usage, "output_tokens", None)

    cached_input_tokens = _getattr_nested(usage, "prompt_tokens_details", "cached_tokens")
    if cached_input_tokens is None:
        cached_input_tokens = _getattr_nested(
            usage, "input_tokens_details", "cached_tokens"
        )

    total_tokens = getattr(usage, "total_tokens", None)
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = int(input_tokens or 0) + int(output_tokens or 0)

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cached_input_tokens": cached_input_tokens,
        "total_tokens": total_tokens,
    }


def is_audit_content_enabled() -> bool:
    """Return True when prompt/response payload capture is enabled.

    Reads ``admin_settings`` with a 60s in-process cache. Fails closed —
    any error or missing row returns False so we never write content the
    operator hasn't explicitly opted into.
    """
    now = time.monotonic()
    if _audit_flag_cache["expires_at"] > now:
        return bool(_audit_flag_cache["value"])

    enabled = False
    client = _get_supabase_client()
    if client is not None:
        try:
            resp = (
                client.table("admin_settings")
                .select("value")
                .eq("key", _AUDIT_FLAG_KEY)
                .limit(1)
                .execute()
            )
            rows = getattr(resp, "data", None) or []
            if rows:
                raw = rows[0].get("value")
                if isinstance(raw, bool):
                    enabled = raw
                elif isinstance(raw, str):
                    enabled = raw.strip().lower() in {"1", "true", "t", "yes", "on"}
        except Exception as exc:  # pragma: no cover — fail closed on any error
            logger.debug("Audit flag lookup failed: %s", exc)

    _audit_flag_cache["value"] = enabled
    _audit_flag_cache["expires_at"] = now + _AUDIT_FLAG_TTL_S
    return enabled


def reset_audit_flag_cache() -> None:
    """Force the audit-content cache to refresh on the next call.
    Tests use this to flip the flag without waiting for TTL."""
    _audit_flag_cache["expires_at"] = 0.0


def _stringify_messages(messages: list[dict[str, Any]] | None) -> str:
    if not messages:
        return ""
    parts: list[str] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role", "?"))
        content = msg.get("content", "")
        if isinstance(content, list):
            # Vision / multimodal: stringify each part's text field if present.
            chunks: list[str] = []
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text") or part.get("input_text") or ""
                    if text:
                        chunks.append(str(text))
                else:
                    chunks.append(str(part))
            content = "\n".join(chunks)
        parts.append(f"[{role}]\n{content}")
    return "\n\n".join(parts)


def _sanitize_tool_calls(tool_calls: list[dict[str, Any]] | None) -> tuple[list[dict[str, Any]], list[str]]:
    if not tool_calls:
        return [], []
    sanitized: list[dict[str, Any]] = []
    all_flags: list[list[str]] = []
    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        name = call.get("name") or call.get("function", {}).get("name") if isinstance(call.get("function"), dict) else call.get("name")
        raw_args = call.get("arguments")
        if raw_args is None and isinstance(call.get("function"), dict):
            raw_args = call["function"].get("arguments")
        args_str = raw_args if isinstance(raw_args, str) else json.dumps(raw_args, default=str) if raw_args is not None else ""
        redacted_args, flags = redact_and_truncate(args_str)
        sanitized.append({"name": name, "arguments": redacted_args})
        all_flags.append(flags)
    return sanitized, merge_flags(all_flags)


def _build_audit_payload(
    *,
    request_kind: str,
    messages: list[dict[str, Any]] | None,
    response_text: str | None,
    tool_calls: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Return audit fields to merge into the usage event row.

    Returns an empty dict (no payload columns set) when capture is disabled,
    when this request_kind is not audited, or when nothing is provided.
    """
    if request_kind not in _AUDIT_REQUEST_KINDS:
        return {}
    if not is_audit_content_enabled():
        return {}
    if not (messages or response_text or tool_calls):
        return {}

    prompt_str = _stringify_messages(messages)
    prompt_excerpt, prompt_flags = redact_and_truncate(prompt_str)
    response_excerpt, response_flags = redact_and_truncate(response_text)
    sanitized_tool_calls, tool_flags = _sanitize_tool_calls(tool_calls)

    flags = merge_flags([prompt_flags, response_flags, tool_flags])

    payload: dict[str, Any] = {"redaction_flags": flags}
    if prompt_excerpt:
        payload["prompt_excerpt"] = prompt_excerpt
    if response_excerpt:
        payload["response_excerpt"] = response_excerpt
    if sanitized_tool_calls:
        payload["tool_calls"] = sanitized_tool_calls
    return payload


def record_llm_usage_event(
    *,
    provider: str,
    model: str | None,
    operation: str,
    request_kind: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cached_input_tokens: int | None = None,
    total_tokens: int | None = None,
    latency_ms: int | None = None,
    status: str = "success",
    error_type: str | None = None,
    metadata: dict[str, Any] | None = None,
    messages: list[dict[str, Any]] | None = None,
    response_text: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> None:
    """Queue an LLM usage event insert. Failures are logged and swallowed.

    ``messages``, ``response_text``, and ``tool_calls`` populate the audit
    payload columns when ``FORESIGHT_AUDIT_LLM_CONTENT`` is enabled. When
    disabled (default), they are ignored — only token / cost metrics persist.
    """
    context = get_usage_context()
    estimated_cost = estimate_openai_cost_usd(
        model, input_tokens, output_tokens, cached_input_tokens
    )
    event = {
        "user_id": context.get("user_id"),
        "provider": provider,
        "model": model,
        "operation": context.get("operation") or operation,
        "request_kind": request_kind,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cached_input_tokens": cached_input_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd": float(estimated_cost) if estimated_cost is not None else None,
        "latency_ms": latency_ms,
        "status": status,
        "error_type": error_type,
        "run_id": context.get("run_id"),
        "task_id": context.get("task_id"),
        "card_id": context.get("card_id"),
        "workstream_id": context.get("workstream_id"),
        "metadata": {**(metadata or {}), **context.get("metadata", {})},
    }
    audit_payload = _build_audit_payload(
        request_kind=request_kind,
        messages=messages,
        response_text=response_text,
        tool_calls=tool_calls,
    )
    if audit_payload:
        event.update(audit_payload)
    _executor.submit(_insert_event, "llm_usage_events", event)


def record_external_api_usage_event(
    *,
    provider: str,
    operation: str,
    request_kind: str | None = None,
    units: int | None = None,
    estimated_cost_usd: float | None = None,
    latency_ms: int | None = None,
    status: str = "success",
    error_type: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Queue an external API usage event insert."""
    context = get_usage_context()
    event = {
        "user_id": context.get("user_id"),
        "provider": provider,
        "operation": context.get("operation") or operation,
        "request_kind": request_kind,
        "units": units,
        "estimated_cost_usd": estimated_cost_usd,
        "latency_ms": latency_ms,
        "status": status,
        "error_type": error_type,
        "run_id": context.get("run_id"),
        "task_id": context.get("task_id"),
        "card_id": context.get("card_id"),
        "workstream_id": context.get("workstream_id"),
        "metadata": {**(metadata or {}), **context.get("metadata", {})},
    }
    _executor.submit(_insert_event, "external_api_usage_events", event)


def _insert_event(table: str, event: dict[str, Any]) -> None:
    client = _get_supabase_client()
    if client is None:
        return
    try:
        client.table(table).insert(event).execute()
    except Exception as exc:
        logger.debug("Usage telemetry insert failed for %s: %s", table, exc)


def monotonic_ms() -> int:
    return int(time.monotonic() * 1000)
