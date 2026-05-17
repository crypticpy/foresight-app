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


def _redact_recursive(payload: Any, *, force_redact: bool) -> Any:
    """Walk a payload depth-first, masking sensitive values.

    ``force_redact`` propagates from parent context: once we're inside a
    sensitive subtree (either because the ``target_id`` was sensitive or
    we descended through a sensitive key), every scalar leaf becomes
    ``_REDACTED``. Containers (dicts / lists) keep their structure so the
    audit row still tells the operator the shape of what was masked.
    """
    if isinstance(payload, dict):
        out: dict[str, Any] = {}
        for key, value in payload.items():
            key_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(str(key)))
            child_force = force_redact or key_is_sensitive
            out[key] = _redact_recursive(value, force_redact=child_force)
        return out
    if isinstance(payload, list):
        return [_redact_recursive(item, force_redact=force_redact) for item in payload]
    # Scalar leaf. ``None`` stays ``None`` — distinguishes "no override"
    # from "had a value but we hid it".
    if force_redact and payload is not None:
        return _REDACTED
    return payload


def redact_for_audit(target_id: str, payload: Any) -> Any:
    """Mask sensitive values in an audit payload.

    Triggers on either a sensitive-looking ``target_id`` (the whole
    payload is suspect, including scalar payloads and nested structures)
    or sensitive-looking individual field names anywhere in the tree.

    The redactor walks dicts and lists recursively so a payload shaped
    like ``{"config": {"api_key": "..."}}`` cannot leak just because the
    secret is one level down. ``None`` is preserved so the audit log can
    still distinguish "no value" from "redacted value".
    """
    target_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(target_id or ""))
    return _redact_recursive(payload, force_redact=target_is_sensitive)


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
