from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
import uuid
from datetime import datetime

from backend.app.models.models import Account, Transaction, DetectionAlert, AlertEvidence
from backend.app.detection.rules import RuleSignal
from backend.app.detection.versions import get_detector_rules
from backend.app.core.config import settings
from backend.app.services.event_service import event_bus

class DetectionEngine:
    @staticmethod
    def evaluate_account(
        db: Session,
        account: Account,
        trigger_tx: Optional[Transaction] = None,
        detector_version: Optional[str] = None,
        config_override: Optional[Dict[str, Any]] = None
    ) -> Optional[DetectionAlert]:
        """
        Evaluates an account against rules. If composite score crosses threshold,
        generates an auditable DetectionAlert with AlertEvidence.
        """
        version = detector_version or settings.DETECTOR_VERSION
        rules = get_detector_rules(version)
        
        cfg = {
            "pass_through_ratio_threshold": settings.PASS_THROUGH_RATIO_THRESHOLD,
            "pass_through_window_minutes": settings.PASS_THROUGH_WINDOW_MINUTES,
            "velocity_burst_count": settings.VELOCITY_BURST_COUNT,
            "velocity_burst_window_minutes": settings.VELOCITY_BURST_WINDOW_MINUTES,
            "fan_in_min_counterparties": settings.FAN_IN_MIN_COUNTERPARTIES,
            "fan_out_min_counterparties": settings.FAN_OUT_MIN_COUNTERPARTIES,
            "retention_min_pct": settings.RETENTION_MIN_PCT,
            "retention_max_pct": settings.RETENTION_MAX_PCT,
            "risk_alert_threshold": settings.RISK_ALERT_THRESHOLD,
        }
        if config_override:
            cfg.update(config_override)

        # Retrieve relevant transactions for account (last 100)
        recent_txs = db.query(Transaction).filter(
            or_(
                Transaction.source_account_id == account.id,
                Transaction.destination_account_id == account.id
            )
        ).order_by(desc(Transaction.initiated_at)).limit(100).all()

        signals: List[RuleSignal] = []
        for rule in rules:
            sig = rule.evaluate(account, recent_txs, cfg)
            if sig:
                signals.append(sig)

        if not signals:
            return None

        # Compute bounded composite risk score
        signals.sort(key=lambda s: s.score_contribution, reverse=True)
        raw_score = sum(s.score_contribution * (0.85 ** i) for i, s in enumerate(signals))
        risk_score = round(min(100.0, raw_score), 1)

        # Determine severity
        if risk_score >= 85:
            severity = "CRITICAL"
        elif risk_score >= 65:
            severity = "HIGH"
        elif risk_score >= 45:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        threshold = cfg.get("risk_alert_threshold", settings.RISK_ALERT_THRESHOLD)
        if risk_score < threshold:
            return None

        # Update account risk state
        account.risk_state = "SUSPECTED_MULE"

        # Check if an open alert already exists for this account to avoid duplicate alerts
        existing_alert = db.query(DetectionAlert).filter(
            DetectionAlert.account_id == account.id,
            DetectionAlert.status == "OPEN"
        ).first()

        if existing_alert:
            if risk_score > existing_alert.risk_score:
                existing_alert.risk_score = risk_score
                existing_alert.severity = severity
            if trigger_tx:
                existing_alert.trigger_transaction_id = trigger_tx.id

            # Refresh evidence rows
            db.query(AlertEvidence).filter(AlertEvidence.alert_id == existing_alert.id).delete()
            for sig in signals:
                evidence = AlertEvidence(
                    id=str(uuid.uuid4()),
                    alert_id=existing_alert.id,
                    rule_code=sig.rule_code,
                    observed_value=sig.observed_value,
                    threshold=sig.threshold,
                    explanation=sig.explanation,
                    related_transaction_ids=sig.related_transaction_ids
                )
                db.add(evidence)

            db.commit()
            db.refresh(existing_alert)
            return existing_alert

        # Create new DetectionAlert
        alert_id = str(uuid.uuid4())
        alert = DetectionAlert(
            id=alert_id,
            account_id=account.id,
            trigger_transaction_id=trigger_tx.id if trigger_tx else (signals[0].related_transaction_ids[0] if signals[0].related_transaction_ids else None),
            risk_score=risk_score,
            severity=severity,
            status="OPEN",
            detector_version=version,
            created_at=datetime.utcnow()
        )
        db.add(alert)

        # Add explicit evidence rows
        for sig in signals:
            evidence = AlertEvidence(
                id=str(uuid.uuid4()),
                alert_id=alert_id,
                rule_code=sig.rule_code,
                observed_value=sig.observed_value,
                threshold=sig.threshold,
                explanation=sig.explanation,
                related_transaction_ids=sig.related_transaction_ids
            )
            db.add(evidence)

        db.commit()
        db.refresh(alert)

        # Publish SSE alert event
        event_bus.publish_nowait("ALERT_CREATED", {
            "alert_id": alert.id,
            "account_id": account.id,
            "account_ref": account.account_ref,
            "bank_code": account.bank.bank_code if account.bank else "UNKNOWN",
            "risk_score": alert.risk_score,
            "severity": alert.severity,
            "rules_triggered": [s.rule_code for s in signals],
            "evidence_count": len(signals)
        })

        return alert
