"""
Inductive GraphSAGE Neighborhood Aggregation Engine.
Adapted from Project A and integrated into Project B.

Aggregates 2-hop topological and flow features using mean convolution:
h_v = ReLU(W * CONCAT(h_v, MEAN_{u in N(v)} h_u) + b)
Outputs predicted mule probability and risk score with full training,
evaluation, and inductive inference support.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import networkx as nx
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.app.detection.anomaly import FeatureExtractor


class SAGEConv(nn.Module):
    """
    Mean-Aggregator GraphSAGE Convolution Layer.
    """
    def __init__(self, in_feats: int, out_feats: int):
        super().__init__()
        self.linear = nn.Linear(in_feats * 2, out_feats)

    def forward(self, self_feats: torch.Tensor, neigh_feats: torch.Tensor) -> torch.Tensor:
        combined = torch.cat([self_feats, neigh_feats], dim=-1)
        return F.relu(self.linear(combined))


class GraphSAGENet(nn.Module):
    """
    2-Layer GraphSAGE Network for Inductive Mule Account Detection.
    """
    def __init__(self, in_dim: int = 12, hidden_dim: int = 32, out_dim: int = 1):
        super().__init__()
        self.conv1 = SAGEConv(in_dim, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, hidden_dim)
        self.classifier = nn.Linear(hidden_dim, out_dim)
        self.dropout = nn.Dropout(0.2)

    def forward(
        self,
        x_target: torch.Tensor,
        x_neigh_1: torch.Tensor,
        x_neigh_2: torch.Tensor
    ) -> torch.Tensor:
        # Layer 1
        h_target_1 = self.dropout(self.conv1(x_target, x_neigh_1))
        h_neigh_1 = self.dropout(self.conv1(x_neigh_1, x_neigh_2))

        # Layer 2
        h_target_2 = self.conv2(h_target_1, h_neigh_1)
        logits = self.classifier(h_target_2)
        return torch.sigmoid(logits)


class GraphSAGEEngine:
    """
    PyTorch Inductive GraphSAGE Neighborhood Aggregation Engine.
    """

    def __init__(
        self,
        model_path: Optional[Path] = None,
        meta_path: Optional[Path] = None,
        in_dim: int = 12,
        hidden_dim: int = 32
    ):
        base_dir = Path(__file__).resolve().parent.parent.parent
        self.model_path = model_path or (base_dir / "data" / "models" / "graphsage_model.pt")
        self.meta_path = meta_path or (base_dir / "data" / "models" / "graphsage_meta.json")
        self.in_dim = in_dim
        self.hidden_dim = hidden_dim
        self.model: Optional[GraphSAGENet] = None
        self.metadata: Dict[str, Any] = {}
        self._load_model_if_exists()

    def _load_model_if_exists(self):
        if self.model_path.exists():
            try:
                model = GraphSAGENet(self.in_dim, self.hidden_dim, 1)
                model.load_state_dict(torch.load(self.model_path, map_location=torch.device('cpu')))
                model.eval()
                self.model = model
                if self.meta_path.exists():
                    with open(self.meta_path, "r") as f:
                        self.metadata = json.load(f)
            except Exception:
                self.model = None
                self.metadata = {}

    @property
    def status(self) -> str:
        return "READY" if self.model is not None else "NOT_TRAINED"

    def _get_neighborhood_features(
        self,
        G: nx.MultiDiGraph,
        node_id: str,
        features_cache: Dict[str, np.ndarray]
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        target_vec = features_cache.get(node_id)
        if target_vec is None:
            raw_f = FeatureExtractor.extract_features(G, node_id)
            target_vec = FeatureExtractor.to_normalized_vector(raw_f)
            features_cache[node_id] = target_vec

        neighbors_1 = list(set(list(G.predecessors(node_id)) + list(G.successors(node_id))))

        if not neighbors_1:
            neigh_1_vec = target_vec.copy()
            neigh_2_vec = target_vec.copy()
            return target_vec, neigh_1_vec, neigh_2_vec

        neigh_1_vecs = []
        neighbors_2_all = []
        for n1 in neighbors_1:
            v1 = features_cache.get(n1)
            if v1 is None:
                v1 = FeatureExtractor.to_normalized_vector(FeatureExtractor.extract_features(G, n1))
                features_cache[n1] = v1
            neigh_1_vecs.append(v1)

            n2_list = list(set(list(G.predecessors(n1)) + list(G.successors(n1))))
            neighbors_2_all.extend(n2_list)

        neigh_1_vec = np.mean(neigh_1_vecs, axis=0)

        if not neighbors_2_all:
            neigh_2_vec = neigh_1_vec.copy()
        else:
            neigh_2_vecs = []
            for n2 in set(neighbors_2_all):
                v2 = features_cache.get(n2)
                if v2 is None:
                    v2 = FeatureExtractor.to_normalized_vector(FeatureExtractor.extract_features(G, n2))
                    features_cache[n2] = v2
                neigh_2_vecs.append(v2)
            neigh_2_vec = np.mean(neigh_2_vecs, axis=0)

        return target_vec, neigh_1_vec, neigh_2_vec

    def train_on_graph(
        self,
        G: nx.MultiDiGraph,
        labels: Dict[str, int],
        train_nodes: List[str],
        epochs: int = 25,
        lr: float = 0.01
    ) -> Dict[str, Any]:
        """
        Trains GraphSAGE on a specified training subgraph with binary mule labels.
        """
        if len(train_nodes) < 4:
            return {"status": "FAILED", "reason": "Insufficient training nodes."}

        features_cache: Dict[str, np.ndarray] = {}
        x_target_list = []
        x_neigh1_list = []
        x_neigh2_list = []
        y_list = []

        pos_count = 0
        neg_count = 0

        for n in train_nodes:
            if n in labels:
                t_vec, n1_vec, n2_vec = self._get_neighborhood_features(G, n, features_cache)
                x_target_list.append(t_vec)
                x_neigh1_list.append(n1_vec)
                x_neigh2_list.append(n2_vec)
                label_val = float(labels[n])
                y_list.append([label_val])
                if label_val > 0.5:
                    pos_count += 1
                else:
                    neg_count += 1

        if pos_count == 0 or neg_count == 0:
            return {"status": "FAILED", "reason": "Both positive and negative samples required for training."}

        x_t = torch.tensor(np.array(x_target_list), dtype=torch.float32)
        x_n1 = torch.tensor(np.array(x_neigh1_list), dtype=torch.float32)
        x_n2 = torch.tensor(np.array(x_neigh2_list), dtype=torch.float32)
        y = torch.tensor(np.array(y_list), dtype=torch.float32)

        pos_weight = torch.tensor([neg_count / max(1, pos_count)], dtype=torch.float32)
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

        model = GraphSAGENet(self.in_dim, self.hidden_dim, 1)
        optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

        model.train()
        loss_val = 0.0
        for _ in range(epochs):
            optimizer.zero_grad()
            h_t1 = model.dropout(model.conv1(x_t, x_n1))
            h_n1 = model.dropout(model.conv1(x_n1, x_n2))
            h_t2 = model.conv2(h_t1, h_n1)
            logits = model.classifier(h_t2)

            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            loss_val = float(loss.item())

        model.eval()
        self.model = model

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), self.model_path)

        self.metadata = {
            "version": "v1.2",
            "epochs": epochs,
            "train_nodes": len(train_nodes),
            "pos_samples": pos_count,
            "neg_samples": neg_count,
            "loss": round(loss_val, 4),
            "in_dim": self.in_dim,
            "hidden_dim": self.hidden_dim
        }
        with open(self.meta_path, "w") as f:
            json.dump(self.metadata, f, indent=2)

        return {
            "status": "READY",
            "metadata": self.metadata
        }

    def predict(self, G: nx.MultiDiGraph, account_id: str) -> Dict[str, Any]:
        """
        Inductive inference for an account within graph G.
        """
        if self.model is None:
            return {
                "status": "NOT_TRAINED",
                "mule_probability": 0.0,
                "graphsage_risk_score": 0.0,
                "disclaimer": "GraphSAGE model weights not trained or unavailable."
            }

        features_cache: Dict[str, np.ndarray] = {}
        t_vec, n1_vec, n2_vec = self._get_neighborhood_features(G, account_id, features_cache)

        x_t = torch.tensor(t_vec, dtype=torch.float32).unsqueeze(0)
        x_n1 = torch.tensor(n1_vec, dtype=torch.float32).unsqueeze(0)
        x_n2 = torch.tensor(n2_vec, dtype=torch.float32).unsqueeze(0)

        self.model.eval()
        with torch.no_grad():
            prob = float(self.model(x_t, x_n1, x_n2).item())

        score = round(prob * 100.0, 1)

        return {
            "status": "READY",
            "mule_probability": round(prob, 4),
            "graphsage_risk_score": score,
            "disclaimer": "Inductive GraphSAGE 2-layer neighborhood aggregation output."
        }
