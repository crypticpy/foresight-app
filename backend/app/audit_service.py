"""Admin audit-log helpers.

Centralizes writes to ``admin_audit_log`` so every admin-mutation router
shares the same redaction + best-effort insert behavior. Previously the
implementation lived inside ``app.routers.admin`` and was reached from
``admin_discovery`` via lazy imports inside each handler to avoid a
circular dependency; consolidating it here lets callers do a normal
top-level import.

Sensitive-key redaction:
    Two triggers — the target_id itself contains a sensitive token
    (e.g. a setting whose key is ``openai_api_key``) OR an individual
    payload field name does (``password``, ``secret``, ``api_key``,
    ``token``, ``credential``). Both before/after snapshots run through
    the same redactor so a future setting addition cannot leak a secret
    into the audit table without code changes here.

Failure mode:
    The audit row is non-critical metadata. By the time we get here the
    caller's mutation has already succeeded; raising would surface a
    spurious HTTP error. We log and swallow instead — operators monitor
    via the logger.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from fastapi import Request

from app.deps import supabase

logger = logging.getLogger(__name__)

# Defense-in-depth: even though current SETTING_DEFINITIONS don't include
# secrets, redact any audit payload key (or setting target_id) that looks
# sensitive so a future addition can't leak via the audit table.
_SENSITIVE_KEY_PATTERN = re.compile(
    r"(password|secret|api[_-]?key|token|credential)", re.IGNORECASE
)
_REDACTED = "***REDACTED***"


def redact_for_audit(target_id: str, payload: Any) -> Any:
    """Mask sensitive values in an audit payload.

    Triggers on either a sensitive-looking ``target_id`` (the whole
    payload is suspect) or sensitive-looking individual field names.
    Non-dict payloads pass through — we only know how to redact
    key/value maps.
    """
    if not isinstance(payload, dict):
        return payload
    target_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(target_id or ""))
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        field_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(str(key)))
        if (target_is_sensitive or field_is_sensitive) and value is not None:
            redacted[key] = _REDACTED
        else:
            redacted[key] = value
    return redacted


def log_admin_action(
    *,
    actor: dict,
    action: str,
    target_type: str,
    target_id: str,
    before: Any,
    after: Any,
    request: Optional[Request] = None,
) -> None:
    """Insert an admin_audit_log row.

    Failures are logged but never raised — the caller's mutation has
    already succeeded by the time we get here, so a missed audit row
    should not surface as an HTTP error. Operators monitor via the
    logger.
    """
    try:
        supabase.table("admin_audit_log").insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "before": redact_for_audit(target_id, before),
                "after": redact_for_audit(target_id, after),
                "request_ip": request.client.host if request and request.client else None,
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to write admin_audit_log entry: action=%s target=%s/%s",
            action,
            target_type,
            target_id,
        )
