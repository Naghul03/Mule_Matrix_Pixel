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
from backend.app.lineage.allocation import FlowAllocationEngine, AllocationResult
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
        
        self.visited_states: Set[Tuple[str, str, int]] = set() # (acc_id, direction, hop_depth)
        self.nodes_by_id: Dict[str, LineageNode] = {}
        self.edges_by_tx: Dict[str, LineageEdge] = {}
        self.stop_reasons: Set[LineageStopReason] = set()
        self.off_ramps_found = 0
        self.origins_found = 0

    def run_trace(self) -> Dict[str, Any]:
        """
        Executes bidirectional bounded graph traversal with dual transaction tracing.
        Separates fund attribution from graph connectivity.
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

        # Determine anchor for backward pass (origin tracing) and forward pass (exit tracing)
        backward_time = datetime.utcnow()
        backward_amount = 0
        backward_tx = None

        forward_time = datetime.utcnow()
        forward_amount = 0
        forward_tx = None

        if self.investigation.trigger_transaction_id:
            trigger_tx = self.db.query(Transaction).filter(Transaction.id == self.investigation.trigger_transaction_id).first()
            if trigger_tx and (trigger_tx.source_account_id == root_acc.id or trigger_tx.destination_account_id == root_acc.id):
                t_time = trigger_tx.posted_at or trigger_tx.initiated_at or datetime.utcnow()
                backward_time = t_time
                backward_amount = trigger_tx.amount_minor
                backward_tx = trigger_tx
                forward_time = t_time
                forward_amount = trigger_tx.amount_minor
                forward_tx = trigger_tx

        # Backward anchor: latest outflow or latest transfer
        if backward_amount == 0 or backward_tx is None:
            latest_out = self.db.query(Transaction).filter(
                Transaction.source_account_id == root_acc.id,
                Transaction.status == "POSTED"
            ).order_by(desc(Transaction.posted_at)).first()
            if latest_out:
                backward_time = latest_out.posted_at or latest_out.initiated_at or backward_time
                backward_amount = latest_out.amount_minor
                backward_tx = latest_out
            else:
                latest_any = self.db.query(Transaction).filter(
                    or_(Transaction.source_account_id == root_acc.id, Transaction.destination_account_id == root_acc.id),
                    Transaction.status == "POSTED"
                ).order_by(desc(Transaction.posted_at)).first()
                if latest_any:
                    backward_time = latest_any.posted_at or latest_any.initiated_at or backward_time
                    backward_amount = latest_any.amount_minor
                    backward_tx = latest_any
                else:
                    backward_amount = 10000000

        # Forward anchor: earliest inflow or earliest transfer
        if forward_amount == 0 or forward_tx is None:
            earliest_in = self.db.query(Transaction).filter(
                Transaction.destination_account_id == root_acc.id,
                Transaction.status == "POSTED"
            ).order_by(Transaction.posted_at).first()
            if earliest_in:
                inflows = self.db.query(Transaction).filter(
                    Transaction.destination_account_id == root_acc.id,
                    Transaction.status == "POSTED"
                ).all()
                total_inflow = sum(t.amount_minor for t in inflows)
                forward_time = earliest_in.posted_at or earliest_in.initiated_at or forward_time
                forward_amount = total_inflow if total_inflow > 0 else earliest_in.amount_minor
                forward_tx = earliest_in
            else:
                earliest_any = self.db.query(Transaction).filter(
                    or_(Transaction.source_account_id == root_acc.id, Transaction.destination_account_id == root_acc.id),
                    Transaction.status == "POSTED"
                ).order_by(Transaction.posted_at).first()
                if earliest_any:
                    forward_time = earliest_any.posted_at or earliest_any.initiated_at or forward_time
                    forward_amount = earliest_any.amount_minor
                    forward_tx = earliest_any
                else:
                    forward_amount = 10000000

        # Execute Backward Pass (origins)
        self._traverse_backward(root_acc, backward_time, backward_amount, backward_tx)

        # Execute Forward Pass (off-ramps)
        self._traverse_forward(root_acc, forward_time, forward_amount, forward_tx)

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
        confidences = [e.confidence for e in self.edges_by_tx.values() if e.edge_type == "ATTRIBUTED"]
        avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 1.0

        attributed_count = sum(1 for e in self.edges_by_tx.values() if e.edge_type == "ATTRIBUTED")
        candidate_count = sum(1 for e in self.edges_by_tx.values() if e.edge_type == "CANDIDATE")
        excluded_count = sum(1 for e in self.edges_by_tx.values() if e.edge_type == "EXCLUDED")

        summary = {
            "accounts_discovered": len(self.nodes_by_id),
            "banks_crossed": banks_crossed,
            "transactions_traversed": total_txs,
            "max_hop_depth": max_depth,
            "off_ramps_found": self.off_ramps_found,
            "origins_found": self.origins_found,
            "avg_confidence": avg_conf,
            "attributed_edges_count": attributed_count,
            "candidate_edges_count": candidate_count,
            "excluded_edges_count": excluded_count,
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

    def _traverse_backward(
        self,
        start_acc: Account,
        start_time: datetime,
        initial_amount: int,
        initial_tx: Optional[Transaction]
    ):
        """
        Bounded BFS backward traversal from destination back to sources.
        Uses FIFO backward fund attribution while preserving candidate routes.
        """
        # Queue item: (Account, current_time, attributed_amount, current_hop, path, latest_tx)
        queue = [(start_acc, start_time, initial_amount, 0, [start_acc.id], initial_tx)]

        while queue:
            if len(self.nodes_by_id) >= self.max_nodes or len(self.edges_by_tx) >= self.max_edges:
                self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                break

            curr_acc, curr_time, curr_amount, curr_hop, path, last_tx = queue.pop(0)

            if curr_hop >= self.max_hops:
                self.stop_reasons.add(LineageStopReason.MAX_HOPS_REACHED)
                continue

            state_key = (curr_acc.id, "BACKWARD", curr_hop)
            if state_key in self.visited_states:
                continue
            self.visited_states.add(state_key)

            window_start = curr_time - timedelta(hours=self.lookback_hours)

            # Query all incoming transactions within window (including candidate and excluded)
            incoming_txs = self.db.query(Transaction).filter(
                Transaction.destination_account_id == curr_acc.id,
                or_(
                    Transaction.posted_at.is_(None),
                    Transaction.posted_at >= window_start
                )
            ).order_by(desc(Transaction.posted_at)).all()

            if not incoming_txs:
                if curr_hop > 0 and curr_acc.id in self.nodes_by_id:
                    self.nodes_by_id[curr_acc.id].is_origin = True
                    self.origins_found += 1
                self.stop_reasons.add(LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS)
                continue

            # Calculate backward FIFO allocations
            alloc_results = FlowAllocationEngine.calculate_backward_fifo_allocations(
                account=curr_acc,
                outbound_suspicious_tx=last_tx,
                outbound_amount_minor=curr_amount,
                inbound_transactions=incoming_txs
            )

            has_valid_upstream = False
            for res in alloc_results:
                if len(self.edges_by_tx) >= self.max_edges:
                    self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                    break

                tx = res.transaction
                src_acc = self.db.query(Account).filter(Account.id == tx.source_account_id).first()
                if not src_acc:
                    continue

                if res.edge_type != "EXCLUDED":
                    has_valid_upstream = True

                # Record or update node
                if src_acc.id not in self.nodes_by_id:
                    self.nodes_by_id[src_acc.id] = LineageNode(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        account_id=src_acc.id,
                        bank_id=src_acc.bank_id,
                        direction="BACKWARD",
                        hop_depth=curr_hop + 1,
                        amount_attributed_minor=res.attributed_amount_minor,
                        evidence_type="INCOMING_FLOW" if res.edge_type == "ATTRIBUTED" else "CANDIDATE_ROUTE",
                        uncertainty=round(1.0 - res.confidence, 2) if res.edge_type == "ATTRIBUTED" else 1.0,
                        is_off_ramp=False,
                        is_origin=False
                    )
                else:
                    existing = self.nodes_by_id[src_acc.id]
                    if existing.direction == "FORWARD":
                        existing.direction = "BOTH"
                    if res.edge_type == "ATTRIBUTED":
                        existing.amount_attributed_minor += res.attributed_amount_minor

                # Record edge with explicit dual attribution metadata
                if tx.id not in self.edges_by_tx:
                    self.edges_by_tx[tx.id] = LineageEdge(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        transaction_id=tx.id,
                        source_account_id=tx.source_account_id,
                        destination_account_id=tx.destination_account_id,
                        amount_minor=tx.amount_minor,
                        direction="BACKWARD",
                        hop_depth=curr_hop + 1,
                        allocation_method=res.allocation_method,
                        confidence=res.confidence,
                        edge_type=res.edge_type,
                        attributed_amount_minor=res.attributed_amount_minor,
                        exclusion_reason=res.exclusion_reason,
                        allocation_assumptions=res.assumptions
                    )

                # Continue traversal if attributed (or candidate within first 2 hops), preventing loops
                if res.edge_type != "EXCLUDED" and src_acc.id not in path:
                    next_amount = res.attributed_amount_minor if res.attributed_amount_minor > 0 else tx.amount_minor
                    queue.append((src_acc, tx.posted_at or curr_time, next_amount, curr_hop + 1, path + [src_acc.id], tx))

            if not has_valid_upstream and curr_hop > 0:
                if curr_acc.id in self.nodes_by_id:
                    self.nodes_by_id[curr_acc.id].is_origin = True
                    self.origins_found += 1

    def _traverse_forward(
        self,
        start_acc: Account,
        start_time: datetime,
        initial_amount: int,
        initial_tx: Optional[Transaction]
    ):
        """
        Bounded BFS forward traversal from source to destinations and terminal off-ramps.
        Uses FIFO forward fund attribution while preserving candidate routes.
        """
        queue = [(start_acc, start_time, initial_amount, 0, [start_acc.id], initial_tx)]

        while queue:
            if len(self.nodes_by_id) >= self.max_nodes or len(self.edges_by_tx) >= self.max_edges:
                self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                break

            curr_acc, curr_time, curr_amount, curr_hop, path, last_tx = queue.pop(0)

            if curr_hop >= self.max_hops:
                self.stop_reasons.add(LineageStopReason.MAX_HOPS_REACHED)
                continue

            state_key = (curr_acc.id, "FORWARD", curr_hop)
            if state_key in self.visited_states:
                continue
            self.visited_states.add(state_key)

            window_end = curr_time + timedelta(hours=self.lookahead_hours)

            # Query all outgoing transactions within window
            outgoing_txs = self.db.query(Transaction).filter(
                Transaction.source_account_id == curr_acc.id,
                or_(
                    Transaction.posted_at.is_(None),
                    Transaction.posted_at <= window_end
                )
            ).order_by(Transaction.posted_at).all()

            if not outgoing_txs:
                self.stop_reasons.add(LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS)
                continue

            # Calculate forward FIFO allocations
            alloc_results = FlowAllocationEngine.calculate_forward_fifo_allocations(
                account=curr_acc,
                suspicious_inflow_tx=last_tx,
                inbound_suspicious_minor=curr_amount,
                outbound_transactions=outgoing_txs,
                prior_balance_minor=0
            )

            for res in alloc_results:
                if len(self.edges_by_tx) >= self.max_edges:
                    self.stop_reasons.add(LineageStopReason.MAX_NODES_OR_EDGES_REACHED)
                    break

                tx = res.transaction
                dst_acc = self.db.query(Account).filter(Account.id == tx.destination_account_id).first()
                if not dst_acc:
                    continue

                # Check if this transfer or destination represents a terminal exit/off-ramp
                is_off_ramp = self._check_is_off_ramp(tx, dst_acc)
                if is_off_ramp and res.edge_type != "EXCLUDED":
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
                        amount_attributed_minor=res.attributed_amount_minor,
                        evidence_type="TERMINAL_OFFRAMP" if is_off_ramp else ("OUTGOING_FLOW" if res.edge_type == "ATTRIBUTED" else "CANDIDATE_ROUTE"),
                        uncertainty=round(1.0 - res.confidence, 2) if res.edge_type == "ATTRIBUTED" else 1.0,
                        is_off_ramp=is_off_ramp,
                        is_origin=False
                    )
                else:
                    existing = self.nodes_by_id[dst_acc.id]
                    if existing.direction == "BACKWARD":
                        existing.direction = "BOTH"
                    if is_off_ramp:
                        existing.is_off_ramp = True
                    if res.edge_type == "ATTRIBUTED":
                        existing.amount_attributed_minor += res.attributed_amount_minor

                # Record edge with dual tracing metadata
                if tx.id not in self.edges_by_tx:
                    self.edges_by_tx[tx.id] = LineageEdge(
                        id=str(uuid.uuid4()),
                        investigation_id=self.investigation.id,
                        transaction_id=tx.id,
                        source_account_id=tx.source_account_id,
                        destination_account_id=tx.destination_account_id,
                        amount_minor=tx.amount_minor,
                        direction="FORWARD",
                        hop_depth=curr_hop + 1,
                        allocation_method=res.allocation_method,
                        confidence=res.confidence,
                        edge_type=res.edge_type,
                        attributed_amount_minor=res.attributed_amount_minor,
                        exclusion_reason=res.exclusion_reason,
                        allocation_assumptions=res.assumptions
                    )

                # Continue forward BFS if not off-ramp, not excluded, and not in cycle
                if not is_off_ramp and res.edge_type != "EXCLUDED" and dst_acc.id not in path:
                    next_amount = res.attributed_amount_minor if res.attributed_amount_minor > 0 else tx.amount_minor
                    queue.append((dst_acc, tx.posted_at or curr_time, next_amount, curr_hop + 1, path + [dst_acc.id], tx))

    def _check_is_off_ramp(self, tx: Transaction, acc: Account) -> bool:
        """
        Determines if a transaction/account represents a terminal exit/off-ramp.
        """
        memo_lower = (tx.memo or "").lower()
        if any(term in memo_lower for term in ["cash", "atm", "off_ramp", "offramp", "crypto", "merchant payout", "terminal", "withdrawal"]):
            return True
        if tx.rail in ["CASH_OUT", "ATM", "OFF_RAMP"]:
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
