"""Safety primitives: prompt-injection scanner + usage-anomaly monitor.

Kept separate from ``app.security`` (rate limiting / headers / request
hardening) because that module is a flat file imported by ~every
router. Converting it to a package would churn dozens of imports for
no benefit.

Tables touched:
- ``safety_incidents`` — every detection from this module lands here.
- ``llm_usage_events`` — read-only by ``abuse.py`` for anomaly scoring.
"""

from app.safety.abuse import (
    AbuseFinding,
    detect_user_abuse,
    record_abuse_findings,
)
from app.safety.injection import (
    IncidentMatch,
    InjectionSeverity,
    record_injection_incident,
    scan_text,
)

__all__ = [
    "AbuseFinding",
    "IncidentMatch",
    "InjectionSeverity",
    "detect_user_abuse",
    "record_abuse_findings",
    "record_injection_incident",
    "scan_text",
]
