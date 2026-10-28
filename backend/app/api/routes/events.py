from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from backend.app.services.event_service import event_bus

router = APIRouter()

@router.get("/events/stream")
async def event_stream():
    """
    Server-Sent Events (SSE) stream delivering real-time transactions,
    rule signals, alerts, and lineage updates.
    """
    return StreamingResponse(
        event_bus.subscribe(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/events/recent")
def get_recent_events(limit: int = 50):
    return event_bus.get_recent_events(limit)
