from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from backend.app.models.models import Transaction, Account

@dataclass
class AllocationResult:
    transaction: Transaction
    edge_type: str # ATTRIBUTED, CANDIDATE, EXCLUDED
    attributed_amount_minor: int
    allocation_method: str
    confidence: float
    exclusion_reason: Optional[str] = None
    assumptions: Dict[str, Any] = field(default_factory=dict)

@dataclass
class FifoBalanceLot:
    lot_id: str
    timestamp: datetime
    total_amount_minor: int
    remaining_total_minor: int
    suspicious_amount_minor: int
    remaining_suspicious_minor: int
    source_tx_id: Optional[str] = None
    description: str = ""

class FlowAllocationEngine:
    @staticmethod
    def calculate_forward_fifo_allocations(
        account: Account,
        suspicious_inflow_tx: Optional[Transaction],
        inbound_suspicious_minor: int,
        outbound_transactions: List[Transaction],
        prior_balance_minor: int = 0
    ) -> List[AllocationResult]:
        """
        Calculates forward fund attribution across outbound transactions using a deterministic FIFO model.
        Respects:
        - Ledger transaction ordering (by posted_at / initiated_at).
        - Pre-existing legitimate balance (consumed first under FIFO).
        - Transaction settlement status (FAILED, REVERSED, POSTED).
        - Split transfers and remainder candidate routes.
        """
        results: List[AllocationResult] = []
        if not outbound_transactions:
            return results

        # 1. Sort outbound transactions strictly in chronological order
        sorted_outbound = sorted(
            outbound_transactions,
            key=lambda t: (t.posted_at or t.initiated_at or datetime.min, t.id)
        )

        anchor_time = None
        if suspicious_inflow_tx and suspicious_inflow_tx.posted_at:
            anchor_time = suspicious_inflow_tx.posted_at
        elif suspicious_inflow_tx and suspicious_inflow_tx.initiated_at:
            anchor_time = suspicious_inflow_tx.initiated_at

        # Build initial FIFO queue
        # Lot 0: Opening legitimate balance prior to suspicious inflow
        opening_legit = max(0, prior_balance_minor)
        lots: List[FifoBalanceLot] = []
        
        if opening_legit > 0:
            lots.append(FifoBalanceLot(
                lot_id="LOT-OPENING-LEGIT",
                timestamp=datetime.min,
                total_amount_minor=opening_legit,
                remaining_total_minor=opening_legit,
                suspicious_amount_minor=0,
                remaining_suspicious_minor=0,
                description="Pre-existing legitimate account balance"
            ))

        # Lot 1: Inbound suspicious lot
        lots.append(FifoBalanceLot(
            lot_id=f"LOT-SUSPICIOUS-{suspicious_inflow_tx.id if suspicious_inflow_tx else 'ROOT'}",
            timestamp=anchor_time or datetime.min,
            total_amount_minor=inbound_suspicious_minor,
            remaining_total_minor=inbound_suspicious_minor,
            suspicious_amount_minor=inbound_suspicious_minor,
            remaining_suspicious_minor=inbound_suspicious_minor,
            source_tx_id=suspicious_inflow_tx.id if suspicious_inflow_tx else None,
            description="Incoming suspicious funds transfer"
        ))

        for tx in sorted_outbound:
            tx_time = tx.posted_at or tx.initiated_at or datetime.utcnow()

            # Handle non-posted or reversed transactions
            if tx.status == "FAILED":
                results.append(AllocationResult(
                    transaction=tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_FAILED",
                    confidence=0.0,
                    exclusion_reason="Transaction status is FAILED; funds did not settle on ledger.",
                    assumptions={"status": tx.status}
                ))
                continue

            if tx.status == "REVERSED" or tx.reversal_of_id is not None:
                results.append(AllocationResult(
                    transaction=tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_REVERSED",
                    confidence=0.0,
                    exclusion_reason="Transaction was REVERSED; settled fund flow cancelled.",
                    assumptions={"reversal_of_id": tx.reversal_of_id}
                ))
                continue

            # Check temporal ordering: transfer occurring before suspicious funds arrived
            if anchor_time and tx_time < anchor_time:
                results.append(AllocationResult(
                    transaction=tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_PRE_DATING",
                    confidence=0.0,
                    exclusion_reason=f"Temporal ordering: posted before suspicious inflow ({tx_time.isoformat()} < {anchor_time.isoformat()}).",
                    assumptions={"tx_time": tx_time.isoformat(), "anchor_time": anchor_time.isoformat()}
                ))
                continue

            # Draw funds from FIFO queue
            needed = tx.amount_minor
            attributed_suspicious = 0
            lots_consumed = []

            for lot in lots:
                if needed <= 0:
                    break
                if lot.remaining_total_minor <= 0:
                    continue

                draw_total = min(lot.remaining_total_minor, needed)
                # Compute suspicious fraction in this lot
                if lot.total_amount_minor > 0 and lot.remaining_suspicious_minor > 0:
                    # Draw suspicious proportionally or directly
                    draw_suspicious = min(lot.remaining_suspicious_minor, draw_total)
                else:
                    draw_suspicious = 0

                lot.remaining_total_minor -= draw_total
                lot.remaining_suspicious_minor -= draw_suspicious
                needed -= draw_total
                attributed_suspicious += draw_suspicious

                lots_consumed.append({
                    "lot_id": lot.lot_id,
                    "drawn_total": draw_total,
                    "drawn_suspicious": draw_suspicious,
                    "description": lot.description
                })

            if attributed_suspicious > 0:
                # Flow is attributed!
                # Split vs direct
                method = "FIFO_ATTRIBUTION"
                if len(sorted_outbound) > 1 and attributed_suspicious < inbound_suspicious_minor:
                    method = "FIFO_SPLIT_ATTRIBUTION"

                # Calculate confidence
                ratio = attributed_suspicious / tx.amount_minor if tx.amount_minor > 0 else 1.0
                confidence = max(0.65, min(0.98, round(0.95 * ratio, 2)))

                results.append(AllocationResult(
                    transaction=tx,
                    edge_type="ATTRIBUTED",
                    attributed_amount_minor=attributed_suspicious,
                    allocation_method=method,
                    confidence=confidence,
                    exclusion_reason=None,
                    assumptions={
                        "fifo_policy": "STRICT_CHRONOLOGICAL_FIFO",
                        "lots_consumed": lots_consumed,
                        "unattributed_portion": tx.amount_minor - attributed_suspicious
                    }
                ))
            else:
                # Candidate route preserved in graph traversal!
                # 0 suspicious attribution because pre-existing legitimate balance or earlier outflows exhausted suspicious lot
                results.append(AllocationResult(
                    transaction=tx,
                    edge_type="CANDIDATE",
                    attributed_amount_minor=0,
                    allocation_method="FIFO_ZERO_ATTRIBUTION",
                    confidence=0.30,
                    exclusion_reason="FIFO fund attribution assigned ₹0: funded by pre-existing legitimate balance or prior lots.",
                    assumptions={
                        "fifo_policy": "STRICT_CHRONOLOGICAL_FIFO",
                        "lots_consumed": lots_consumed,
                        "candidate_note": "Observed settlement route preserved in transaction graph without attributed illicit funds."
                    }
                ))

        return results

    @staticmethod
    def calculate_backward_fifo_allocations(
        account: Account,
        outbound_suspicious_tx: Optional[Transaction],
        outbound_amount_minor: int,
        inbound_transactions: List[Transaction]
    ) -> List[AllocationResult]:
        """
        Calculates backward fund attribution: traces which prior inbound transfers
        funded the outbound suspicious movement.
        """
        results: List[AllocationResult] = []
        if not inbound_transactions:
            return results

        # 1. Sort inbound transactions in chronological order up to outbound timestamp
        anchor_time = None
        if outbound_suspicious_tx and outbound_suspicious_tx.posted_at:
            anchor_time = outbound_suspicious_tx.posted_at
        elif outbound_suspicious_tx and outbound_suspicious_tx.initiated_at:
            anchor_time = outbound_suspicious_tx.initiated_at

        sorted_inbound = sorted(
            inbound_transactions,
            key=lambda t: (t.posted_at or t.initiated_at or datetime.min, t.id)
        )

        remaining_needed = outbound_amount_minor

        # Reverse iterate (closest prior incoming transfer funded the outgoing transfer first)
        for in_tx in reversed(sorted_inbound):
            in_time = in_tx.posted_at or in_tx.initiated_at or datetime.min

            if in_tx.status == "FAILED":
                results.append(AllocationResult(
                    transaction=in_tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_FAILED",
                    confidence=0.0,
                    exclusion_reason="Inbound transfer failed to settle on ledger."
                ))
                continue

            if in_tx.status == "REVERSED" or in_tx.reversal_of_id is not None:
                results.append(AllocationResult(
                    transaction=in_tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_REVERSED",
                    confidence=0.0,
                    exclusion_reason="Inbound transfer was reversed."
                ))
                continue

            # Temporal check: arrived after outbound
            if anchor_time and in_time > anchor_time:
                results.append(AllocationResult(
                    transaction=in_tx,
                    edge_type="EXCLUDED",
                    attributed_amount_minor=0,
                    allocation_method="EXCLUDED_TEMPORAL_VIOLATION",
                    confidence=0.0,
                    exclusion_reason=f"Temporal violation: inbound transfer arrived after outbound transfer ({in_time.isoformat()} > {anchor_time.isoformat()})."
                ))
                continue

            if remaining_needed > 0:
                allocated = min(remaining_needed, in_tx.amount_minor)
                remaining_needed -= allocated
                ratio = allocated / in_tx.amount_minor if in_tx.amount_minor > 0 else 1.0
                conf = max(0.60, min(0.98, round(0.95 * ratio, 2)))

                results.append(AllocationResult(
                    transaction=in_tx,
                    edge_type="ATTRIBUTED",
                    attributed_amount_minor=allocated,
                    allocation_method="FIFO_BACKWARD_ATTRIBUTION" if len(sorted_inbound) == 1 else "FIFO_MERGE_ATTRIBUTION",
                    confidence=conf,
                    exclusion_reason=None,
                    assumptions={"backward_match": True, "allocated_from_tx": in_tx.id}
                ))
            else:
                # Candidate: arrived before outbound, but earlier inflows already covered the needed amount
                results.append(AllocationResult(
                    transaction=in_tx,
                    edge_type="CANDIDATE",
                    attributed_amount_minor=0,
                    allocation_method="FIFO_BACKWARD_EXHAUSTED",
                    confidence=0.35,
                    exclusion_reason="Eligible route, but FIFO indicates later inbound settlements fully satisfied the outflow.",
                    assumptions={"candidate_note": "Observed route preserved in transaction graph."}
                ))

        # Re-sort results to preserve original order or chronological order
        results.sort(key=lambda r: r.transaction.posted_at or r.transaction.initiated_at or datetime.min)
        return results

    # Legacy backward compatibility methods
    @staticmethod
    def calculate_forward_allocations(inbound_amount_minor: int, outbound_transactions: List[Transaction]):
        """Legacy helper for backward compatibility."""
        res = FlowAllocationEngine.calculate_forward_fifo_allocations(
            account=None,
            suspicious_inflow_tx=None,
            inbound_suspicious_minor=inbound_amount_minor,
            outbound_transactions=outbound_transactions
        )
        return [(r.transaction, r.attributed_amount_minor, r.allocation_method, r.confidence) for r in res]

    @staticmethod
    def calculate_backward_allocations(outbound_amount_minor: int, inbound_transactions: List[Transaction]):
        """Legacy helper for backward compatibility."""
        res = FlowAllocationEngine.calculate_backward_fifo_allocations(
            account=None,
            outbound_suspicious_tx=None,
            outbound_amount_minor=outbound_amount_minor,
            inbound_transactions=inbound_transactions
        )
        return [(r.transaction, r.attributed_amount_minor, r.allocation_method, r.confidence) for r in res]
