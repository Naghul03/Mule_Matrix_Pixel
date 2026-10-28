from fastapi import APIRouter, Depends, Query, Response, status
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.db.session import get_db
from backend.app.models.models import Investigation, Account, Bank
from backend.app.schemas.schemas import InvestigationCreate, InvestigationRead, InvestigationDetailRead
from backend.app.services.lineage_service import LineageService
from backend.app.services.export_service import ExportService
from backend.app.core.errors import ResourceNotFoundError

router = APIRouter()

@router.post("/investigations", response_model=InvestigationDetailRead, status_code=status.HTTP_201_CREATED)
def create_investigation(payload: InvestigationCreate, db: Session = Depends(get_db)):
    inv = LineageService.create_investigation(
        db=db,
        root_account_id=payload.root_account_id,
        alert_id=payload.alert_id,
        trigger_transaction_id=payload.trigger_transaction_id,
        lookback_hours=payload.lookback_hours or 72,
        lookahead_hours=payload.lookahead_hours or 72,
        max_hops=payload.max_hops or 12,
        max_nodes=payload.max_nodes or 150
    )
    detail = LineageService.get_investigation_detail(db, inv.id)
    return detail

@router.post("/investigations/{id}/trace", response_model=InvestigationDetailRead)
def retrace_investigation(
    id: str,
    lookback_hours: Optional[int] = None,
    lookahead_hours: Optional[int] = None,
    max_hops: Optional[int] = None,
    max_nodes: Optional[int] = None,
    db: Session = Depends(get_db)
):
    LineageService.run_trace(
        db=db,
        investigation_id=id,
        lookback_hours=lookback_hours,
        lookahead_hours=lookahead_hours,
        max_hops=max_hops,
        max_nodes=max_nodes
    )
    return LineageService.get_investigation_detail(db, id)

@router.get("/investigations", response_model=List[InvestigationRead])
def list_investigations(
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    invs = db.query(Investigation).order_by(desc(Investigation.started_at)).offset(offset).limit(limit).all()
    results = []
    for inv in invs:
        root_acc = db.query(Account).filter(Account.id == inv.root_account_id).first()
        root_bank = db.query(Bank).filter(Bank.id == root_acc.bank_id).first() if root_acc else None
        results.append(InvestigationRead(
            id=inv.id,
            alert_id=inv.alert_id,
            root_account_id=inv.root_account_id,
            root_account_ref=root_acc.account_ref if root_acc else "UNKNOWN",
            root_bank_code=root_bank.bank_code if root_bank else "UNK",
            started_at=inv.started_at,
            completed_at=inv.completed_at,
            status=inv.status,
            stop_reason=inv.stop_reason,
            config_json=inv.config_json,
            summary_metrics_json=inv.summary_metrics_json
        ))
    return results

@router.get("/investigations/{id}", response_model=InvestigationDetailRead)
def get_investigation(id: str, db: Session = Depends(get_db)):
    return LineageService.get_investigation_detail(db, id)

@router.get("/investigations/{id}/export")
def export_investigation(id: str, format: str = Query("html"), db: Session = Depends(get_db)):
    detail = LineageService.get_investigation_detail(db, id)
    if format.lower() == "json":
        data = ExportService.generate_json_export(detail)
        return data
    else:
        html_content = ExportService.generate_html_export(detail)
        return Response(content=html_content, media_type="text/html")
