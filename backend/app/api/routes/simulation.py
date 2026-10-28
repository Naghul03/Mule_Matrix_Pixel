from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.services.scenario_service import ScenarioService
from backend.app.services.event_service import event_bus

router = APIRouter()

@router.post("/simulation/pause")
def pause_simulation():
    event_bus.publish_nowait("SIMULATION_PAUSED", {"message": "Simulation playback paused."})
    return {"status": "PAUSED", "message": "Simulation paused."}

@router.post("/simulation/reset")
def reset_simulation(db: Session = Depends(get_db)):
    result = ScenarioService.reset_simulation(db)
    return result
