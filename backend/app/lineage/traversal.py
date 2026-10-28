import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from backend.app.models.models import (
    Account, Bank, Transaction, TransactionEvent,
    Investigation, LineageNode, LineageEdge
)
from backend.app.lineage.stop_reasons import LineageStopReason
from backend.app.lineage.allocation import FlowAllocationEngine
from backend.app.services.event_service import event_bus

class LineageTraverser:
    def __init__(
        self,
        db: Session,
        investigation: Investigation,
        lookback_hours: int = 72,
        lookahead_hours: int = 72,
        max_hops: int = 12,
        max_nodes: int = 150,
        max_edges: int = 300
    ):
        self.db = db
        self.investigation = investigation
        self.lookback_hours = lookback_hours
        self.lookahead_hours = lookahead_hours
        self.max_hops = max_hops
        self.max_nodes = max_nodes
        self.max_edges = max_edges
        
        self.visited_states: Set[Tuple[str, str, int]] = set() # (acc_id, direction, hour_bucket)
        self.nodes_by_id: Dict[str, LineageNode] = {}
        self.edges_by_tx: Dict[str, LineageEdge] = {}
        self.stop_reasons: Set[LineageStopReason] = set()
        self.off_ramps_found = 0
        self.origins_found = 0

    def run_trace(self) -> Dict[str, Any]:
        """
        Executes bidirectional bounded graph traversal.
        """
        root_acc = self.db.query(Account).filter(Account.id == self.investigation.root_account_id).first()
        if not root_acc:
            self.investigation.status = "COMPLETED"
            self.investigation.stop_reason = LineageStopReason.MISSING_OR_CONFLICTING_DATA.value
            self.db.commit()
            return {"nodes": [], "edges": [], "stop_reason": self.investigation.stop_reason}

        # Clear prior nodes/edges if re-running
        self.db.query(LineageNode).filter(LineageNode.investigation_id == self.investigation.id).delete()
        self.db.query(LineageEdge).filter(LineageEdge.investigation_id == self.investigation.id).delete()

        # Add Root Node
        root_node = LineageNode(
            id=str(uuid.uuid4()),
            investigation_id=self.investigation.id,
            account_id=root_acc.id,
            bank_id=root_acc.bank_id,
            direction="ROOT",
            hop_depth=0,
            amount_attributed_minor=root_acc.balance_minor,
            evidence_type="TRIGGER_ACCOUNT",
            uncertainty=0.0,
            is_off_ramp=False,
            is_origin=False
        )
        self.nodes_by_id[root_acc.id] = root_node

        # Determine anchor timestamp from trigger tx or latest tx or current time
        anchor_time = datetime.utcnow()
        anchor_amount = 0
        if self.investigation.trigger_transaction_id:
            trigger_tx = self.db.query(Transaction).filter(Transaction.id == self.investigation.trigger_transaction_id).first()
            if trigger_tx and trigger_tx.posted_at:
                anchor_time = trigger_tx.posted_at
                anchor_amount = trigger_tx.amount_minor

        if anchor_amount == 0:
            latest_tx = self.db.query(Transaction).filter(
                or_(Transaction.source_account_id == root_acc.id, Transaction.destination_account_id == root_acc.id),
                Transaction.status == "POSTED"
            ).order_by(desc(Transaction.posted_at)).first()
            if latest_tx and latest_tx.posted_at:
                anchor_time = latest_tx.posted_at
                anchor_amount = latest_tx.amount_minor
            else:
                anchor_amount = 10000000 # default ₹1,00,000

        # Execute Backward Pass
        self._traverse_backward(root_acc, anchor_time, anchor_amount)

        # Execute Forward Pass
        self._traverse_forward(root_acc, anchor_time, anchor_amount)

        # Decide primary stop reason
        primary_stop_reason = self._determine_primary_stop_reason()

        # Persist nodes and edges
        for node in self.nodes_by_id.values():
            self.db.add(node)
        for edge in self.edges_by_tx.values():
            self.db.add(edge)

        # Update Investigation record
        self.investigation.completed_at = datetime.utcnow()
        self.investigation.status = "COMPLETED"
        self.investigation.stop_reason = primary_stop_reason.value

        # Calculate metrics
        banks_crossed = len(set(n.bank_id for n in self.nodes_by_id.values()))
        total_txs = len(self.edges_by_tx)
        max_depth = max([n.hop_depth for n in self.nodes_by_id.values()] or [0])
        confidences = [e.confidence for e in self.edges_by_tx.values()]
        avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 1.0

        summary = {
            "accounts_discovered": len(self.nodes_by_id),
            "banks_crossed": banks_crossed,
            "transactions_traversed": total_txs,
            "max_hop_depth": max_depth,
            "off_ramps_found": self.off_ramps_found,
            "origins_found": self.origins_found,
            "avg_confidence": avg_conf,
            "stop_reason": primary_stop_reason.value
        }
        self.investigation.summary_metrics_json = summary
        self.db.commit()

        # Notify event bus
        event_bus.publish_nowait("TRACE_UPDATED", {
            "investigation_id": self.investigation.id,
            "root_account_id": root_acc.id,
            "stop_reason": primary_stop_reason.value,
            "accounts_discovered": len(self.nodes_by_id),
            "transactions_traversed": total_txs,
            "off_ramps_found": self.off_ramps_found
        })

        return summary

    def _traverse_backward(self, start_acc: Account, start_time: datetime, initial_amount: int):
        """
        Bounded BFS backward traversal from destination back to sources.
        """
        # Queue item: (Account, current_time, attributed_amount, current_hop, path)
        queue = [(start_acc, start_time, initial_amount, 0, [start_acc.id])]

        while queue:
            if len(self.nodes_by_id) >= self.max_nodes or len(self.edges_by_tx) >= self.max_edges:
                self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                break

            curr_acc, curr_time, curr_amount, curr_hop, path = queue.pop(0)

            if curr_hop >= self.max_hops:
                self.stop_reasons.add(LineageStopReason.MAX_HOPS_REACHED)
                continue

            hour_bucket = int(curr_time.timestamp() // 3600)
            state_key = (curr_acc.id, "BACKWARD", hour_bucket)
            if state_key in self.visited_states:
                continue
            self.visited_states.add(state_key)

            window_start = curr_time - timedelta(hours=self.lookback_hours)

            # Query incoming posted transactions
            incoming_txs = self.db.query(Transaction).filter(
                Transaction.destination_account_id == curr_acc.id,
                Transaction.status == "POSTED",
                Transaction.posted_at <= curr_time,
                Transaction.posted_at >= window_start
            ).order_by(desc(Transaction.posted_at)).limit(10).all()

            if not incoming_txs:
                # If we've hopped at least once and find no earlier transactions, mark current as Origin Candidate
                if curr_hop > 0:
                    if curr_acc.id in self.nodes_by_id:
                        self.nodes_by_id[curr_acc.id].is_origin = True
                        self.origins_found += 1
                self.stop_reasons.add(LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS)
                continue

            # Calculate backward flow allocations
            allocations = FlowAllocationEngine.calculate_backward_allocations(curr_amount, incoming_txs)

            for tx, allocated_amt, method, conf in allocations:
                if len(self.edges_by_tx) >= self.max_edges:
                    self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                    break

                src_acc = self.db.query(Account).filter(Account.id == tx.source_account_id).first()
                if not src_acc:
                    continue

                # Record or update node
                if src_acc.id not in self.nodes_by_id:
                    self.nodes_by_id[src_acc.id] = LineageNode(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        account_id=src_acc.id,
                        bank_id=src_acc.bank_id,
                        direction="BACKWARD",
                        hop_depth=curr_hop + 1,
                        amount_attributed_minor=allocated_amt,
                        evidence_type="INCOMING_FLOW",
                        uncertainty=round(1.0 - conf, 2),
                        is_off_ramp=False,
                        is_origin=False
                    )
                else:
                    existing = self.nodes_by_id[src_acc.id]
                    if existing.direction == "FORWARD":
                        existing.direction = "BOTH"

                # Record edge
                if tx.id not in self.edges_by_tx:
                    self.edges_by_tx[tx.id] = LineageEdge(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        transaction_id=tx.id,
                        source_account_id=tx.source_account_id,
                        destination_account_id=tx.destination_account_id,
                        amount_minor=allocated_amt,
                        direction="BACKWARD",
                        hop_depth=curr_hop + 1,
                        allocation_method=method,
                        confidence=conf
                    )

                # Cycle prevention in path
                if src_acc.id not in path:
                    queue.append((src_acc, tx.posted_at or curr_time, allocated_amt, curr_hop + 1, path + [src_acc.id]))

    def _traverse_forward(self, start_acc: Account, start_time: datetime, initial_amount: int):
        """
        Bounded BFS forward traversal from source to destinations and terminal off-ramps.
        """
        queue = [(start_acc, start_time, initial_amount, 0, [start_acc.id])]

        while queue:
            if len(self.nodes_by_id) >= self.max_nodes or len(self.edges_by_tx) >= self.max_edges:
                self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                break

            curr_acc, curr_time, curr_amount, curr_hop, path = queue.pop(0)

            if curr_hop >= self.max_hops:
                self.stop_reasons.add(LineageStopReason.MAX_HOPS_REACHED)
                continue

            hour_bucket = int(curr_time.timestamp() // 3600)
            state_key = (curr_acc.id, "FORWARD", hour_bucket)
            if state_key in self.visited_states:
                continue
            self.visited_states.add(state_key)

            window_end = curr_time + timedelta(hours=self.lookahead_hours)

            # Query outgoing posted transactions
            outgoing_txs = self.db.query(Transaction).filter(
                Transaction.source_account_id == curr_acc.id,
                Transaction.status == "POSTED",
                Transaction.posted_at >= curr_time,
                Transaction.posted_at <= window_end
            ).order_by(Transaction.posted_at).limit(10).all()

            if not outgoing_txs:
                self.stop_reasons.add(LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS)
                continue

            # Calculate forward allocations
            allocations = FlowAllocationEngine.calculate_forward_allocations(curr_amount, outgoing_txs)

            for tx, allocated_amt, method, conf in allocations:
                if len(self.edges_by_tx) >= self.max_edges:
                    self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                    break

                dst_acc = self.db.query(Account).filter(Account.id == tx.destination_account_id).first()
                if not dst_acc:
                    continue

                # Check if this transfer or destination represents an off-ramp
                is_off_ramp = self._check_is_off_ramp(tx, dst_acc)
                if is_off_ramp:
                    self.off_ramps_found += 1
                    self.stop_reasons.add(LineageStopReason.OFF_RAMP_REACHED)

                # Record or update node
                if dst_acc.id not in self.nodes_by_id:
                    self.nodes_by_id[dst_acc.id] = LineageNode(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        account_id=dst_acc.id,
                        bank_id=dst_acc.bank_id,
                        direction="FORWARD",
                        hop_depth=curr_hop + 1,
                        amount_attributed_minor=allocated_amt,
                        evidence_type="TERMINAL_OFFRAMP" if is_off_ramp else "OUTGOING_FLOW",
                        uncertainty=round(1.0 - conf, 2),
                        is_off_ramp=is_off_ramp,
                        is_origin=False
                    )
                else:
                    existing = self.nodes_by_id[dst_acc.id]
                    if existing.direction == "BACKWARD":
                        existing.direction = "BOTH"
                    if is_off_ramp:
                        existing.is_off_ramp = True

                # Record edge
                if tx.id not in self.edges_by_tx:
                    self.edges_by_tx[tx.id] = LineageEdge(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        transaction_id=tx.id,
                        source_account_id=tx.source_account_id,
                        destination_account_id=tx.destination_account_id,
                        amount_minor=allocated_amt,
                        direction="FORWARD",
                        hop_depth=curr_hop + 1,
                        allocation_method=method,
                        confidence=conf
                    )

                # If not an off-ramp and not in cycle, continue forward BFS
                if not is_off_ramp and dst_acc.id not in path:
                    queue.append((dst_acc, tx.posted_at or curr_time, allocated_amt, curr_hop + 1, path + [dst_acc.id]))

    def _check_is_off_ramp(self, tx: Transaction, acc: Account) -> bool:
        """
        Determines if a transaction/account represents a terminal exit/off-ramp.
        """
        memo_lower = (tx.memo or "").lower()
        if any(term in memo_lower for term in ["cash", "atm", "off_ramp", "offramp", "crypto", "merchant payout", "terminal"]):
            return True
        if tx.rail in ["CBDC_OFFRAMP", "CASH_OUT"]:
            return True
        
        # Check transaction events for explicit OFF_RAMP tag
        off_ramp_evt = self.db.query(TransactionEvent).filter(
            TransactionEvent.transaction_id == tx.id,
            TransactionEvent.event_type == "OFF_RAMP"
        ).first()
        return off_ramp_evt is not None

    def _determine_primary_stop_reason(self) -> LineageStopReason:
        """
        Picks the most informative stop reason based on priority hierarchy.
        """
        if LineageStopReason.OFF_RAMP_REACHED in self.stop_reasons:
            return LineageStopReason.OFF_RAMP_REACHED
        if LineageStopReason.MAX_HOPS_REACHED in self.stop_reasons:
            return LineageStopReason.MAX_HOPS_REACHED
        if LineageStopReason.MAX_NODES_OR_EDGES_REACHED in self.stop_reasons:
            return LineageStopReason.MAX_NODES_OR_EDGES_REACHED
        if LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS in self.stop_reasons:
            return LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS
        return LineageStopReason.LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED
