from typing import List, Dict, Tuple
from dataclasses import dataclass
from backend.app.models.models import Transaction

@dataclass
class FlowAllocation:
    source_tx_id: str
    target_tx_id: str
    allocated_amount_minor: int
    allocation_method: str
    confidence: float

class FlowAllocationEngine:
    @staticmethod
    def calculate_forward_allocations(
        inbound_amount_minor: int,
        outbound_transactions: List[Transaction]
    ) -> List[Tuple[Transaction, int, str, float]]:
        """
        Calculates how an inbound amount is attributed to downstream transactions.
        Returns List of (tx, allocated_amount_minor, method, confidence).
        Guarantees allocated amount never exceeds source or downstream amount.
        """
        if not outbound_transactions or inbound_amount_minor <= 0:
            return []

        results = []
        total_out = sum(t.amount_minor for t in outbound_transactions)

        # Case 1: Single outbound transaction (direct or near-exact forward)
        if len(outbound_transactions) == 1:
            out_tx = outbound_transactions[0]
            allocated = min(inbound_amount_minor, out_tx.amount_minor)
            ratio = allocated / inbound_amount_minor if inbound_amount_minor > 0 else 1.0
            conf = 0.95 if ratio > 0.8 else 0.85
            results.append((out_tx, allocated, "DIRECT_FLOW", conf))
            return results

        # Case 2: Split forward (multiple outbound transactions)
        remaining_inbound = inbound_amount_minor
        for out_tx in outbound_transactions:
            if remaining_inbound <= 0:
                break
            
            # Proportional split based on out_tx share of total outbound
            if total_out > 0:
                share = out_tx.amount_minor / total_out
                proposed = int(inbound_amount_minor * share)
            else:
                proposed = out_tx.amount_minor

            allocated = min(proposed, out_tx.amount_minor, remaining_inbound)
            remaining_inbound -= allocated
            
            # Confidence decreases slightly with higher split branch factor
            split_conf = max(0.60, round(0.90 - (len(outbound_transactions) * 0.04), 2))
            results.append((out_tx, allocated, "SPLIT_ALLOCATION", split_conf))

        return results

    @staticmethod
    def calculate_backward_allocations(
        outbound_amount_minor: int,
        inbound_transactions: List[Transaction]
    ) -> List[Tuple[Transaction, int, str, float]]:
        """
        Calculates how an outbound amount is attributed backward to upstream source transactions.
        Guarantees allocated amount never exceeds source or downstream amount.
        """
        if not inbound_transactions or outbound_amount_minor <= 0:
            return []

        results = []
        if len(inbound_transactions) == 1:
            in_tx = inbound_transactions[0]
            allocated = min(outbound_amount_minor, in_tx.amount_minor)
            conf = 0.95 if allocated >= outbound_amount_minor * 0.8 else 0.85
            results.append((in_tx, allocated, "DIRECT_FLOW", conf))
            return results

        # Merge backwards
        total_in = sum(t.amount_minor for t in inbound_transactions)
        remaining_outbound = outbound_amount_minor
        
        for in_tx in inbound_transactions:
            if remaining_outbound <= 0:
                break
            
            share = in_tx.amount_minor / total_in if total_in > 0 else 1.0
            proposed = int(outbound_amount_minor * share)
            allocated = min(proposed, in_tx.amount_minor, remaining_outbound)
            remaining_outbound -= allocated

            merge_conf = max(0.60, round(0.88 - (len(inbound_transactions) * 0.05), 2))
            results.append((in_tx, allocated, "MERGE_ALLOCATION", merge_conf))

        return results
