import pytest
from datetime import datetime, timedelta
from backend.app.models.models import Account, Transaction, DetectionAlert, AlertEvidence
from backend.app.schemas.schemas import TransactionCreate
from backend.app.services.ledger_service import LedgerService
from backend.app.detection.scoring import DetectionEngine
from backend.app.simulation.scenarios import ScenarioEngine

def test_pass_through_velocity_rule(db_session):
    accs = db_session.query(Account).limit(3).all()
    src, mule, dst = accs[0], accs[1], accs[2]
    now = datetime.utcnow()

    # Inbound ₹1,00,000
    LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=src.id,
        destination_account_id=mule.id,
        amount_minor=10000000,
        rail="IMPS"
    ), posted_at=now)

    # Outbound ₹95,000 within 15 minutes (95% pass-through)
    LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=mule.id,
        destination_account_id=dst.id,
        amount_minor=9500000,
        rail="UPI"
    ), posted_at=now + timedelta(minutes=15))

    alert = DetectionEngine.evaluate_account(db_session, mule)
    assert alert is not None
    assert alert.risk_score >= 40.0
    
    # Must have recorded evidence with rule code and explanation
    assert len(alert.evidence) >= 1
    ev = alert.evidence[0]
    assert ev.rule_code in ["PASS_THROUGH_VELOCITY", "SMALL_RETENTION"]
    assert "forwarded" in ev.observed_value.lower() or "retained" in ev.observed_value.lower()
    assert len(ev.explanation) > 10

def test_small_retention_mule_commission(db_session):
    accs = db_session.query(Account).limit(3).all()
    src, mule, dst = accs[0], accs[1], accs[2]
    now = datetime.utcnow()

    # Inbound ₹2,00,000
    LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=src.id,
        destination_account_id=mule.id,
        amount_minor=20000000,
        rail="IMPS"
    ), posted_at=now)

    # Outbound ₹1,90,000 (retaining exactly 5% commission)
    LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=mule.id,
        destination_account_id=dst.id,
        amount_minor=19000000,
        rail="UPI"
    ), posted_at=now + timedelta(minutes=20))

    alert = DetectionEngine.evaluate_account(db_session, mule)
    assert alert is not None
    rule_codes = [e.rule_code for e in alert.evidence]
    assert "SMALL_RETENTION" in rule_codes or "PASS_THROUGH_VELOCITY" in rule_codes

def test_legitimate_payroll_lookalike_not_flagged(db_session):
    """
    Guardrail: Legitimate corporate payroll should NOT trigger false positive mule alert.
    """
    ScenarioEngine.run_scenario(db_session, "scenario_legit_payroll", custom_seed=999)
    # Get employer account
    employer = db_session.query(Account).filter(Account.account_type == "CORPORATE").first()
    alert = DetectionEngine.evaluate_account(db_session, employer)
    assert alert is None # Not flagged!

def test_legitimate_merchant_aggregator_not_flagged(db_session):
    """
    Guardrail: High-volume legitimate merchant should NOT be flagged by fan-in rules.
    """
    ScenarioEngine.run_scenario(db_session, "scenario_legit_merchant", custom_seed=888)
    merchant = db_session.query(Account).filter(Account.account_type == "MERCHANT").first()
    alert = DetectionEngine.evaluate_account(db_session, merchant)
    assert alert is None # Not flagged!
