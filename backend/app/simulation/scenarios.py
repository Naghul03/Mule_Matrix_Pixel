import uuid
import random
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session

from backend.app.models.models import (
    Scenario, Account, Bank, Transaction, TransactionEvent, GroundTruthLabel,
    LineageEdge, LineageNode, AlertEvidence, DetectionAlert, TransferAllocation, Investigation
)
from backend.app.schemas.schemas import TransactionCreate
from backend.app.services.ledger_service import LedgerService
from backend.app.simulation.generator import seed_synthetic_accounts, seed_banks
from backend.app.simulation.ground_truth import GroundTruthStore

SCENARIO_CATALOGUE = [
    {
        "id": "scenario_cross_bank_matrix",
        "name": "Cross-Bank Split-and-Merge Mule Network (Judge Demo)",
        "scenario_type": "CROSS_BANK_MULE",
        "description": "Showcase scenario: Origin victim sends funds that hop across 5 synthetic banks (HDFX -> ICIX -> SBNX), split across layer-2 mules, and terminate at an ATM off-ramp.",
        "seed": 101
    },
    {
        "id": "scenario_simple_mule_chain",
        "name": "Simple 3-Hop Mule Chain",
        "scenario_type": "MULE_CHAIN",
        "description": "Classic linear mule pipeline: Origin -> Layer 1 Mule -> Layer 2 Mule -> Cash Off-Ramp.",
        "seed": 102
    },
    {
        "id": "scenario_commission_retention",
        "name": "Commission Retention Flow",
        "scenario_type": "RETENTION",
        "description": "Mule account receives ₹1,50,000, skims a 5% commission cut (₹7,500), and forwards the rest.",
        "seed": 103
    },
    {
        "id": "scenario_split_flow",
        "name": "Rapid Split Flow",
        "scenario_type": "SPLIT",
        "description": "Single inbound transfer of ₹3,00,000 rapidly dispersed across 3 downstream smurf accounts.",
        "seed": 104
    },
    {
        "id": "scenario_merge_flow",
        "name": "Funnel Merge Aggregation",
        "scenario_type": "MERGE",
        "description": "Four separate compromised accounts funnel ₹50,000 each into an aggregator mule.",
        "seed": 105
    },
    {
        "id": "scenario_no_off_ramp",
        "name": "Suspicious Network (No Off-Ramp)",
        "scenario_type": "NO_OFF_RAMP",
        "description": "Suspicious pass-through movement where funds remain in synthetic account at the boundary; tests trace stop reason.",
        "seed": 106
    },
    {
        "id": "scenario_multiple_off_ramps",
        "name": "Multi-Branch Dual Off-Ramps",
        "scenario_type": "MULTIPLE_OFF_RAMPS",
        "description": "Branching mule network exiting via both ATM cash withdrawal and external merchant rails.",
        "seed": 107
    },
    {
        "id": "scenario_fan_in_fan_out",
        "name": "High Dispersion Fan-In / Fan-Out",
        "scenario_type": "FAN_IN_FAN_OUT",
        "description": "Account receives from 5 separate senders and immediately fans out to 4 distinct destinations.",
        "seed": 108
    },
    {
        "id": "scenario_circular_cycle",
        "name": "Circular Movement / Loop",
        "scenario_type": "CYCLE",
        "description": "Mule network with a cycle (A -> B -> C -> A) to test traversal termination and cycle deduplication.",
        "seed": 109
    },
    {
        "id": "scenario_long_chain",
        "name": "Deep 8-Hop Linear Chain",
        "scenario_type": "LONG_CHAIN",
        "description": "Multi-hop chained traversal across 8 distinct accounts to test max hop budget controls.",
        "seed": 110
    },
    {
        "id": "scenario_legit_payroll",
        "name": "Legitimate Corporate Payroll (Lookalike)",
        "scenario_type": "LEGITIMATE_LOOKALIKE",
        "description": "Corporate salary disbursement to 10 employees. Should NOT trigger false positive mule alerts.",
        "seed": 111
    },
    {
        "id": "scenario_legit_merchant",
        "name": "Legitimate High-Volume Merchant",
        "scenario_type": "LEGITIMATE_LOOKALIKE",
        "description": "Retail merchant receiving 20 retail payments. Tests high-volume aggregator false-positive immunity.",
        "seed": 112
    },
    {
        "id": "scenario_low_and_slow",
        "name": "Low-and-Slow Trickle",
        "scenario_type": "LOW_AND_SLOW",
        "description": "Funds trickled across weeks in small installments to evade short-window velocity rules.",
        "seed": 113
    },
    {
        "id": "scenario_near_threshold",
        "name": "Near-Threshold Structuring",
        "scenario_type": "NEAR_THRESHOLD",
        "description": "Transfers structured just below the ₹1,00,000 threshold (₹98,500, ₹99,000).",
        "seed": 114
    },
    {
        "id": "scenario_reversal_lifecycle",
        "name": "Transaction Reversal & Failed Flow",
        "scenario_type": "REVERSAL_LIFECYCLE",
        "description": "Tests that pending, failed, and reversed transfers do not falsely contribute to settled funds lineage.",
        "seed": 115
    },
    {
        "id": "scenario_idempotency_test",
        "name": "Duplicate Idempotent Requests",
        "scenario_type": "IDEMPOTENT_TEST",
        "description": "Repeated submissions with the same idempotency key to verify no double-spend or duplicate edges.",
        "seed": 116
    },
    {
        "id": "scenario_out_of_order",
        "name": "Out-of-Order Transaction Ingestion",
        "scenario_type": "OUT_OF_ORDER",
        "description": "Event timestamps arrive non-monotonically, verifying lineage time-ordering resilience.",
        "seed": 117
    },
    {
        "id": "scenario_disconnected_clusters",
        "name": "Disconnected Network Islands",
        "scenario_type": "DISCONNECTED",
        "description": "Two disjoint transaction networks; tests that traversal remains isolated to the connected component.",
        "seed": 118
    },
    {
        "id": "scenario_high_degree_hub",
        "name": "High-Degree Legitimate Hub",
        "scenario_type": "HIGH_DEGREE_HUB",
        "description": "University or utility bill payment hub with 30 incoming payments and settled retainment.",
        "seed": 119
    },
    {
        "id": "scenario_adversarial_evasion",
        "name": "Adversarial Evasion with Jitter",
        "scenario_type": "ADVERSARIAL_EVASION",
        "description": "Sophisticated mule network using random delays, uneven amounts, and multi-rail hops.",
        "seed": 120
    }
]

def register_scenario_catalogue(db: Session):
    for item in SCENARIO_CATALOGUE:
        existing = db.query(Scenario).filter(Scenario.id == item["id"]).first()
        if not existing:
            sc = Scenario(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                scenario_type=item["scenario_type"],
                seed=item["seed"]
            )
            db.add(sc)
    db.commit()

class ScenarioEngine:
    @staticmethod
    def run_scenario(db: Session, scenario_id: str, custom_seed: Optional[int] = None) -> Dict[str, Any]:
        """
        Executes a deterministic scenario.
        Generates transactions in the ledger and records ground-truth labels.
        """
        sc_meta = next((s for s in SCENARIO_CATALOGUE if s["id"] == scenario_id), None)
        if not sc_meta:
            raise ValueError(f"Unknown scenario ID: {scenario_id}")

        seed = custom_seed or sc_meta["seed"]
        rng = random.Random(seed)

        # Ensure base accounts exist
        accounts = seed_synthetic_accounts(db, count=100, seed=seed)
        banks = seed_banks(db)

        # Clear existing labels and scenario transactions for this scenario
        db.query(GroundTruthLabel).filter(GroundTruthLabel.scenario_id == scenario_id).delete()
        existing_txs = db.query(Transaction).filter(Transaction.scenario_id == scenario_id).all()
        if existing_txs:
            tx_ids = [t.id for t in existing_txs]
            db.query(LineageEdge).filter(LineageEdge.transaction_id.in_(tx_ids)).delete(synchronize_session=False)
            alert_ids = [a.id for a in db.query(DetectionAlert.id).filter(DetectionAlert.trigger_transaction_id.in_(tx_ids)).all()]
            if alert_ids:
                inv_ids = [inv.id for inv in db.query(Investigation.id).filter(Investigation.alert_id.in_(alert_ids)).all()]
                if inv_ids:
                    db.query(LineageEdge).filter(LineageEdge.investigation_id.in_(inv_ids)).delete(synchronize_session=False)
                    db.query(LineageNode).filter(LineageNode.investigation_id.in_(inv_ids)).delete(synchronize_session=False)
                    db.query(Investigation).filter(Investigation.id.in_(inv_ids)).delete(synchronize_session=False)

                db.query(AlertEvidence).filter(AlertEvidence.alert_id.in_(alert_ids)).delete(synchronize_session=False)
                db.query(DetectionAlert).filter(DetectionAlert.id.in_(alert_ids)).delete(synchronize_session=False)

            db.query(TransferAllocation).filter(
                (TransferAllocation.source_transaction_id.in_(tx_ids)) | 
                (TransferAllocation.downstream_transaction_id.in_(tx_ids))
            ).delete(synchronize_session=False)
            db.query(TransactionEvent).filter(TransactionEvent.transaction_id.in_(tx_ids)).delete(synchronize_session=False)
            db.query(Transaction).filter(Transaction.id.in_(tx_ids)).delete(synchronize_session=False)
        db.commit()

        base_time = datetime.utcnow() - timedelta(hours=24)

        if scenario_id == "scenario_cross_bank_matrix":
            return ScenarioEngine._run_cross_bank_matrix(db, scenario_id, accounts, banks, base_time, rng)
        elif scenario_id == "scenario_simple_mule_chain":
            return ScenarioEngine._run_simple_chain(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_commission_retention":
            return ScenarioEngine._run_commission_retention(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_split_flow":
            return ScenarioEngine._run_split_flow(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_merge_flow":
            return ScenarioEngine._run_merge_flow(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_no_off_ramp":
            return ScenarioEngine._run_no_off_ramp(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_multiple_off_ramps":
            return ScenarioEngine._run_multiple_off_ramps(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_fan_in_fan_out":
            return ScenarioEngine._run_fan_in_fan_out(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_circular_cycle":
            return ScenarioEngine._run_cycle(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_long_chain":
            return ScenarioEngine._run_long_chain(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_legit_payroll":
            return ScenarioEngine._run_legit_payroll(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_legit_merchant":
            return ScenarioEngine._run_legit_merchant(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_reversal_lifecycle":
            return ScenarioEngine._run_reversal(db, scenario_id, accounts, base_time, rng)
        elif scenario_id == "scenario_idempotency_test":
            return ScenarioEngine._run_idempotency(db, scenario_id, accounts, base_time, rng)
        else:
            return ScenarioEngine._run_generic_scenario(db, scenario_id, accounts, base_time, rng)

    @staticmethod
    def _run_cross_bank_matrix(db: Session, sc_id: str, accounts: List[Account], banks: List[Bank], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        """
        Primary Judge Demo Scenario:
        Origin Victim (HDFX) -> Mule 1 (ICIX) -> Mule 2 (SBNX) -> Split to Mule 3A (AXSX) & Mule 3B (KOTX) -> ATM Off-ramp (PAYX).
        """
        # Select distinct banks for each hop
        bank_map = {b.bank_code: b for b in banks}
        hdfx = bank_map.get("HDFX", banks[0])
        icix = bank_map.get("ICIX", banks[1])
        sbnx = bank_map.get("SBNX", banks[2])
        axsx = bank_map.get("AXSX", banks[3])
        kotx = bank_map.get("KOTX", banks[4])
        payx = bank_map.get("PAYX", banks[7] if len(banks) > 7 else banks[0])

        acc_origin = next(a for a in accounts if a.bank_id == hdfx.id)
        acc_mule1 = next(a for a in accounts if a.bank_id == icix.id and a.id != acc_origin.id)
        acc_mule2 = next(a for a in accounts if a.bank_id == sbnx.id and a.id not in [acc_origin.id, acc_mule1.id])
        acc_mule3a = next(a for a in accounts if a.bank_id == axsx.id and a.id not in [acc_origin.id, acc_mule1.id, acc_mule2.id])
        acc_mule3b = next(a for a in accounts if a.bank_id == kotx.id and a.id not in [acc_origin.id, acc_mule1.id, acc_mule2.id, acc_mule3a.id])
        acc_offramp = next(a for a in accounts if a.bank_id == payx.id and a.id not in [acc_origin.id, acc_mule1.id, acc_mule2.id, acc_mule3a.id, acc_mule3b.id])

        # Record Ground Truth Labels
        GroundTruthStore.record_label(db, sc_id, acc_origin.id, "ORIGIN_VICTIM", "VICTIM_ACCOUNT")
        GroundTruthStore.record_label(db, sc_id, acc_mule1.id, "SUSPECTED_MULE", "LAYER_1_MULE")
        GroundTruthStore.record_label(db, sc_id, acc_mule2.id, "SUSPECTED_MULE", "LAYER_2_MULE")
        GroundTruthStore.record_label(db, sc_id, acc_mule3a.id, "SUSPECTED_MULE", "SPLIT_LAYER_3A")
        GroundTruthStore.record_label(db, sc_id, acc_mule3b.id, "SUSPECTED_MULE", "SPLIT_LAYER_3B")
        GroundTruthStore.record_label(db, sc_id, acc_offramp.id, "OFF_RAMP_DESTINATION", "CASH_ATM_OFFRAMP")

        # 1. Hop 1: Origin -> Mule 1 (₹2,50,000)
        t1 = t0 + timedelta(minutes=5)
        tx1, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=acc_origin.id,
            destination_account_id=acc_mule1.id,
            amount_minor=25000000, # ₹2,50,000
            rail="IMPS",
            memo="Urgent contract investment",
            scenario_id=sc_id
        ), posted_at=t1)

        # 2. Hop 2: Mule 1 -> Mule 2 (₹2,35,000 - retains ₹15,000 cut)
        t2 = t1 + timedelta(minutes=12)
        tx2, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=acc_mule1.id,
            destination_account_id=acc_mule2.id,
            amount_minor=23500000, # ₹2,35,000
            rail="UPI",
            memo="Payment settlement ref 883",
            scenario_id=sc_id
        ), posted_at=t2)

        # 3. Hop 3: Mule 2 -> Splits to Mule 3A (₹1,20,000) & Mule 3B (₹1,10,000)
        t3a = t2 + timedelta(minutes=8)
        tx3a, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=acc_mule2.id,
            destination_account_id=acc_mule3a.id,
            amount_minor=12000000,
            rail="IMPS",
            memo="Disbursal tranche A",
            scenario_id=sc_id
        ), posted_at=t3a)

        t3b = t2 + timedelta(minutes=11)
        tx3b, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=acc_mule2.id,
            destination_account_id=acc_mule3b.id,
            amount_minor=11000000,
            rail="NEFT",
            memo="Disbursal tranche B",
            scenario_id=sc_id
        ), posted_at=t3b)

        # 4. Hop 4: Mule 3A -> Cash ATM Off-Ramp (₹1,18,000)
        t4 = t3a + timedelta(minutes=15)
        tx4, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=acc_mule3a.id,
            destination_account_id=acc_offramp.id,
            amount_minor=11800000,
            rail="CBDC_OFFRAMP",
            memo="ATM Cash Out terminal PAYX-901",
            scenario_id=sc_id
        ), posted_at=t4)

        # Add explicit OFF_RAMP event on tx4
        db.add(TransactionEvent(
            id=str(uuid.uuid4()),
            transaction_id=tx4.id,
            event_type="OFF_RAMP",
            event_time=t4,
            payload_json={"exit_type": "ATM_CASH_WITHDRAWAL", "terminal": "PAYX-ATM-04"}
        ))
        db.commit()

        return {
            "scenario_id": sc_id,
            "status": "SUCCESS",
            "root_account_id": acc_mule1.id,
            "transactions_count": 5,
            "accounts_involved": 6
        }

    @staticmethod
    def _run_simple_chain(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        accs = accounts[:4]
        for a, role in zip(accs, ["ORIGIN_VICTIM", "LAYER_1_MULE", "LAYER_2_MULE", "OFF_RAMP_DESTINATION"]):
            lbl = "SUSPECTED_MULE" if "MULE" in role else role
            GroundTruthStore.record_label(db, sc_id, a.id, lbl, role)

        # Origin -> Mule 1 -> Mule 2 -> Offramp
        t = t0
        for i in range(3):
            t += timedelta(minutes=10)
            memo = "ATM Withdrawal" if i == 2 else "Fund transfer"
            tx, _ = LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=accs[i].id,
                destination_account_id=accs[i+1].id,
                amount_minor=10000000 - (i * 500000),
                rail="IMPS",
                memo=memo,
                scenario_id=sc_id
            ), posted_at=t)
            if i == 2:
                db.add(TransactionEvent(
                    id=str(uuid.uuid4()),
                    transaction_id=tx.id,
                    event_type="OFF_RAMP",
                    event_time=t,
                    payload_json={"exit_type": "ATM_CASH"}
                ))
        db.commit()
        return {"scenario_id": sc_id, "root_account_id": accs[1].id, "transactions_count": 3}

    @staticmethod
    def _run_commission_retention(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        src, mule, dst = accounts[4], accounts[5], accounts[6]
        GroundTruthStore.record_label(db, sc_id, src.id, "ORIGIN_VICTIM", "VICTIM")
        GroundTruthStore.record_label(db, sc_id, mule.id, "SUSPECTED_MULE", "COMMISSION_MULE")
        GroundTruthStore.record_label(db, sc_id, dst.id, "OFF_RAMP_DESTINATION", "OFF_RAMP")

        # Inbound ₹1,50,000
        t1 = t0 + timedelta(minutes=10)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=src.id,
            destination_account_id=mule.id,
            amount_minor=15000000,
            rail="NEFT",
            memo="Invoice payment 104",
            scenario_id=sc_id
        ), posted_at=t1)

        # Mule keeps 5% (₹7,500), forwards ₹1,42,500
        t2 = t1 + timedelta(minutes=25)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=mule.id,
            destination_account_id=dst.id,
            amount_minor=14250000,
            rail="IMPS",
            memo="Settlement payout cash",
            scenario_id=sc_id
        ), posted_at=t2)

        return {"scenario_id": sc_id, "root_account_id": mule.id, "transactions_count": 2}

    @staticmethod
    def _run_split_flow(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        victim = accounts[0]
        src = accounts[7]
        mules = accounts[8:11]
        GroundTruthStore.record_label(db, sc_id, victim.id, "ORIGIN_VICTIM", "CENTRAL_INFLOW")
        GroundTruthStore.record_label(db, sc_id, src.id, "SUSPECTED_MULE", "SPLIT_MULE")
        for m in mules:
            GroundTruthStore.record_label(db, sc_id, m.id, "SUSPECTED_MULE", "SMURF_RECIPIENT")

        # Initial victim deposit into central mule
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=victim.id,
            destination_account_id=src.id,
            amount_minor=30000000, # ₹3,00,000
            rail="IMPS",
            memo="Investment principal",
            scenario_id=sc_id
        ), posted_at=t0)

        t = t0
        for m in mules:
            t += timedelta(minutes=5)
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=src.id,
                destination_account_id=m.id,
                amount_minor=10000000, # ₹1,00,000 each
                rail="UPI",
                memo="Split distribution",
                scenario_id=sc_id
            ), posted_at=t)
        return {"scenario_id": sc_id, "root_account_id": src.id, "transactions_count": 4}

    @staticmethod
    def _run_merge_flow(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        sources = accounts[12:16]
        aggregator = accounts[16]
        outflow = accounts[17]

        for s in sources:
            GroundTruthStore.record_label(db, sc_id, s.id, "ORIGIN_VICTIM", "SOURCE_FEEDER")
        GroundTruthStore.record_label(db, sc_id, aggregator.id, "SUSPECTED_MULE", "AGGREGATOR_MULE")
        GroundTruthStore.record_label(db, sc_id, outflow.id, "OFF_RAMP_DESTINATION", "EXIT_POINT")

        t = t0
        for s in sources:
            t += timedelta(minutes=4)
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=s.id,
                destination_account_id=aggregator.id,
                amount_minor=5000000, # ₹50,000 each
                rail="UPI",
                memo="Payment aggregation",
                scenario_id=sc_id
            ), posted_at=t)

        t += timedelta(minutes=10)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=aggregator.id,
            destination_account_id=outflow.id,
            amount_minor=19500000, # ₹1,95,000 consolidated
            rail="IMPS",
            memo="Bulk sweep cash out",
            scenario_id=sc_id
        ), posted_at=t)

        return {"scenario_id": sc_id, "root_account_id": aggregator.id, "transactions_count": 5}

    @staticmethod
    def _run_no_off_ramp(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        """
        Crucial spec requirement: Suspicious activity exists but no off-ramp event occurs.
        Traversal must still trace and explain stop reason: NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS.
        """
        src = accounts[18]
        mule = accounts[19]
        terminal_boundary = accounts[20]

        GroundTruthStore.record_label(db, sc_id, src.id, "ORIGIN_VICTIM", "FEEDER")
        GroundTruthStore.record_label(db, sc_id, mule.id, "SUSPECTED_MULE", "TRANSIT_MULE")
        GroundTruthStore.record_label(db, sc_id, terminal_boundary.id, "SUSPECTED_MULE", "BOUNDARY_HELD")

        t1 = t0 + timedelta(minutes=15)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=src.id,
            destination_account_id=mule.id,
            amount_minor=20000000, # ₹2,00,000
            rail="IMPS",
            memo="Transfer funds",
            scenario_id=sc_id
        ), posted_at=t1)

        t2 = t1 + timedelta(minutes=10)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=mule.id,
            destination_account_id=terminal_boundary.id,
            amount_minor=19800000,
            rail="UPI",
            memo="No off-ramp internal ledger hold",
            scenario_id=sc_id
        ), posted_at=t2)

        return {"scenario_id": sc_id, "root_account_id": mule.id, "transactions_count": 2}

    @staticmethod
    def _run_multiple_off_ramps(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        src = accounts[21]
        mule = accounts[22]
        atm_exit = accounts[23]
        merchant_exit = accounts[24]

        GroundTruthStore.record_label(db, sc_id, src.id, "ORIGIN_VICTIM", "FEEDER")
        GroundTruthStore.record_label(db, sc_id, mule.id, "SUSPECTED_MULE", "DISPATCH_MULE")
        GroundTruthStore.record_label(db, sc_id, atm_exit.id, "OFF_RAMP_DESTINATION", "ATM_OFFRAMP")
        GroundTruthStore.record_label(db, sc_id, merchant_exit.id, "OFF_RAMP_DESTINATION", "MERCHANT_PAYOUT_OFFRAMP")

        t1 = t0 + timedelta(minutes=10)
        LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=src.id,
            destination_account_id=mule.id,
            amount_minor=30000000,
            rail="RTGS",
            scenario_id=sc_id
        ), posted_at=t1)

        t2 = t1 + timedelta(minutes=8)
        tx_atm, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=mule.id,
            destination_account_id=atm_exit.id,
            amount_minor=15000000,
            rail="IMPS",
            memo="ATM Cash withdrawal branch 01",
            scenario_id=sc_id
        ), posted_at=t2)
        db.add(TransactionEvent(id=str(uuid.uuid4()), transaction_id=tx_atm.id, event_type="OFF_RAMP", event_time=t2))

        t3 = t1 + timedelta(minutes=12)
        tx_merch, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=mule.id,
            destination_account_id=merchant_exit.id,
            amount_minor=14500000,
            rail="NEFT",
            memo="Merchant payout external",
            scenario_id=sc_id
        ), posted_at=t3)
        db.add(TransactionEvent(id=str(uuid.uuid4()), transaction_id=tx_merch.id, event_type="OFF_RAMP", event_time=t3))
        db.commit()

        return {"scenario_id": sc_id, "root_account_id": mule.id, "transactions_count": 3}

    @staticmethod
    def _run_fan_in_fan_out(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        hub = accounts[25]
        senders = accounts[26:31] # 5 senders
        recipients = accounts[31:35] # 4 recipients

        GroundTruthStore.record_label(db, sc_id, hub.id, "SUSPECTED_MULE", "DISPERSION_HUB")
        for s in senders:
            GroundTruthStore.record_label(db, sc_id, s.id, "ORIGIN_VICTIM", "SENDER")
        for r in recipients:
            GroundTruthStore.record_label(db, sc_id, r.id, "OFF_RAMP_DESTINATION", "RECIPIENT")

        t = t0
        for s in senders:
            t += timedelta(minutes=3)
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=s.id,
                destination_account_id=hub.id,
                amount_minor=4000000,
                rail="UPI",
                scenario_id=sc_id
            ), posted_at=t)

        for r in recipients:
            t += timedelta(minutes=3)
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=hub.id,
                destination_account_id=r.id,
                amount_minor=4800000,
                rail="IMPS",
                scenario_id=sc_id
            ), posted_at=t)

        return {"scenario_id": sc_id, "root_account_id": hub.id, "transactions_count": 9}

    @staticmethod
    def _run_cycle(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        a, b, c = accounts[35], accounts[36], accounts[37]
        GroundTruthStore.record_label(db, sc_id, a.id, "SUSPECTED_MULE", "CYCLE_NODE_A")
        GroundTruthStore.record_label(db, sc_id, b.id, "SUSPECTED_MULE", "CYCLE_NODE_B")
        GroundTruthStore.record_label(db, sc_id, c.id, "SUSPECTED_MULE", "CYCLE_NODE_C")

        t1 = t0 + timedelta(minutes=5)
        LedgerService.post_transfer(db, TransactionCreate(source_account_id=a.id, destination_account_id=b.id, amount_minor=10000000, rail="IMPS", scenario_id=sc_id), posted_at=t1)
        t2 = t1 + timedelta(minutes=5)
        LedgerService.post_transfer(db, TransactionCreate(source_account_id=b.id, destination_account_id=c.id, amount_minor=9800000, rail="IMPS", scenario_id=sc_id), posted_at=t2)
        t3 = t2 + timedelta(minutes=5)
        LedgerService.post_transfer(db, TransactionCreate(source_account_id=c.id, destination_account_id=a.id, amount_minor=9600000, rail="IMPS", memo="Cycle loopback", scenario_id=sc_id), posted_at=t3)

        return {"scenario_id": sc_id, "root_account_id": a.id, "transactions_count": 3}

    @staticmethod
    def _run_long_chain(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        chain_accs = accounts[38:46] # 8 hops
        for idx, a in enumerate(chain_accs):
            role = "ORIGIN_VICTIM" if idx == 0 else ("OFF_RAMP_DESTINATION" if idx == len(chain_accs)-1 else f"MULE_HOP_{idx}")
            lbl = "SUSPECTED_MULE" if "MULE" in role else role
            GroundTruthStore.record_label(db, sc_id, a.id, lbl, role)

        t = t0
        for i in range(len(chain_accs) - 1):
            t += timedelta(minutes=8)
            memo = "ATM Offramp" if i == len(chain_accs) - 2 else f"Hop {i+1}"
            tx, _ = LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=chain_accs[i].id,
                destination_account_id=chain_accs[i+1].id,
                amount_minor=10000000 - (i * 200000),
                rail="IMPS",
                memo=memo,
                scenario_id=sc_id
            ), posted_at=t)
            if i == len(chain_accs) - 2:
                db.add(TransactionEvent(id=str(uuid.uuid4()), transaction_id=tx.id, event_type="OFF_RAMP", event_time=t))
        db.commit()
        return {"scenario_id": sc_id, "root_account_id": chain_accs[2].id, "transactions_count": len(chain_accs)-1}

    @staticmethod
    def _run_legit_payroll(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        employer = accounts[46]
        employer.account_type = "CORPORATE"
        employees = accounts[47:57] # 10 employees
        GroundTruthStore.record_label(db, sc_id, employer.id, "LEGITIMATE", "EMPLOYER_PAYROLL")
        for emp in employees:
            emp.account_type = "SALARY"
            GroundTruthStore.record_label(db, sc_id, emp.id, "LEGITIMATE", "EMPLOYEE")

        t = t0
        for emp in employees:
            t += timedelta(minutes=1)
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=employer.id,
                destination_account_id=emp.id,
                amount_minor=4500000, # ₹45,000 monthly salary
                rail="NEFT",
                memo="Monthly Salary Disbursal",
                scenario_id=sc_id
            ), posted_at=t)
        return {"scenario_id": sc_id, "root_account_id": employer.id, "transactions_count": 10}

    @staticmethod
    def _run_legit_merchant(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        merchant = accounts[57]
        merchant.account_type = "MERCHANT"
        customers = accounts[58:78] # 20 retail customers
        GroundTruthStore.record_label(db, sc_id, merchant.id, "LEGITIMATE", "RETAIL_MERCHANT")
        for c in customers:
            GroundTruthStore.record_label(db, sc_id, c.id, "LEGITIMATE", "CUSTOMER")

        t = t0
        for c in customers:
            t += timedelta(minutes=rng.randint(2, 10))
            amt = rng.randint(50000, 300000) # ₹500 to ₹3,000
            LedgerService.post_transfer(db, TransactionCreate(
                source_account_id=c.id,
                destination_account_id=merchant.id,
                amount_minor=amt,
                rail="UPI",
                memo="Store checkout purchase",
                scenario_id=sc_id
            ), posted_at=t)
        return {"scenario_id": sc_id, "root_account_id": merchant.id, "transactions_count": 20}

    @staticmethod
    def _run_reversal(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        a, b = accounts[78], accounts[79]
        GroundTruthStore.record_label(db, sc_id, a.id, "LEGITIMATE", "INITIATOR")
        GroundTruthStore.record_label(db, sc_id, b.id, "LEGITIMATE", "RECIPIENT")

        # 1. Post transfer
        tx, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=a.id,
            destination_account_id=b.id,
            amount_minor=5000000,
            rail="IMPS",
            scenario_id=sc_id
        ), posted_at=t0)

        # 2. Reverse it
        LedgerService.reverse_transaction(db, tx.id, reason="Customer error dispute")
        return {"scenario_id": sc_id, "root_account_id": a.id, "transactions_count": 2}

    @staticmethod
    def _run_idempotency(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        a, b = accounts[80], accounts[81]
        idem_key = f"idem-key-{sc_id}-{rng.randint(1000, 9999)}"
        # Call 3 times
        tx1, created1 = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=a.id,
            destination_account_id=b.id,
            amount_minor=7500000,
            idempotency_key=idem_key,
            scenario_id=sc_id
        ), posted_at=t0)
        
        tx2, created2 = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=a.id,
            destination_account_id=b.id,
            amount_minor=7500000,
            idempotency_key=idem_key,
            scenario_id=sc_id
        ), posted_at=t0)

        return {"scenario_id": sc_id, "root_account_id": a.id, "tx1_created": created1, "tx2_created": created2, "same_id": tx1.id == tx2.id}

    @staticmethod
    def _run_generic_scenario(db: Session, sc_id: str, accounts: List[Account], t0: datetime, rng: random.Random) -> Dict[str, Any]:
        src = rng.choice(accounts)
        dst = rng.choice([a for a in accounts if a.id != src.id])
        GroundTruthStore.record_label(db, sc_id, src.id, "LEGITIMATE", "PEER")
        GroundTruthStore.record_label(db, sc_id, dst.id, "LEGITIMATE", "PEER")
        
        tx, _ = LedgerService.post_transfer(db, TransactionCreate(
            source_account_id=src.id,
            destination_account_id=dst.id,
            amount_minor=rng.randint(100000, 5000000),
            rail="UPI",
            memo=f"Execution of {sc_id}",
            scenario_id=sc_id
        ), posted_at=t0)
        return {"scenario_id": sc_id, "root_account_id": src.id, "transactions_count": 1}
