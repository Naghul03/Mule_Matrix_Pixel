import pytest
from datetime import datetime, timedelta
import uuid
from backend.app.models.models import Account, Transaction, Investigation, LineageNode, LineageEdge
from backend.app.schemas.schemas import TransactionCreate
from backend.app.services.ledger_service import LedgerService
from backend.app.lineage.traversal import LineageTraverser
from backend.app.lineage.stop_reasons import LineageStopReason
from backend.app.simulation.scenarios import ScenarioEngine

def test_cross_bank_chain_lineage_traversal(db_session):
    res = ScenarioEngine.run_scenario(db_session, "scenario_cross_bank_matrix", custom_seed=42)
    root_acc_id = res["root_account_id"]

    inv = Investigation(
        id=str(uuid.uuid4()),
        root_account_id=root_acc_id,
        started_at=datetime.utcnow()
    )
    db_session.add(inv)
    db_session.commit()

    traverser = LineageTraverser(db_session, inv, lookback_hours=72, lookahead_hours=72)
    metrics = traverser.run_trace()

    assert metrics["accounts_discovered"] >= 4
    assert metrics["banks_crossed"] >= 3
    assert metrics["transactions_traversed"] >= 3
    assert metrics["off_ramps_found"] >= 1
    assert inv.stop_reason == LineageStopReason.OFF_RAMP_REACHED.value

def test_no_off_ramp_lineage_traversal(db_session):
    """
    Spec requirement: If no off-ramp exists, trace until graph ends or boundary reached.
    Must label stop reason appropriately.
    """
    res = ScenarioEngine.run_scenario(db_session, "scenario_no_off_ramp", custom_seed=42)
    root_acc_id = res["root_account_id"]

    inv = Investigation(
        id=str(uuid.uuid4()),
        root_account_id=root_acc_id,
        started_at=datetime.utcnow()
    )
    db_session.add(inv)
    db_session.commit()

    traverser = LineageTraverser(db_session, inv, lookback_hours=72, lookahead_hours=72)
    metrics = traverser.run_trace()

    assert metrics["off_ramps_found"] == 0
    assert inv.stop_reason == LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS.value

def test_cycle_termination_safety(db_session):
    """
    Spec requirement: Circular flows (A -> B -> C -> A) terminate safely without infinite loop.
    """
    res = ScenarioEngine.run_scenario(db_session, "scenario_circular_cycle", custom_seed=42)
    root_acc_id = res["root_account_id"]

    inv = Investigation(
        id=str(uuid.uuid4()),
        root_account_id=root_acc_id,
        started_at=datetime.utcnow()
    )
    db_session.add(inv)
    db_session.commit()

    traverser = LineageTraverser(db_session, inv, max_hops=10)
    metrics = traverser.run_trace()

    # Safely terminated without hanging
    assert metrics["transactions_traversed"] <= 5
    assert inv.status == "COMPLETED"

def test_max_hops_budget_stop(db_session):
    """
    Spec requirement: Strict hop budget enforcement.
    """
    res = ScenarioEngine.run_scenario(db_session, "scenario_long_chain", custom_seed=42)
    root_acc_id = res["root_account_id"]

    inv = Investigation(
        id=str(uuid.uuid4()),
        root_account_id=root_acc_id,
        started_at=datetime.utcnow()
    )
    db_session.add(inv)
    db_session.commit()

    # Limit to 2 hops
    traverser = LineageTraverser(db_session, inv, max_hops=2)
    metrics = traverser.run_trace()

    assert metrics["max_hop_depth"] <= 2
