from fastapi import APIRouter, Depends, Body
from typing import Optional, List
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.schemas.schemas import EvaluationRunRequest, EvaluationRunRead
from backend.app.services.evaluation_service import EvaluationService
from backend.app.models.models import EvaluationRun
from backend.app.core.errors import ResourceNotFoundError

router = APIRouter()

@router.post("/evaluations/run")
def run_evaluation(request: Optional[EvaluationRunRequest] = Body(default=None), db: Session = Depends(get_db)):
    sc_ids = request.scenario_ids if request else None
    seeds = request.seeds if request else None
    result = EvaluationService.run_benchmark(db, scenario_ids=sc_ids, seeds=seeds)
    return result

@router.get("/evaluations/{id}")
def get_evaluation(id: str, db: Session = Depends(get_db)):
    run = db.query(EvaluationRun).filter(EvaluationRun.id == id).first()
    if not run:
        raise ResourceNotFoundError(f"Evaluation run {id} not found.")
    return {
        "id": run.id,
        "scenario_id": run.scenario_id,
        "detector_version": run.detector_version,
        "created_at": run.created_at,
        "metrics": run.metrics_json
    }
