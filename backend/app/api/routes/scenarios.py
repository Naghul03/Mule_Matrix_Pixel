from fastapi import APIRouter, Depends, Body
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.schemas.schemas import ScenarioRead, ScenarioRunRequest
from backend.app.services.scenario_service import ScenarioService

router = APIRouter()

@router.get("/scenarios", response_model=List[ScenarioRead])
def list_scenarios(db: Session = Depends(get_db)):
    return ScenarioService.get_all_scenarios(db)

@router.post("/scenarios/{id}/run")
def run_scenario(id: str, request: Optional[ScenarioRunRequest] = Body(default=None), db: Session = Depends(get_db)):
    seed = request.seed if request else None
    result = ScenarioService.run_scenario(db, id, custom_seed=seed)
    return result
