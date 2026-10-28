from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.db.session import get_db
from backend.app.models.models import DetectionAlert, AlertEvidence, Account, Bank, Transaction
from backend.app.schemas.schemas import DetectionAlertRead, DetectionAlertDetailRead, AlertStatusUpdate, TransactionRead
from backend.app.services.detection_service import DetectionService
from backend.app.api.routes.transactions import _enrich_transaction

router = APIRouter()

def _enrich_alert(db: Session, alert: DetectionAlert) -> DetectionAlertRead:
    acc = db.query(Account).filter(Account.id == alert.account_id).first()
    bank = db.query(Bank).filter(Bank.id == acc.bank_id).first() if acc else None

    rules = [e.rule_code for e in alert.evidence]

    return DetectionAlertRead(
        id=alert.id,
        account_id=alert.account_id,
        account_ref=acc.account_ref if acc else "UNKNOWN",
        bank_code=bank.bank_code if bank else "UNK",
        trigger_transaction_id=alert.trigger_transaction_id,
        risk_score=alert.risk_score,
        severity=alert.severity,
        status=alert.status,
        detector_version=alert.detector_version,
        created_at=alert.created_at,
        rules_triggered=rules,
        evidence_count=len(alert.evidence)
    )

@router.get("/alerts", response_model=List[DetectionAlertRead])
def list_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    alerts = DetectionService.list_alerts(db, status=status, severity=severity, limit=limit, offset=offset)
    return [_enrich_alert(db, a) for a in alerts]

@router.get("/alerts/{id}", response_model=DetectionAlertDetailRead)
def get_alert_detail(id: str, db: Session = Depends(get_db)):
    alert = DetectionService.get_alert_detail(db, id)
    base = _enrich_alert(db, alert)

    evidence_list = [
        {
            "id": e.id,
            "rule_code": e.rule_code,
            "observed_value": e.observed_value,
            "threshold": e.threshold,
            "explanation": e.explanation,
            "related_transaction_ids": e.related_transaction_ids or []
        }
        for e in alert.evidence
    ]

    # Collect related transactions
    related_ids = set()
    if alert.trigger_transaction_id:
        related_ids.add(alert.trigger_transaction_id)
    for e in alert.evidence:
        if e.related_transaction_ids:
            related_ids.update(e.related_transaction_ids)

    txs = db.query(Transaction).filter(Transaction.id.in_(list(related_ids))).all() if related_ids else []
    enriched_txs = [_enrich_transaction(db, t) for t in txs]

    return DetectionAlertDetailRead(
        **base.dict(),
        evidence=evidence_list,
        related_transactions=enriched_txs
    )

@router.patch("/alerts/{id}", response_model=DetectionAlertRead)
def update_alert(id: str, update_data: AlertStatusUpdate, db: Session = Depends(get_db)):
    alert = DetectionService.update_alert_status(db, id, update_data.status, update_data.rationale)
    return _enrich_alert(db, alert)
