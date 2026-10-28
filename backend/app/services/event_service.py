import asyncio
import json
from typing import AsyncGenerator, Dict, Any, List
from datetime import datetime

class EventBus:
    def __init__(self):
        self._subscribers: List[asyncio.Queue] = []
        self._history: List[Dict[str, Any]] = []
        self._max_history = 500

    async def subscribe(self) -> AsyncGenerator[str, None]:
        queue = asyncio.Queue()
        self._subscribers.append(queue)
        try:
            # First send recent history so client gets immediate state
            for evt in self._history[-30:]:
                yield f"data: {json.dumps(evt)}\n\n"
            
            while True:
                data = await queue.get()
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in self._subscribers:
                self._subscribers.remove(queue)

    def publish_nowait(self, event_type: str, payload: Dict[str, Any]):
        event = {
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": payload
        }
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history.pop(0)
            
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except Exception:
                pass

    def get_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self._history[-limit:]

event_bus = EventBus()
