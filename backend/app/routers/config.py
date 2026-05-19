"""Frontend-consumable runtime feature configuration."""

from fastapi import APIRouter

from app.feature_flags import env_flag

router = APIRouter(prefix="/api/v1", tags=["config"])


@router.get("/config")
async def get_config():
    return {
        "collaboration_enabled": env_flag("FORESIGHT_ENABLE_COLLABORATION", default=True),
        "guest_accounts": env_flag("FORESIGHT_ENABLE_GUEST_ACCOUNTS"),
        "realtime": env_flag("FORESIGHT_ENABLE_REALTIME"),
        "public_share": env_flag("FORESIGHT_ENABLE_PUBLIC_SHARE"),
    }
