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

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="usage-telemetry")
atexit.register(lambda: _executor.shutdown(wait=False, cancel_futures=True))
_supabase_client: Client | None = None

_usage_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "usage_context", default={}
)


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
) -> None:
    """Queue an LLM usage event insert. Failures are logged and swallowed."""
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
