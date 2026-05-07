"""Runtime feature flags shared by collaboration routers."""

import os

from fastapi import HTTPException, status


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def require_feature_enabled(flag_name: str) -> None:
    if not env_flag(flag_name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def collaboration_enabled() -> None:
    require_feature_enabled("FORESIGHT_ENABLE_COLLABORATION")


def guest_accounts_enabled() -> None:
    require_feature_enabled("FORESIGHT_ENABLE_GUEST_ACCOUNTS")


def realtime_enabled() -> None:
    require_feature_enabled("FORESIGHT_ENABLE_REALTIME")


def public_share_enabled() -> None:
    require_feature_enabled("FORESIGHT_ENABLE_PUBLIC_SHARE")
