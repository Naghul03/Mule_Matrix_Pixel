"""
Louvain Community Detection Engine for Mule Matrix.
Adapted from Project A and integrated into Project B's database and graph models.

Projects multi-bank transaction flows onto an undirected weighted graph to detect
topological clusters, circular mule rings, and modularity partitions.
Includes explicit explainability safeguards: community membership is a graph partition
characteristic, NOT conclusive proof of fraud or guilt.
"""

from typing import Dict, Any, List, Set, Optional
import networkx as nx
import networkx.algorithms.community as nx_comm
from sqlalchemy.orm import Session

from backend.app.models.models import Account, Transaction


class LouvainCommunityEngine:
    """
    Seeded Louvain Community Detection Engine.
    Identifies tightly clustered groups of accounts across simulated banks.
    """

    def __init__(self, seed: int = 42, resolution: float = 1.0):
        self.seed = seed
        self.resolution = resolution
        self.cached_communities: List[Set[str]] = []
        self.node_to_comm: Dict[str, int] = {}
        self.modularity_score: float = 0.0
        self.status: str = "READY"

    def build_graph_from_db(self, db: Session) -> nx.MultiDiGraph:
        """
        Builds a MultiDiGraph from active/posted transactions in the database.
        """
        G = nx.MultiDiGraph()
        accounts = db.query(Account).all()
        for acc in accounts:
            G.add_node(
                acc.id,
                account_ref=acc.account_ref,
                bank_id=acc.bank_id,
                risk_state=acc.risk_state.value if hasattr(acc.risk_state, "value") else str(acc.risk_state),
                account_type=acc.account_type.value if hasattr(acc.account_type, "value") else str(acc.account_type)
            )

        transactions = (
            db.query(Transaction)
            .filter(
                Transaction.status.in_([
                    "COMPLETED",
                    "SETTLED",
                    "CLEARED",
                    "SUCCESS",
                    "POSTED",
                ])
            )
            .all()
        )
        for tx in transactions:
            amt = float(tx.amount_minor) / 100.0
            G.add_edge(
                tx.source_account_id,
                tx.destination_account_id,
                key=tx.id,
                amount=amt,
                posted_at=tx.posted_at
            )
        return G

    def project_to_undirected(self, G: nx.MultiDiGraph) -> nx.Graph:
        """
        Projects directed multi-bank transaction graph into a weighted simple undirected graph.
        Edge weight = sum of transaction amounts between pair (min 1.0 to reflect relationship).
        """
        H = nx.Graph()
        for n, data in G.nodes(data=True):
            H.add_node(n, **data)

        for u, v, _, data in G.edges(keys=True, data=True):
            amt = float(data.get("amount", 1.0))
            if amt <= 0.0:
                amt = 1.0
            if H.has_edge(u, v):
                H[u][v]["weight"] += amt
                H[u][v]["tx_count"] += 1
            else:
                H.add_edge(u, v, weight=amt, tx_count=1)

        return H

    def compute_communities(self, G: nx.MultiDiGraph) -> Dict[str, Any]:
        """
        Computes Louvain modularity communities with deterministic seed.
        """
        if len(G) < 2:
            self.status = "EMPTY_GRAPH"
            return {
                "status": self.status,
                "modularity": 0.0,
                "total_communities": 0,
                "community_sizes": []
            }

        H = self.project_to_undirected(G)

        try:
            communities = list(nx_comm.louvain_communities(
                H,
                weight="weight",
                resolution=self.resolution,
                seed=self.seed
            ))
            # Sort communities deterministically by size descending, then by min node ID
            communities.sort(key=lambda c: (-len(c), min(c) if c else ""))
            self.cached_communities = communities
            self.node_to_comm = {}
            for comm_id, c_set in enumerate(communities):
                for node_id in c_set:
                    self.node_to_comm[node_id] = comm_id

            # Compute modularity
            try:
                self.modularity_score = float(nx_comm.modularity(H, communities, weight="weight"))
            except Exception:
                self.modularity_score = 0.0

            self.status = "READY"
        except Exception:
            self.status = "FAILED"
            self.cached_communities = []
            self.node_to_comm = {}
            self.modularity_score = 0.0

        return {
            "status": self.status,
            "modularity": round(self.modularity_score, 4),
            "total_communities": len(self.cached_communities),
            "community_sizes": [len(c) for c in self.cached_communities[:10]]
        }

    def analyze_account(self, G: nx.MultiDiGraph, account_id: str) -> Dict[str, Any]:
        """
        Analyzes community context for a specific account.
        """
        if not self.node_to_comm or account_id not in self.node_to_comm:
            self.compute_communities(G)

        if account_id not in self.node_to_comm:
            return {
                "community_id": -1,
                "community_size": 1,
                "modularity": 0.0,
                "internal_density": 0.0,
                "is_mule_cluster_candidate": False,
                "community_risk_score": 0.0,
                "disclaimer": "Account not found in active community partition."
            }

        comm_id = self.node_to_comm[account_id]
        comm_members = self.cached_communities[comm_id]
        comm_size = len(comm_members)

        # Calculate internal vs external edge density
        internal_edges = 0
        total_edges = 0
        for u in comm_members:
            if u in G:
                for _, v in G.out_edges(u):
                    total_edges += 1
                    if v in comm_members:
                        internal_edges += 1

        internal_density = (float(internal_edges) / float(total_edges)) if total_edges > 0 else 0.0

        # Mule Ring candidate indicator: small-to-medium cluster (3-15 accounts) with high internal cycling
        is_mule_cluster = bool(3 <= comm_size <= 15 and internal_density >= 0.70)

        comm_risk_score = 0.0
        if is_mule_cluster:
            comm_risk_score = 35.0  # capped contribution to prevent guilt by association
        elif 3 <= comm_size <= 25 and internal_density >= 0.50:
            comm_risk_score = 15.0

        return {
            "community_id": comm_id,
            "community_size": comm_size,
            "modularity": round(self.modularity_score, 4),
            "internal_density": round(internal_density, 3),
            "is_mule_cluster_candidate": is_mule_cluster,
            "community_risk_score": comm_risk_score,
            "disclaimer": "Community membership reflects graph partition structure, not conclusive proof of fraud."
        }

    def get_all_communities_summary(self, G: nx.MultiDiGraph) -> List[Dict[str, Any]]:
        """
        Returns structured breakdown of all discovered communities.
        """
        if not self.cached_communities:
            self.compute_communities(G)

        summaries = []
        for comm_id, members in enumerate(self.cached_communities):
            members_list = list(members)
            internal_edges = 0
            total_edges = 0
            banks = set()
            for u in members:
                if u in G:
                    b_id = G.nodes[u].get("bank_id")
                    if b_id:
                        banks.add(b_id)
                    for _, v in G.out_edges(u):
                        total_edges += 1
                        if v in members:
                            internal_edges += 1

            density = (float(internal_edges) / float(total_edges)) if total_edges > 0 else 0.0
            is_mule_cand = bool(3 <= len(members) <= 15 and density >= 0.70)

            summaries.append({
                "community_id": comm_id,
                "member_count": len(members),
                "member_account_ids": members_list[:20],
                "distinct_banks": list(banks),
                "internal_density": round(density, 3),
                "is_mule_cluster_candidate": is_mule_cand,
                "modularity": round(self.modularity_score, 4)
            })

        return summaries
