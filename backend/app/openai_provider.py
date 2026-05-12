"""
OpenAI Provider for Foresight Application.

Centralized commercial OpenAI client configuration. Public symbol names are
preserved from the previous Azure-flavored implementation so existing callers
(`azure_openai_client`, `get_chat_deployment`, etc.) keep working without edits.

Environment Variables:
- OPENAI_API_KEY (required): Commercial OpenAI API key
- OPENAI_CHAT_MODEL: Premium chat model (default: gpt-5.4-2026-03-05)
- OPENAI_CHAT_AGENT_MODEL: Agentic-work model (default: gpt-5.4-2026-03-05)
- OPENAI_CHAT_MINI_MODEL: Reasoning-capable mini (default: gpt-5.4-mini-2026-03-17)
- OPENAI_CHAT_NANO_MODEL: High-volume label-only slot — kept as an alias of
  the mini model by default so we don't downgrade quality unintentionally.
  Set this explicitly to gpt-5-nano (or similar) only after sampling outputs.
- OPENAI_EMBEDDING_MODEL: Embedding model (default: text-embedding-ada-002 — kept
  for pgvector compatibility with existing 1536-dim card embeddings)
- OPENAI_BASE_URL (optional): Override base URL for OpenAI-compatible endpoints

Tier guidance:
- Premium (chat): chat reply synthesis, brief generation, card synthesis, the
  cascade's "core" prompt — anywhere reasoning quality is load-bearing.
- Mini: cascade dimension prompts, query expansion, RAG reranking — needs some
  reasoning but not premium quality.
- Nano: title generation, smart suggestions, source-relevance triage —
  high-volume, low-stakes label/short-text tasks.
"""

import logging
import os
from typing import Any

from openai import OpenAI, AsyncOpenAI

from app.usage_telemetry import (
    extract_openai_usage,
    monotonic_ms,
    record_llm_usage_event,
)

logger = logging.getLogger(__name__)


def _get_required_env(name: str) -> str:
    if value := os.getenv(name):
        return value
    raise ValueError(
        f"Missing required environment variable: {name}. "
        f"OpenAI configuration is required for this application."
    )


def _get_optional_env(name: str, default: str) -> str:
    return os.getenv(name, default)


class OpenAIConfig:
    """Commercial OpenAI configuration container."""

    def __init__(self):
        self.api_key = _get_required_env("OPENAI_API_KEY")
        self.base_url = os.getenv("OPENAI_BASE_URL") or None

        # Model names (real OpenAI model IDs, not Azure deployment names)
        self.model_chat = _get_optional_env(
            "OPENAI_CHAT_MODEL", "gpt-5.4-2026-03-05"
        )
        self.model_chat_agent = _get_optional_env(
            "OPENAI_CHAT_AGENT_MODEL", "gpt-5.4-2026-03-05"
        )
        self.model_chat_mini = _get_optional_env(
            "OPENAI_CHAT_MINI_MODEL", "gpt-5.4-mini-2026-03-17"
        )
        # Nano falls back to the mini model when unset — ensures nano-routed
        # call sites don't quietly drop a generation in quality if the env
        # var isn't configured.
        self.model_chat_nano = _get_optional_env(
            "OPENAI_CHAT_NANO_MODEL", self.model_chat_mini
        )
        self.model_embedding = _get_optional_env(
            "OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002"
        )

    def log_configuration(self):
        logger.info("OpenAI Configuration:")
        logger.info(f"  Base URL: {self.base_url or 'default (api.openai.com)'}")
        logger.info(f"  Chat Model: {self.model_chat}")
        logger.info(f"  Chat Agent Model: {self.model_chat_agent}")
        logger.info(f"  Chat Mini Model: {self.model_chat_mini}")
        logger.info(f"  Chat Nano Model: {self.model_chat_nano}")
        logger.info(f"  Embedding Model: {self.model_embedding}")


def get_chat_deployment() -> str:
    """Premium chat model (user-facing chat, briefs)."""
    return _config.model_chat


def get_chat_agent_deployment() -> str:
    """Agentic-work model (signal agent, multi-step tool use)."""
    return _config.model_chat_agent


def get_chat_mini_deployment() -> str:
    """Mini reasoning model (cascade dimensions, query expansion, reranking)."""
    return _config.model_chat_mini


def get_chat_nano_deployment() -> str:
    """Nano label-only model (titles, suggestions, source-relevance triage)."""
    return _config.model_chat_nano


def get_embedding_deployment() -> str:
    """Embedding model (kept on ada-002 for pgvector compatibility)."""
    return _config.model_embedding


def get_reasoning_effort() -> str:
    """Reasoning effort for GPT-5 chat models (minimal | low | medium | high).

    Default 'medium' balances answer quality against reasoning-token spend.
    Override per-deployment via OPENAI_REASONING_EFFORT.
    """
    return os.getenv("OPENAI_REASONING_EFFORT", "medium")


def get_chat_api_version() -> str:
    """Legacy API. Commercial OpenAI does not use api_version; returns ''."""
    return ""


def get_embedding_api_version() -> str:
    """Legacy API. Commercial OpenAI does not use api_version; returns ''."""
    return ""


def _create_sync_client(config: OpenAIConfig) -> OpenAI:
    kwargs = {"api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url
    return OpenAI(**kwargs)


def _create_async_client(config: OpenAIConfig) -> AsyncOpenAI:
    kwargs = {"api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url
    return AsyncOpenAI(**kwargs)


def _resolve_model(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str | None:
    if model := kwargs.get("model"):
        return str(model)
    if args:
        return str(args[0])
    return None


def _extract_request_messages(
    request_kind: str, kwargs: dict[str, Any]
) -> list[dict[str, Any]] | None:
    """Return the request messages for chat-style calls, ``None`` otherwise."""
    if request_kind == "chat.completions":
        messages = kwargs.get("messages")
        return messages if isinstance(messages, list) else None
    if request_kind == "responses":
        # The Responses API accepts either ``input`` (string or list of items)
        # or ``messages``. Normalize to a list-of-dicts shape.
        if isinstance(messages := kwargs.get("messages"), list):
            return messages
        if (raw := kwargs.get("input")) is not None:
            if isinstance(raw, str):
                return [{"role": "user", "content": raw}]
            if isinstance(raw, list):
                return [m for m in raw if isinstance(m, dict)]
    return None


def _extract_response_payload(
    request_kind: str, response: Any
) -> tuple[str | None, list[dict[str, Any]] | None]:
    """Return ``(response_text, tool_calls)`` extracted from a non-streaming
    response. Failures are swallowed — audit must never break the call path.
    """
    try:
        if request_kind == "chat.completions":
            choices = getattr(response, "choices", None) or []
            if not choices:
                return None, None
            message = getattr(choices[0], "message", None)
            text = getattr(message, "content", None) if message is not None else None
            tool_calls_raw = (
                getattr(message, "tool_calls", None) if message is not None else None
            )
            tool_calls = _normalize_tool_calls(tool_calls_raw)
            return (text if isinstance(text, str) else None), tool_calls
        if request_kind == "responses":
            text = getattr(response, "output_text", None)
            return (text if isinstance(text, str) else None), None
    except Exception:  # pragma: no cover — defensive only
        return None, None
    return None, None


def _normalize_tool_calls(raw: Any) -> list[dict[str, Any]] | None:
    if not raw:
        return None
    out: list[dict[str, Any]] = []
    for call in raw:
        function = getattr(call, "function", None)
        name = getattr(function, "name", None) if function else getattr(call, "name", None)
        arguments = (
            getattr(function, "arguments", None)
            if function
            else getattr(call, "arguments", None)
        )
        out.append({"name": name, "arguments": arguments})
    return out or None


class _SyncCreateProxy:
    def __init__(self, create_func, request_kind: str):
        self._create_func = create_func
        self._request_kind = request_kind

    def __call__(self, *args, **kwargs):
        model = _resolve_model(args, kwargs)
        request_messages = _extract_request_messages(self._request_kind, kwargs)
        started = monotonic_ms()
        try:
            response = self._create_func(*args, **kwargs)
        except Exception as exc:
            record_llm_usage_event(
                provider="openai",
                model=model,
                operation=f"openai.{self._request_kind}",
                request_kind=self._request_kind,
                latency_ms=monotonic_ms() - started,
                status="error",
                error_type=type(exc).__name__,
                messages=request_messages,
            )
            raise

        usage = extract_openai_usage(response)
        is_stream = bool(kwargs.get("stream"))
        status = "stream_started" if is_stream else "success"
        response_text, tool_calls = (
            (None, None) if is_stream else _extract_response_payload(self._request_kind, response)
        )
        record_llm_usage_event(
            provider="openai",
            model=model,
            operation=f"openai.{self._request_kind}",
            request_kind=self._request_kind,
            latency_ms=monotonic_ms() - started,
            status=status,
            messages=request_messages,
            response_text=response_text,
            tool_calls=tool_calls,
            **usage,
        )
        return response

    def __getattr__(self, name: str):
        return getattr(self._create_func, name)


class _AsyncCreateProxy:
    def __init__(self, create_func, request_kind: str):
        self._create_func = create_func
        self._request_kind = request_kind

    async def __call__(self, *args, **kwargs):
        model = _resolve_model(args, kwargs)
        request_messages = _extract_request_messages(self._request_kind, kwargs)
        started = monotonic_ms()
        try:
            response = await self._create_func(*args, **kwargs)
        except Exception as exc:
            record_llm_usage_event(
                provider="openai",
                model=model,
                operation=f"openai.{self._request_kind}",
                request_kind=self._request_kind,
                latency_ms=monotonic_ms() - started,
                status="error",
                error_type=type(exc).__name__,
                messages=request_messages,
            )
            raise

        usage = extract_openai_usage(response)
        is_stream = bool(kwargs.get("stream"))
        status = "stream_started" if is_stream else "success"
        response_text, tool_calls = (
            (None, None)
            if is_stream
            else _extract_response_payload(self._request_kind, response)
        )
        record_llm_usage_event(
            provider="openai",
            model=model,
            operation=f"openai.{self._request_kind}",
            request_kind=self._request_kind,
            latency_ms=monotonic_ms() - started,
            status=status,
            messages=request_messages,
            response_text=response_text,
            tool_calls=tool_calls,
            **usage,
        )
        return response

    def __getattr__(self, name: str):
        return getattr(self._create_func, name)


class _ResourceProxy:
    def __init__(self, resource, request_kind: str, is_async: bool = False):
        self._resource = resource
        create_func = getattr(resource, "create", None)
        if create_func is not None:
            proxy_cls = _AsyncCreateProxy if is_async else _SyncCreateProxy
            self.create = proxy_cls(create_func, request_kind)

    def __getattr__(self, name: str):
        return getattr(self._resource, name)


class _ChatProxy:
    def __init__(self, chat, is_async: bool = False):
        self._chat = chat
        self.completions = _ResourceProxy(
            chat.completions, "chat.completions", is_async=is_async
        )

    def __getattr__(self, name: str):
        return getattr(self._chat, name)


class _InstrumentedClientProxy:
    def __init__(self, client, is_async: bool = False):
        self._client = client
        self.chat = _ChatProxy(client.chat, is_async=is_async)
        self.embeddings = _ResourceProxy(
            client.embeddings, "embeddings", is_async=is_async
        )
        self.responses = _ResourceProxy(client.responses, "responses", is_async=is_async)

    def __getattr__(self, name: str):
        return getattr(self._client, name)


def reload_config() -> None:
    """Re-read OpenAI model env vars into the cached _config.

    Why: model env vars (OPENAI_CHAT_MODEL etc.) are read into OpenAIConfig
    once at import. The admin console's PATCH /admin/settings/{key} mutates
    os.environ, but get_chat_deployment() returns _config.model_chat — so
    without a refresh, saved overrides don't apply until the process restarts.
    Call this after saving a model-group setting.

    Note: this only refreshes the in-memory model name lookups. The OpenAI
    client objects (_sync_client, _async_client) are not rebuilt, since
    OPENAI_API_KEY / OPENAI_BASE_URL are not admin-controlled.
    """
    global _config
    _config = OpenAIConfig()


try:
    _config = OpenAIConfig()

    # Single client per (sync/async) — commercial OpenAI does not need a
    # separate embedding client (no per-resource api_version).
    _sync_client = _InstrumentedClientProxy(_create_sync_client(_config))
    _async_client = _InstrumentedClientProxy(_create_async_client(_config), is_async=True)

    # Public symbols — names retained from the Azure-era for caller compatibility.
    azure_openai_client = _sync_client
    azure_openai_async_client = _async_client
    azure_openai_embedding_client = _sync_client
    azure_openai_async_embedding_client = _async_client

    # Also expose under non-Azure names for new code.
    openai_client = _sync_client
    openai_async_client = _async_client

    _config.log_configuration()
    logger.info("OpenAI clients initialized successfully")

except ValueError as e:
    logger.critical(f"Failed to initialize OpenAI: {e}")
    raise


async def validate_azure_connection() -> dict:
    """Validate the OpenAI connection. Name kept for legacy callers."""
    try:
        response = azure_openai_client.chat.completions.create(
            model=_config.model_chat_mini,
            messages=[{"role": "user", "content": "Hello"}],
            max_completion_tokens=5,
        )
        chat_ok = response.choices[0].message.content is not None

        embed_response = azure_openai_embedding_client.embeddings.create(
            model=_config.model_embedding,
            input="test",
        )
        embedding_ok = len(embed_response.data[0].embedding) > 0

        return {
            "status": "healthy" if (chat_ok and embedding_ok) else "degraded",
            "chat_completion": "ok" if chat_ok else "failed",
            "embeddings": "ok" if embedding_ok else "failed",
            "endpoint": _config.base_url or "https://api.openai.com",
            "deployments": {
                "chat": _config.model_chat,
                "chat_agent": _config.model_chat_agent,
                "chat_mini": _config.model_chat_mini,
                "chat_nano": _config.model_chat_nano,
                "embedding": _config.model_embedding,
            },
        }
    except Exception as e:
        logger.error(f"OpenAI validation failed: {e}")
        raise


validate_openai_connection = validate_azure_connection


__all__ = [
    # Clients (legacy Azure-prefixed names, retained for caller compatibility)
    "azure_openai_client",
    "azure_openai_async_client",
    "azure_openai_embedding_client",
    "azure_openai_async_embedding_client",
    # Clients (new names)
    "openai_client",
    "openai_async_client",
    # Model name helpers
    "get_chat_deployment",
    "get_chat_agent_deployment",
    "get_chat_mini_deployment",
    "get_chat_nano_deployment",
    "get_embedding_deployment",
    "get_chat_api_version",
    "get_embedding_api_version",
    "get_reasoning_effort",
    # Validation
    "validate_azure_connection",
    "validate_openai_connection",
    # Runtime config refresh
    "reload_config",
]
