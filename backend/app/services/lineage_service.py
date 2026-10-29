import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional, Set, Tuple
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

        # If alert_id provided, ensure it exists and matches root account
        if alert_id:
            alert = db.query(DetectionAlert).filter(DetectionAlert.id == alert_id).first()
            if alert and alert.account_id == root_account_id and not trigger_transaction_id:
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
                "is_cross_bank": is_cross,
                "edge_type": e.edge_type or "ATTRIBUTED",
                "attributed_amount_minor": e.attributed_amount_minor or 0,
                "exclusion_reason": e.exclusion_reason,
                "allocation_assumptions": e.allocation_assumptions or {}
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
                "memo": tx.memo if tx else "",
                "edge_type": e.edge_type or "ATTRIBUTED",
                "attributed_amount_minor": e.attributed_amount_minor or 0,
                "exclusion_reason": e.exclusion_reason
            })

        timeline.sort(key=lambda x: x["timestamp"])

        root_acc = db.query(Account).filter(Account.id == inv.root_account_id).first()
        root_bank = db.query(Bank).filter(Bank.id == root_acc.bank_id).first() if root_acc else None
        root_ref = root_acc.account_ref if root_acc else "UNKNOWN"

        # Reconstruct structured paths (separating Attributed vs Candidate paths)
        attributed_paths, candidate_paths = LineageService._reconstruct_topological_paths(root_ref, enriched_edges)

        return {
            "id": inv.id,
            "alert_id": inv.alert_id,
            "root_account_id": inv.root_account_id,
            "root_account_ref": root_ref,
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
            "attributed_paths": attributed_paths,
            "timeline": timeline
        }

    @staticmethod
    def _reconstruct_topological_paths(root_ref: str, edges: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Reconstructs real, connected topological paths through the network,
        strictly classifying each path as ATTRIBUTED vs CANDIDATE.
        Prevents cycles and duplicate path reporting.
        """
        active_edges = [e for e in edges if e.get("edge_type") != "EXCLUDED"]
        if not active_edges:
            trivial_path = {
                "path_id": "PATH-0",
                "path_type": "CANDIDATE",
                "nodes": [root_ref],
                "edges": [],
                "total_amount_minor": 0,
                "attributed_amount_minor": 0,
                "hop_count": 0,
                "confidence": 1.0,
                "explanation": "Isolated root node with no active settled edges."
            }
            return [], [trivial_path]

        # Adjacency maps
        fwd_adj: Dict[str, List[Dict[str, Any]]] = {}
        bwd_adj: Dict[str, List[Dict[str, Any]]] = {}
        for e in active_edges:
            s, d = e["source_account_ref"], e["destination_account_ref"]
            fwd_adj.setdefault(s, []).append(e)
            bwd_adj.setdefault(d, []).append(e)

        # 1. Trace all backward chains ending at root
        backward_chains: List[List[Dict[str, Any]]] = []
        def dfs_backward(curr: str, chain: List[Dict[str, Any]], visited: Set[str]):
            in_edges = [e for e in bwd_adj.get(curr, []) if e["source_account_ref"] not in visited]
            if not in_edges:
                if chain:
                    backward_chains.append(list(reversed(chain)))
                return
            for e in in_edges:
                src = e["source_account_ref"]
                dfs_backward(src, chain + [e], visited | {src})

        dfs_backward(root_ref, [], {root_ref})

        # 2. Trace all forward chains starting at root
        forward_chains: List[List[Dict[str, Any]]] = []
        def dfs_forward(curr: str, chain: List[Dict[str, Any]], visited: Set[str]):
            out_edges = [e for e in fwd_adj.get(curr, []) if e["destination_account_ref"] not in visited]
            if not out_edges:
                if chain:
                    forward_chains.append(chain)
                return
            for e in out_edges:
                dst = e["destination_account_ref"]
                dfs_forward(dst, chain + [e], visited | {dst})

        dfs_forward(root_ref, [], {root_ref})

        # Combine backward and forward chains into complete end-to-end paths
        combined_edge_paths: List[List[Dict[str, Any]]] = []
        if backward_chains and forward_chains:
            for b in backward_chains[:5]:
                for f in forward_chains[:5]:
                    combined_edge_paths.append(b + f)
        elif backward_chains:
            combined_edge_paths = backward_chains[:10]
        elif forward_chains:
            combined_edge_paths = forward_chains[:10]
        else:
            # Fallback direct edges
            combined_edge_paths = [[e] for e in active_edges[:10]]

        attributed_results = []
        candidate_results = []
        seen_node_tuples = set()

        for idx, edge_list in enumerate(combined_edge_paths):
            if not edge_list:
                continue
            # Build node sequence
            node_seq = [edge_list[0]["source_account_ref"]]
            for ed in edge_list:
                node_seq.append(ed["destination_account_ref"])

            seq_key = tuple(node_seq)
            if seq_key in seen_node_tuples:
                continue
            seen_node_tuples.add(seq_key)

            total_amt = sum(e["amount_minor"] for e in edge_list)
            attributed_amt = min(e["attributed_amount_minor"] for e in edge_list)
            confs = [e["confidence"] for e in edge_list]
            avg_conf = round(sum(confs) / len(confs), 2) if confs else 1.0

            # Path classification:
            # If all edges along the path have positive attributed amount and ATTRIBUTED type -> ATTRIBUTED
            # If any edge has zero attributed amount or is CANDIDATE -> CANDIDATE
            is_attributed = all(
                e.get("edge_type") == "ATTRIBUTED" and e.get("attributed_amount_minor", 0) > 0
                for e in edge_list
            )

            path_type = "ATTRIBUTED" if is_attributed else "CANDIDATE"
            explanation = (
                f"Suspicious fund allocation estimated to flow along {len(edge_list)} hops (Attributed: ₹{attributed_amt/100:,.2f})."
                if is_attributed else
                f"Candidate transaction route observed across {len(edge_list)} hops, but fund attribution is zero or uncertain under FIFO."
            )

            path_obj = {
                "path_id": f"PATH-{idx+1}",
                "path_type": path_type,
                "nodes": node_seq,
                "edges": [e["transaction_id"] for e in edge_list],
                "total_amount_minor": total_amt,
                "attributed_amount_minor": attributed_amt if is_attributed else 0,
                "hop_count": len(edge_list),
                "confidence": avg_conf,
                "explanation": explanation
            }

            if is_attributed:
                attributed_results.append(path_obj)
            else:
                candidate_results.append(path_obj)

        return attributed_results, candidate_results
