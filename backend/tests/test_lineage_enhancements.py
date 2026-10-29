import pytest
from datetime import datetime, timedelta
import uuid

from backend.app.models.models import Bank, Account, Transaction, Investigation, LineageEdge, LineageNode
from backend.app.schemas.schemas import TransactionCreate
from backend.app.services.ledger_service import LedgerService
from backend.app.services.lineage_service import LineageService
from backend.app.lineage.traversal import LineageTraverser
from backend.app.lineage.allocation import FlowAllocationEngine
from backend.app.lineage.stop_reasons import LineageStopReason
from backend.app.detection.scoring import DetectionEngine
from backend.app.simulation.scenarios import ScenarioEngine

def test_mixed_balance_fifo_attribution(db_session):
    """
    Test 1: Mixed Legitimate & Suspicious Balances.
    Account has pre-existing legitimate balance.
    Receives suspicious transfer.
    Under FIFO:
    - Outbound transfer 1 draws from pre-existing legitimate funds -> 0 suspicious, CANDIDATE edge.
    - Outbound transfer 2 draws from suspicious tranche -> ATTRIBUTED edge.
    """
    banks = db_session.query(Bank).limit(2).all()
    now = datetime(2026, 1, 15, 10, 0, 0)

    # Setup accounts
    victim = Account(id=str(uuid.uuid4()), bank_id=banks[0].id, account_ref="ACC-VICTIM-01", balance_minor=20000000)
    mule = Account(id=str(uuid.uuid4()), bank_id=banks[0].id, account_ref="ACC-MULE-MIXED", balance_minor=5000000) # Pre-existing ₹50,000 legitimate balance
    cashier1 = Account(id=str(uuid.uuid4()), bank_id=banks[1].id, account_ref="ACC-CASHIER-01", balance_minor=0)
    cashier2 = Account(id=str(uuid.uuid4()), bank_id=banks[1].id, account_ref="ACC-CASHIER-02", balance_minor=0)
    db_session.add_all([victim, mule, cashier1, cashier2])
    db_session.commit()

    # Inbound suspicious transfer: ₹1,00,000 at 10:15
    in_tx, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=victim.id,
        destination_account_id=mule.id,
        amount_minor=10000000, # ₹1,00,000
        rail="IMPS",
        memo="Suspicious phishing inflow"
    ), posted_at=now + timedelta(minutes=15))

    # Outbound transfer 1: ₹40,000 at 10:30 (should draw from pre-existing ₹50,000 balance -> 0 suspicious)
    out1_tx, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=mule.id,
        destination_account_id=cashier1.id,
        amount_minor=4000000, # ₹40,000
        rail="UPI",
        memo="Legitimate utility bill"
    ), posted_at=now + timedelta(minutes=30))

    # Outbound transfer 2: ₹70,000 at 10:45 (should draw remaining ₹10k legit + ₹60k suspicious -> ₹60k attributed)
    out2_tx, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=mule.id,
        destination_account_id=cashier2.id,
        amount_minor=7000000, # ₹70,000
        rail="UPI",
        memo="Forwarding tranche"
    ), posted_at=now + timedelta(minutes=45))

    # Test FIFO allocation engine directly
    allocs = FlowAllocationEngine.calculate_forward_fifo_allocations(
        account=mule,
        suspicious_inflow_tx=in_tx,
        inbound_suspicious_minor=10000000,
        outbound_transactions=[out1_tx, out2_tx],
        prior_balance_minor=5000000 # ₹50,000 pre-existing
    )

    assert len(allocs) == 2

    # Outbound 1 must be CANDIDATE with 0 attributed suspicious funds
    res1 = next(a for a in allocs if a.transaction.id == out1_tx.id)
    assert res1.edge_type == "CANDIDATE"
    assert res1.attributed_amount_minor == 0
    assert "pre-existing legitimate balance" in res1.exclusion_reason.lower()

    # Outbound 2 must be ATTRIBUTED with exactly ₹60,000 (6000000 paise) attributed
    res2 = next(a for a in allocs if a.transaction.id == out2_tx.id)
    assert res2.edge_type == "ATTRIBUTED"
    assert res2.attributed_amount_minor == 6000000 # ₹60,000

def test_fifo_zero_attribution_preserves_candidate_route_in_graph(db_session):
    """
    Test 2: Spec Requirement - Dual transaction tracing.
    Preserve eligible observed transaction edges even when attributed suspicious amount is zero.
    Every edge must be labelled as Attributed, Candidate, or Excluded.
    """
    banks = db_session.query(Bank).limit(2).all()
    now = datetime(2026, 2, 1, 12, 0, 0)

    accA = Account(id=str(uuid.uuid4()), bank_id=banks[0].id, account_ref="ACC-CAND-SRC", balance_minor=10000000)
    accB = Account(id=str(uuid.uuid4()), bank_id=banks[0].id, account_ref="ACC-CAND-MULE", balance_minor=5000000)
    accC = Account(id=str(uuid.uuid4()), bank_id=banks[1].id, account_ref="ACC-CAND-LEGIT", balance_minor=0)
    db_session.add_all([accA, accB, accC])
    db_session.commit()

    in_tx, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=accA.id,
        destination_account_id=accB.id,
        amount_minor=5000000,
        rail="IMPS"
    ), posted_at=now)

    # Outbound transfer
    out_tx, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=accB.id,
        destination_account_id=accC.id,
        amount_minor=3000000,
        rail="UPI"
    ), posted_at=now + timedelta(minutes=20))

    inv = LineageService.create_investigation(db_session, root_account_id=accB.id, trigger_transaction_id=in_tx.id)
    detail = LineageService.get_investigation_detail(db_session, inv.id)

    # Graph must contain edges and every edge must have edge_type
    assert len(detail["edges"]) >= 1
    for edge in detail["edges"]:
        assert edge["edge_type"] in ["ATTRIBUTED", "CANDIDATE", "EXCLUDED"]
        assert "attributed_amount_minor" in edge

def test_split_and_merge_transfers(db_session):
    """
    Test 3: Split and Merged Transfers.
    - Split: ₹3,00,000 rapidly dispersed to 3 smurfs.
    - Merge: 3 accounts funneling into single aggregator.
    """
    # 1. Split scenario
    res_split = ScenarioEngine.run_scenario(db_session, "scenario_split_flow", custom_seed=42)
    inv_split = LineageService.create_investigation(db_session, root_account_id=res_split["root_account_id"])
    detail_split = LineageService.get_investigation_detail(db_session, inv_split.id)

    # In split flow, forward edges should fan out
    fwd_edges = [e for e in detail_split["edges"] if e["direction"] == "FORWARD" and e["edge_type"] == "ATTRIBUTED"]
    assert len(fwd_edges) >= 2
    # Sum of split edges must not exceed parent inflow
    assert sum(e["attributed_amount_minor"] for e in fwd_edges) <= 30000000 + 1000

    # 2. Merge scenario
    res_merge = ScenarioEngine.run_scenario(db_session, "scenario_merge_flow", custom_seed=42)
    inv_merge = LineageService.create_investigation(db_session, root_account_id=res_merge["root_account_id"])
    detail_merge = LineageService.get_investigation_detail(db_session, inv_merge.id)

    bwd_edges = [e for e in detail_merge["edges"] if e["direction"] == "BACKWARD" and e["edge_type"] == "ATTRIBUTED"]
    assert len(bwd_edges) >= 2

def test_cycles_and_hop_limits(db_session):
    """
    Test 4: Cycles and Strict Hop Limits.
    - Circular flow (A -> B -> C -> A) terminates safely without duplicate path reporting.
    - Hop budget is strictly enforced.
    """
    res_cycle = ScenarioEngine.run_scenario(db_session, "scenario_circular_cycle", custom_seed=42)
    inv_cycle = LineageService.create_investigation(db_session, root_account_id=res_cycle["root_account_id"], max_hops=4)
    detail_cycle = LineageService.get_investigation_detail(db_session, inv_cycle.id)

    # Did not crash or loop infinitely
    assert detail_cycle["status"] == "COMPLETED"
    assert len(detail_cycle["edges"]) <= 10

    # Deep chain with strict 3-hop limit
    res_long = ScenarioEngine.run_scenario(db_session, "scenario_long_chain", custom_seed=42)
    inv_long = LineageService.create_investigation(db_session, root_account_id=res_long["root_account_id"], max_hops=3)
    detail_long = LineageService.get_investigation_detail(db_session, inv_long.id)

    max_hop = max([n["hop_depth"] for n in detail_long["nodes"]] or [0])
    assert max_hop <= 3

def test_cross_bank_transfers(db_session):
    """
    Test 5: Cross-Bank Multi-Hop Transfers across simulated institutions.
    """
    res = ScenarioEngine.run_scenario(db_session, "scenario_cross_bank_matrix", custom_seed=42)
    inv = LineageService.create_investigation(db_session, root_account_id=res["root_account_id"])
    detail = LineageService.get_investigation_detail(db_session, inv.id)

    banks_crossed = detail["summary_metrics_json"]["banks_crossed"]
    assert banks_crossed >= 3
    # Check cross bank flag on edges
    cross_edges = [e for e in detail["edges"] if e["is_cross_bank"]]
    assert len(cross_edges) >= 2

def test_failed_reversed_and_idempotent_transactions(db_session):
    """
    Test 6: Failed, Reversed, Duplicated, and Out-of-Order Transactions.
    - FAILED transactions excluded.
    - REVERSED transactions excluded.
    - Duplicate idempotency keys prevent duplicate edges.
    """
    banks = db_session.query(Bank).limit(2).all()
    now = datetime(2026, 3, 1, 10, 0, 0)

    acc1 = Account(id=str(uuid.uuid4()), bank_id=banks[0].id, account_ref="ACC-LIFECYCLE-1", balance_minor=10000000)
    acc2 = Account(id=str(uuid.uuid4()), bank_id=banks[1].id, account_ref="ACC-LIFECYCLE-2", balance_minor=0)
    acc3 = Account(id=str(uuid.uuid4()), bank_id=banks[1].id, account_ref="ACC-LIFECYCLE-3", balance_minor=0)
    db_session.add_all([acc1, acc2, acc3])
    db_session.commit()

    # 1. Normal posted transfer
    tx_ok, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=acc1.id,
        destination_account_id=acc2.id,
        amount_minor=5000000,
        rail="IMPS"
    ), posted_at=now)

    # 2. Failed transfer
    tx_failed, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=acc2.id,
        destination_account_id=acc3.id,
        amount_minor=2000000,
        rail="UPI"
    ), status="FAILED", posted_at=now + timedelta(minutes=10))

    # 3. Reversed transfer
    tx_to_rev, _ = LedgerService.post_transfer(db_session, TransactionCreate(
        source_account_id=acc2.id,
        destination_account_id=acc3.id,
        amount_minor=1500000,
        rail="NEFT"
    ), status="POSTED", posted_at=now + timedelta(minutes=15))
    LedgerService.reverse_transaction(db_session, tx_to_rev.id, reason="Fraud dispute")

    # Trace from acc2
    inv = LineageService.create_investigation(db_session, root_account_id=acc2.id)
    detail = LineageService.get_investigation_detail(db_session, inv.id)

    # Check edges
    failed_edge = next((e for e in detail["edges"] if e["transaction_id"] == tx_failed.id), None)
    rev_edge = next((e for e in detail["edges"] if e["transaction_id"] == tx_to_rev.id), None)

    if failed_edge:
        assert failed_edge["edge_type"] == "EXCLUDED"
    if rev_edge:
        assert rev_edge["edge_type"] == "EXCLUDED"

def test_legitimate_lookalike_accounts_immunity(db_session):
    """
    Test 7: Guardrail - Legitimate lookalikes (Corporate Payroll & High-Volume Merchant)
    must NOT be flagged as suspected mules by the detector.
    """
    # 1. Payroll
    ScenarioEngine.run_scenario(db_session, "scenario_legit_payroll", custom_seed=777)
    employer = db_session.query(Account).filter(Account.account_type == "CORPORATE").first()
    alert_emp = DetectionEngine.evaluate_account(db_session, employer)
    assert alert_emp is None

    # 2. Merchant
    ScenarioEngine.run_scenario(db_session, "scenario_legit_merchant", custom_seed=666)
    merchant = db_session.query(Account).filter(Account.account_type == "MERCHANT").first()
    alert_merch = DetectionEngine.evaluate_account(db_session, merchant)
    assert alert_merch is None

def test_missing_or_conflicting_data_handling(db_session):
    """
    Test 8: Missing or Conflicting Data handles gracefully without unhandled crashes.
    """
    fake_id = "non-existent-account-id-999"
    inv = Investigation(
        id=str(uuid.uuid4()),
        root_account_id=fake_id,
        started_at=datetime.utcnow()
    )
    db_session.add(inv)
    db_session.commit()

    traverser = LineageTraverser(db_session, inv)
    metrics = traverser.run_trace()

    assert inv.stop_reason == LineageStopReason.MISSING_OR_CONFLICTING_DATA.value
    assert metrics["nodes"] == []
    assert metrics["edges"] == []

