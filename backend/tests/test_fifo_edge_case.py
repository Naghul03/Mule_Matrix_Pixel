"""
Deterministic verification of Section 5.5 Required Edge Case:
Account A starts with ₹10,000 legitimate balance and receives ₹50,000 suspected funds.
Under FIFO:
1. Transfer 1: A sends ₹8,000 to B.
   - Consumes legitimate lot (₹10,000 - ₹8,000 = ₹2,000 remaining legitimate).
   - Suspected allocation: ₹0.
   - Graph edge must remain visible as CANDIDATE.
2. Transfer 2: A sends ₹20,000 to D.
   - Consumes remaining ₹2,000 legitimate balance.
   - Consumes ₹18,000 of suspected lot.
   - Suspected allocation: ₹18,000 (ATTRIBUTED).
   - Remaining suspected lot: ₹32,000.
Arithmetic, graph edges, and candidate vs attributed separation are verified.
"""

from datetime import datetime, timezone, timedelta
from backend.app.models.models import Transaction, Account
from backend.app.lineage.allocation import FlowAllocationEngine, FifoBalanceLot


def test_section_5_5_fifo_mixed_balance_edge_case():
    t0 = datetime(2026, 10, 29, 10, 0, 0, tzinfo=timezone.utc)

    # Account A: starts with ₹10,000 legitimate balance (1,000,000 minor)
    account_a = Account(id="acc_A", account_ref="10001", bank_id="bank-hdfx")

    # Inflow transaction: receives ₹50,000 suspected funds (5,000,000 minor) at t0 + 5m
    suspicious_inflow = Transaction(
        id="tx_susp_inflow",
        source_account_id="acc_origin",
        destination_account_id="acc_A",
        amount_minor=5_000_000,  # ₹50,000
        currency="INR",
        posted_at=t0 + timedelta(minutes=5),
        status="COMPLETED"
    )

    # Transfer 1: A sends ₹8,000 (800,000 minor) to B at t0 + 15m
    tx1_a_to_b = Transaction(
        id="tx_A_to_B",
        source_account_id="acc_A",
        destination_account_id="acc_B",
        amount_minor=800_000,  # ₹8,000
        currency="INR",
        posted_at=t0 + timedelta(minutes=15),
        status="COMPLETED"
    )

    # Transfer 2: A sends ₹20,000 (2,000,000 minor) to D at t0 + 30m
    tx2_a_to_d = Transaction(
        id="tx_A_to_D",
        source_account_id="acc_A",
        destination_account_id="acc_D",
        amount_minor=2_000_000,  # ₹20,000
        currency="INR",
        posted_at=t0 + timedelta(minutes=30),
        status="COMPLETED"
    )

    # Run FlowAllocationEngine FIFO calculation
    allocations = FlowAllocationEngine.calculate_forward_fifo_allocations(
        account=account_a,
        suspicious_inflow_tx=suspicious_inflow,
        inbound_suspicious_minor=5_000_000,
        outbound_transactions=[tx1_a_to_b, tx2_a_to_d],
        prior_balance_minor=1_000_000  # ₹10,000 pre-existing legitimate balance
    )

    assert len(allocations) == 2, "Both transactions must be present in the graph"

    # --- Transfer 1 (A -> B, ₹8,000) verification ---
    alloc1 = allocations[0]
    assert alloc1.transaction.id == "tx_A_to_B"
    # 1. Suspicious funds attributed MUST be ₹0 (funded by legitimate ₹10k opening balance)
    assert alloc1.attributed_amount_minor == 0, "FIFO suspicious allocation to B must be ₹0"
    # 2. Transaction MUST remain in the graph as a CANDIDATE edge (not discarded)
    assert alloc1.edge_type == "CANDIDATE", "Zero-attribution edge must be preserved as CANDIDATE"
    assert alloc1.allocation_method == "FIFO_ZERO_ATTRIBUTION"
    # 3. Assumptions and notes recorded
    assert "lots_consumed" in alloc1.assumptions
    lots_c1 = alloc1.assumptions["lots_consumed"]
    assert lots_c1[0]["lot_id"] == "LOT-OPENING-LEGIT"
    assert lots_c1[0]["drawn_total"] == 800_000
    assert lots_c1[0]["drawn_suspicious"] == 0

    # --- Transfer 2 (A -> D, ₹20,000) verification ---
    alloc2 = allocations[1]
    assert alloc2.transaction.id == "tx_A_to_D"
    # 1. Edge type MUST be ATTRIBUTED
    assert alloc2.edge_type == "ATTRIBUTED"
    # 2. Under FIFO, remaining legitimate balance was ₹2,000 (200,000 minor).
    #    Therefore, attributed suspicious funds MUST be ₹18,000 (1,800,000 minor), NOT ₹20,000!
    assert alloc2.attributed_amount_minor == 1_800_000, "FIFO must attribute exactly ₹18,000 (not ₹20,000)"
    assert alloc2.allocation_method in ("FIFO_ATTRIBUTION", "FIFO_SPLIT_ATTRIBUTION")
    # 3. Total drawn: 200,000 legitimate + 1,800,000 suspicious = 2,000,000 minor
    lots_c2 = alloc2.assumptions["lots_consumed"]
    assert len(lots_c2) == 2, "Transfer 2 must consume remaining legit lot and suspicious lot"
    assert lots_c2[0]["lot_id"] == "LOT-OPENING-LEGIT"
    assert lots_c2[0]["drawn_total"] == 200_000  # remaining ₹2,000
    assert lots_c2[0]["drawn_suspicious"] == 0
    assert "LOT-SUSPICIOUS" in lots_c2[1]["lot_id"]
    assert lots_c2[1]["drawn_total"] == 1_800_000  # ₹18,000 from suspicious lot
    assert lots_c2[1]["drawn_suspicious"] == 1_800_000

    # 4. Total suspicious funds remaining after both transfers: ₹50,000 - ₹18,000 = ₹32,000 (3,200,000 minor)
    remaining_susp = 5_000_000 - alloc2.attributed_amount_minor
    assert remaining_susp == 3_200_000
