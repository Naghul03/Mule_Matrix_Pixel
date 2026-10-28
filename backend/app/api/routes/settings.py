from fastapi import APIRouter
from backend.app.core.config import settings
from backend.app.schemas.schemas import SettingsUpdate

router = APIRouter()

@router.get("/settings")
def get_settings():
    return {
        "detector_version": settings.DETECTOR_VERSION,
        "pass_through_ratio_threshold": settings.PASS_THROUGH_RATIO_THRESHOLD,
        "pass_through_window_minutes": settings.PASS_THROUGH_WINDOW_MINUTES,
        "velocity_burst_count": settings.VELOCITY_BURST_COUNT,
        "velocity_burst_window_minutes": settings.VELOCITY_BURST_WINDOW_MINUTES,
        "fan_in_min_counterparties": settings.FAN_IN_MIN_COUNTERPARTIES,
        "fan_out_min_counterparties": settings.FAN_OUT_MIN_COUNTERPARTIES,
        "retention_min_pct": settings.RETENTION_MIN_PCT,
        "retention_max_pct": settings.RETENTION_MAX_PCT,
        "risk_alert_threshold": settings.RISK_ALERT_THRESHOLD,
        "lookback_hours": settings.LOOKBACK_HOURS,
        "lookahead_hours": settings.LOOKAHEAD_HOURS,
        "max_hops": settings.MAX_HOPS,
        "max_nodes": settings.MAX_NODES
    }

@router.put("/settings")
def update_settings(payload: SettingsUpdate):
    for key, val in payload.dict(exclude_unset=True).items():
        attr = key.upper()
        if hasattr(settings, attr) and val is not None:
            setattr(settings, attr, val)
    return get_settings()
