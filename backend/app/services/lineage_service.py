import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.models.models import Investigation, LineageNode, LineageEdge, Account, Bank, Transaction, DetectionAlert
from backend.app.lineage.traversal import LineageTraverser
from backend.app.core.errors import ResourceNotFoundError
from backend.app.core.config import settings

class LineageService:
    @staticmethod
    def create_investigation(
        db: Session,
        root_account_id: str,
        alert_id: Optional[str] = None,
        trigger_transaction_id: Optional[str] = None,
        lookback_hours: int = 72,
        lookahead_hours: int = 72,
        max_hops: int = 12,
        max_nodes: int = 150
    ) -> Investigation:
        acc = db.query(Account).filter(Account.id == root_account_id).first()
        if not acc:
            raise ResourceNotFoundError(f"Root account {root_account_id} not found.")

        # If alert_id provided, ensure it exists
        if alert_id:
            alert = db.query(DetectionAlert).filter(DetectionAlert.id == alert_id).first()
            if alert and not trigger_transaction_id:
                trigger_transaction_id = alert.trigger_transaction_id

        inv = Investigation(
            id=str(uuid.uuid4()),
            root_account_id=root_account_id,
            alert_id=alert_id,
            trigger_transaction_id=trigger_transaction_id,
            started_at=datetime.utcnow(),
            status="IN_PROGRESS",
            config_json={
                "lookback_hours": lookback_hours,
                "lookahead_hours": lookahead_hours,
                "max_hops": max_hops,
                "max_nodes": max_nodes
            }
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)

        # Run initial trace
        traverser = LineageTraverser(
            db=db,
            investigation=inv,
            lookback_hours=lookback_hours,
            lookahead_hours=lookahead_hours,
            max_hops=max_hops,
            max_nodes=max_nodes
        )
        traverser.run_trace()
        return inv

    @staticmethod
    def run_trace(
        db: Session,
        investigation_id: str,
        lookback_hours: Optional[int] = None,
        lookahead_hours: Optional[int] = None,
        max_hops: Optional[int] = None,
        max_nodes: Optional[int] = None
    ) -> Investigation:
        inv = db.query(Investigation).filter(Investigation.id == investigation_id).first()
        if not inv:
            raise ResourceNotFoundError(f"Investigation {investigation_id} not found.")

        cfg = inv.config_json or {}
        lb = lookback_hours or cfg.get("lookback_hours", settings.LOOKBACK_HOURS)
        la = lookahead_hours or cfg.get("lookahead_hours", settings.LOOKAHEAD_HOURS)
        hops = max_hops or cfg.get("max_hops", settings.MAX_HOPS)
        nodes = max_nodes or cfg.get("max_nodes", settings.MAX_NODES)

        inv.config_json = {
            "lookback_hours": lb,
            "lookahead_hours": la,
            "max_hops": hops,
            "max_nodes": nodes
        }
        inv.status = "IN_PROGRESS"
        db.commit()

        traverser = LineageTraverser(
            db=db,
            investigation=inv,
            lookback_hours=lb,
            lookahead_hours=la,
            max_hops=hops,
            max_nodes=nodes
        )
        traverser.run_trace()
        db.refresh(inv)
        return inv

    @staticmethod
    def get_investigation_detail(db: Session, investigation_id: str) -> Dict[str, Any]:
        inv = db.query(Investigation).filter(Investigation.id == investigation_id).first()
        if not inv:
            raise ResourceNotFoundError(f"Investigation {investigation_id} not found.")

        # Enrich nodes
        nodes = db.query(LineageNode).filter(LineageNode.investigation_id == investigation_id).all()
        enriched_nodes = []
        for n in nodes:
            acc = db.query(Account).filter(Account.id == n.account_id).first()
            bank = db.query(Bank).filter(Bank.id == n.bank_id).first()
            enriched_nodes.append({
                "id": n.id,
                "account_id": n.account_id,
                "account_ref": acc.account_ref if acc else "UNKNOWN",
                "bank_id": n.bank_id,
                "bank_code": bank.bank_code if bank else "UNKNOWN",
                "bank_name": bank.name if bank else "Unknown Synthetic Bank",
                "account_type": acc.account_type if acc else "INDIVIDUAL",
                "direction": n.direction,
                "hop_depth": n.hop_depth,
                "amount_attributed_minor": n.amount_attributed_minor,
                "evidence_type": n.evidence_type,
                "uncertainty": n.uncertainty,
                "is_off_ramp": n.is_off_ramp,
                "is_origin": n.is_origin,
                "risk_state": acc.risk_state if acc else "NORMAL"
            })

        # Enrich edges
        edges = db.query(LineageEdge).filter(LineageEdge.investigation_id == investigation_id).all()
        enriched_edges = []
        timeline = []
        for e in edges:
            tx = db.query(Transaction).filter(Transaction.id == e.transaction_id).first()
            src_acc = db.query(Account).filter(Account.id == e.source_account_id).first()
            dst_acc = db.query(Account).filter(Account.id == e.destination_account_id).first()
            src_bank = db.query(Bank).filter(Bank.id == src_acc.bank_id).first() if src_acc else None
            dst_bank = db.query(Bank).filter(Bank.id == dst_acc.bank_id).first() if dst_acc else None
            
            src_bcode = src_bank.bank_code if src_bank else "UNK"
            dst_bcode = dst_bank.bank_code if dst_bank else "UNK"
            is_cross = (src_bank.id != dst_bank.id) if (src_bank and dst_bank) else False

            edge_dict = {
                "id": e.id,
                "transaction_id": e.transaction_id,
                "source_account_id": e.source_account_id,
                "destination_account_id": e.destination_account_id,
                "source_account_ref": src_acc.account_ref if src_acc else "UNKNOWN",
                "destination_account_ref": dst_acc.account_ref if dst_acc else "UNKNOWN",
                "source_bank_code": src_bcode,
                "destination_bank_code": dst_bcode,
                "amount_minor": tx.amount_minor if tx else e.amount_minor,
                "direction": e.direction,
                "hop_depth": e.hop_depth,
                "allocation_method": e.allocation_method,
                "confidence": e.confidence,
                "posted_at": tx.posted_at.isoformat() if (tx and tx.posted_at) else None,
                "rail": tx.rail if tx else "IMPS",
                "is_cross_bank": is_cross
            }
            enriched_edges.append(edge_dict)
            timeline.append({
                "timestamp": tx.posted_at.isoformat() if (tx and tx.posted_at) else datetime.utcnow().isoformat(),
                "transaction_id": e.transaction_id,
                "source_account_ref": src_acc.account_ref if src_acc else "UNK",
                "source_bank_code": src_bcode,
                "destination_account_ref": dst_acc.account_ref if dst_acc else "UNK",
                "destination_bank_code": dst_bcode,
                "amount_minor": tx.amount_minor if tx else e.amount_minor,
                "direction": e.direction,
                "hop_depth": e.hop_depth,
                "confidence": e.confidence,
                "allocation_method": e.allocation_method,
                "rail": tx.rail if tx else "IMPS",
                "memo": tx.memo if tx else ""
            })

        timeline.sort(key=lambda x: x["timestamp"])

        root_acc = db.query(Account).filter(Account.id == inv.root_account_id).first()
        root_bank = db.query(Bank).filter(Bank.id == root_acc.bank_id).first() if root_acc else None

        # Reconstruct candidate paths (simple path aggregation from edges)
        candidate_paths = LineageService._reconstruct_paths(inv.root_account_id, enriched_edges)

        return {
            "id": inv.id,
            "alert_id": inv.alert_id,
            "root_account_id": inv.root_account_id,
            "root_account_ref": root_acc.account_ref if root_acc else "UNKNOWN",
            "root_bank_code": root_bank.bank_code if root_bank else "UNK",
            "started_at": inv.started_at,
            "completed_at": inv.completed_at,
            "status": inv.status,
            "stop_reason": inv.stop_reason,
            "config_json": inv.config_json,
            "summary_metrics_json": inv.summary_metrics_json or {},
            "nodes": enriched_nodes,
            "edges": enriched_edges,
            "candidate_paths": candidate_paths,
            "timeline": timeline
        }

    @staticmethod
    def _reconstruct_paths(root_acc_id: str, edges: List[Dict[str, Any]]) -> List[List[str]]:
        """
        Reconstructs primary candidate paths through root account.
        """
        if not edges:
            return [[root_acc_id]]
            
        backward_edges = [e for e in edges if e["direction"] == "BACKWARD"]
        forward_edges = [e for e in edges if e["direction"] == "FORWARD"]

        paths = []
        if backward_edges and forward_edges:
            for b in backward_edges[:3]:
                for f in forward_edges[:3]:
                    paths.append([b["source_account_ref"], b["destination_account_ref"], f["destination_account_ref"]])
        elif backward_edges:
            for b in backward_edges[:5]:
                paths.append([b["source_account_ref"], b["destination_account_ref"]])
        elif forward_edges:
            for f in forward_edges[:5]:
                paths.append([f["source_account_ref"], f["destination_account_ref"]])
        else:
            paths.append([root_acc_id])

        return paths
