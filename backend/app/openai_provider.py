"""
OpenAI Provider for Foresight Application.

Centralized commercial OpenAI client configuration. Public symbol names are
preserved from the previous Azure-flavored implementation so existing callers
(`azure_openai_client`, `get_chat_deployment`, etc.) keep working without edits.

Environment Variables:
- OPENAI_API_KEY (required): Commercial OpenAI API key
- OPENAI_CHAT_MODEL: Premium chat model (default: gpt-5.5-2026-04-23)
- OPENAI_CHAT_AGENT_MODEL: Agentic-work model (default: gpt-5.4-2026-03-05)
- OPENAI_CHAT_MINI_MODEL: High-volume / fast model (default: gpt-5.4-mini-2026-03-17)
- OPENAI_EMBEDDING_MODEL: Embedding model (default: text-embedding-ada-002 — kept
  for pgvector compatibility with existing 1536-dim card embeddings)
- OPENAI_BASE_URL (optional): Override base URL for OpenAI-compatible endpoints
"""

import os
import logging
from openai import OpenAI, AsyncOpenAI

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
            "OPENAI_CHAT_MODEL", "gpt-5.5-2026-04-23"
        )
        self.model_chat_agent = _get_optional_env(
            "OPENAI_CHAT_AGENT_MODEL", "gpt-5.4-2026-03-05"
        )
        self.model_chat_mini = _get_optional_env(
            "OPENAI_CHAT_MINI_MODEL", "gpt-5.4-mini-2026-03-17"
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
        logger.info(f"  Embedding Model: {self.model_embedding}")


# Map legacy / alternate model name aliases to our configured model IDs.
_MODEL_ALIASES: dict = {}


def _initialize_model_mapping(config: OpenAIConfig):
    global _MODEL_ALIASES
    _MODEL_ALIASES = {
        # Legacy chat aliases that older code may still pass in
        "gpt-4o": config.model_chat,
        "gpt-4o-mini": config.model_chat_mini,
        "gpt-4": config.model_chat,
        "gpt-4-turbo": config.model_chat,
        "gpt-4.1": config.model_chat,
        "gpt-4.1-mini": config.model_chat_mini,
        # Embedding aliases
        "text-embedding-ada-002": config.model_embedding,
        "text-embedding-3-small": config.model_embedding,
        "text-embedding-3-large": config.model_embedding,
    }


def get_deployment_name(model_name: str) -> str:
    """Resolve a model alias to the configured OpenAI model ID.

    Kept under the legacy 'deployment' name so existing callers compile.
    """
    if model_name in _MODEL_ALIASES:
        return _MODEL_ALIASES[model_name]
    # Already a valid configured model? Pass through.
    if model_name in {
        _config.model_chat,
        _config.model_chat_agent,
        _config.model_chat_mini,
        _config.model_embedding,
    }:
        return model_name
    # Unknown — pass through; OpenAI will reject if truly invalid.
    return model_name


def get_chat_deployment() -> str:
    """Premium chat model (user-facing chat, briefs)."""
    return _config.model_chat


def get_chat_agent_deployment() -> str:
    """Agentic-work model (signal agent, multi-step tool use)."""
    return _config.model_chat_agent


def get_chat_mini_deployment() -> str:
    """High-volume / fast model (titles, suggestions, reranking, query expansion)."""
    return _config.model_chat_mini


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


try:
    _config = OpenAIConfig()
    _initialize_model_mapping(_config)

    # Single client per (sync/async) — commercial OpenAI does not need a
    # separate embedding client (no per-resource api_version).
    _sync_client = _create_sync_client(_config)
    _async_client = _create_async_client(_config)

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
    "get_deployment_name",
    "get_chat_deployment",
    "get_chat_agent_deployment",
    "get_chat_mini_deployment",
    "get_embedding_deployment",
    "get_chat_api_version",
    "get_embedding_api_version",
    "get_reasoning_effort",
    # Validation
    "validate_azure_connection",
    "validate_openai_connection",
]
