from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.models.models import DetectionAlert, AlertEvidence, Account, Transaction
from backend.app.detection.scoring import DetectionEngine
from backend.app.core.errors import ResourceNotFoundError

class DetectionService:
    @staticmethod
    def process_transaction_detection(db: Session, tx: Transaction) -> List[DetectionAlert]:
        """
        Triggered when a transfer is posted: evaluates source and destination accounts.
        """
        alerts = []
        # Evaluate destination account (did it receive and then forward?)
        dst_acc = db.query(Account).filter(Account.id == tx.destination_account_id).first()
        if dst_acc:
            alert = DetectionEngine.evaluate_account(db, dst_acc, trigger_tx=tx)
            if alert:
                alerts.append(alert)

        # Evaluate source account (is it burst forwarding?)
        src_acc = db.query(Account).filter(Account.id == tx.source_account_id).first()
        if src_acc:
            alert = DetectionEngine.evaluate_account(db, src_acc, trigger_tx=tx)
            if alert:
                alerts.append(alert)

        return alerts

    @staticmethod
    def list_alerts(
        db: Session,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[DetectionAlert]:
        query = db.query(DetectionAlert)
        if status:
            query = query.filter(DetectionAlert.status == status)
        if severity:
            query = query.filter(DetectionAlert.severity == severity)
        return query.order_by(desc(DetectionAlert.created_at)).offset(offset).limit(limit).all()

    @staticmethod
    def get_alert_detail(db: Session, alert_id: str) -> DetectionAlert:
        alert = db.query(DetectionAlert).filter(DetectionAlert.id == alert_id).first()
        if not alert:
            raise ResourceNotFoundError(f"Alert {alert_id} not found.")
        return alert

    @staticmethod
    def update_alert_status(db: Session, alert_id: str, new_status: str, rationale: Optional[str] = None) -> DetectionAlert:
        alert = db.query(DetectionAlert).filter(DetectionAlert.id == alert_id).first()
        if not alert:
            raise ResourceNotFoundError(f"Alert {alert_id} not found.")
        alert.status = new_status
        db.commit()
        db.refresh(alert)
        return alert
