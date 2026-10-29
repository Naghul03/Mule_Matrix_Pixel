"""
Unsupervised Isolation Forest Anomaly Detection Engine and Feature Extractor.
Adapted from Project A and integrated into Project B's detection pipeline.

Extracts multi-dimensional topological and velocity features for accounts,
identifies multi-dimensional outliers, and provides local explainability
via feature perturbation without claiming raw scores are calibrated fraud probabilities.
"""

import os
import math
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import joblib
import numpy as np
import networkx as nx
from sklearn.ensemble import IsolationForest

from backend.app.core.config import settings


class FeatureExtractor:
    """
    Extracts structural topological and flow-based metrics for accounts.
    Guarantees strict zero-division safety, NaN prevention, and numeric consistency.
    """

    FEATURE_NAMES = [
        "in_degree",
        "out_degree",
        "total_inflow",
        "total_outflow",
        "fan_in",
        "fan_out",
        "degree_ratio",
        "clustering_coeff",
        "component_size",
        "velocity_24h",
        "pass_through_ratio",
        "burst_score"
    ]

    @classmethod
    def extract_features(cls, G: nx.MultiDiGraph, account_id: str) -> Dict[str, float]:
        if account_id not in G:
            return {name: 0.0 for name in cls.FEATURE_NAMES}

        if not hasattr(G, "graph") or G.graph is None:
            G.graph = {}
        if "_features_cache" not in G.graph:
            G.graph["_features_cache"] = {}
        if account_id in G.graph["_features_cache"]:
            return dict(G.graph["_features_cache"][account_id])

        in_edges = list(G.in_edges(account_id, data=True))
        out_edges = list(G.out_edges(account_id, data=True))

        in_degree = len(in_edges)
        out_degree = len(out_edges)

        total_inflow = sum(float(d.get("amount", 0.0)) for _, _, d in in_edges)
        total_outflow = sum(float(d.get("amount", 0.0)) for _, _, d in out_edges)

        in_nbrs = set(u for u, _, _ in in_edges)
        out_nbrs = set(v for _, v, _ in out_edges)
        fan_in = len(in_nbrs)
        fan_out = len(out_nbrs)

        degree_ratio = float(out_degree) / float(in_degree + 1.0)

        max_flow = max(total_inflow, total_outflow)
        min_flow = min(total_inflow, total_outflow)
        pass_through_ratio = (min_flow / max_flow) if max_flow > 0.0 else 0.0

        all_times = []
        for _, _, d in in_edges + out_edges:
            t = d.get("posted_at") or d.get("timestamp")
            if t:
                all_times.append(t)

        all_times.sort()
        velocity_24h = float(in_degree + out_degree)

        burst_score = 0.0
        if len(all_times) > 0:
            window_max = 1
            for i in range(len(all_times)):
                cnt = 1
                for j in range(i + 1, len(all_times)):
                    tdiff = (all_times[j] - all_times[i]).total_seconds()
                    if tdiff <= 600.0:  # 10 minute window
                        cnt += 1
                    else:
                        break
                if cnt > window_max:
                    window_max = cnt
            burst_score = float(window_max)

        if "_wcc_map" not in G.graph:
            try:
                wcc_map = {}
                for comp in nx.weakly_connected_components(G):
                    c_size = float(len(comp))
                    for n in comp:
                        wcc_map[n] = c_size
                G.graph["_wcc_map"] = wcc_map
            except Exception:
                G.graph["_wcc_map"] = {}
        component_size = G.graph["_wcc_map"].get(account_id, 1.0)

        nbrs = in_nbrs.union(out_nbrs)
        k_nbr = len(nbrs)
        if k_nbr < 2:
            clustering_coeff = 0.0
        else:
            nbrs_sub = list(nbrs)[:25]
            k_sub = len(nbrs_sub)
            if k_sub < 2:
                clustering_coeff = 0.0
            else:
                links = 0
                for i in range(k_sub):
                    u = nbrs_sub[i]
                    for j in range(i + 1, k_sub):
                        v = nbrs_sub[j]
                        if G.has_edge(u, v) or G.has_edge(v, u):
                            links += 1
                clustering_coeff = float(2.0 * links) / float(k_sub * (k_sub - 1))

        def sanitize(val: float) -> float:
            if math.isnan(val) or math.isinf(val):
                return 0.0
            return float(val)

        result = {
            "in_degree": float(in_degree),
            "out_degree": float(out_degree),
            "total_inflow": round(sanitize(total_inflow), 2),
            "total_outflow": round(sanitize(total_outflow), 2),
            "fan_in": float(fan_in),
            "fan_out": float(fan_out),
            "degree_ratio": round(sanitize(degree_ratio), 4),
            "clustering_coeff": round(sanitize(clustering_coeff), 4),
            "component_size": float(component_size),
            "velocity_24h": float(velocity_24h),
            "pass_through_ratio": round(sanitize(pass_through_ratio), 4),
            "burst_score": float(burst_score)
        }
        G.graph["_features_cache"][account_id] = result
        return result

    @classmethod
    def to_normalized_vector(cls, features: Dict[str, float]) -> np.ndarray:
        vec = [
            math.log1p(max(0.0, features.get("in_degree", 0.0))),
            math.log1p(max(0.0, features.get("out_degree", 0.0))),
            math.log1p(max(0.0, features.get("total_inflow", 0.0))),
            math.log1p(max(0.0, features.get("total_outflow", 0.0))),
            math.log1p(max(0.0, features.get("fan_in", 0.0))),
            math.log1p(max(0.0, features.get("fan_out", 0.0))),
            min(10.0, max(0.0, features.get("degree_ratio", 0.0))),
            min(1.0, max(0.0, features.get("clustering_coeff", 0.0))),
            math.log1p(max(1.0, features.get("component_size", 1.0))),
            math.log1p(max(0.0, features.get("velocity_24h", 0.0))),
            min(1.0, max(0.0, features.get("pass_through_ratio", 0.0))),
            math.log1p(max(0.0, features.get("burst_score", 0.0)))
        ]
        return np.array(vec, dtype=np.float32)


class IsolationForestEngine:
    """
    Unsupervised Isolation Forest Anomaly Engine.
    Identifies multi-dimensional topological and velocity outliers with local explainability.
    """

    def __init__(
        self,
        model_path: Optional[Path] = None,
        contamination: float = 0.05,
        random_state: int = 42
    ):
        base_dir = Path(__file__).resolve().parent.parent.parent
        self.model_path = model_path or (base_dir / "data" / "models" / "isolation_forest.joblib")
        self.contamination = contamination
        self.random_state = random_state
        self.model: Optional[IsolationForest] = None
        self._load_model_if_exists()

    def _load_model_if_exists(self):
        if self.model_path.exists():
            try:
                self.model = joblib.load(self.model_path)
            except Exception:
                self.model = None

    @property
    def status(self) -> str:
        return "READY" if self.model is not None else "NOT_TRAINED"

    def train(self, feature_vectors: np.ndarray) -> Dict[str, Any]:
        """
        Trains Isolation Forest on feature vectors.
        """
        if len(feature_vectors) < 10:
            return {"status": "FAILED", "reason": "Insufficient training samples (minimum 10 required)."}

        clf = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1
        )
        clf.fit(feature_vectors)
        self.model = clf

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, self.model_path)

        return {
            "status": "READY",
            "samples_trained": len(feature_vectors),
            "features_dimension": feature_vectors.shape[1],
            "contamination": self.contamination,
            "model_path": str(self.model_path)
        }

    def predict(self, feature_dict: Dict[str, float]) -> Dict[str, Any]:
        """
        Predicts anomaly score for an account feature dict.
        """
        if self.model is None:
            # Fallback heuristic calculation if un-trained to ensure graceful degradation
            in_deg = feature_dict.get("in_degree", 0.0)
            out_deg = feature_dict.get("out_degree", 0.0)
            pass_ratio = feature_dict.get("pass_through_ratio", 0.0)
            burst = feature_dict.get("burst_score", 0.0)

            heuristic_score = min(100.0, (burst * 10.0) + (pass_ratio * 30.0) + (min(in_deg, out_deg) * 5.0))
            is_outlier = bool(heuristic_score >= 60.0)

            return {
                "status": "NOT_TRAINED",
                "raw_decision_score": 0.0,
                "anomaly_score": round(heuristic_score, 1),
                "is_outlier": is_outlier,
                "top_anomalous_features": [
                    {"feature": "burst_score", "impact": round(burst * 10.0, 1), "value": burst},
                    {"feature": "pass_through_ratio", "impact": round(pass_ratio * 30.0, 1), "value": pass_ratio}
                ] if is_outlier else [],
                "disclaimer": "Default heuristic outlier score (unsupervised model artifact not loaded)."
            }

        vec = FeatureExtractor.to_normalized_vector(feature_dict).reshape(1, -1)
        raw_score = float(self.model.decision_function(vec)[0])
        prediction = int(self.model.predict(vec)[0])

        # Normalize score into [0.0, 100.0]
        normalized_score = float(np.clip((0.15 - raw_score) / 0.30 * 100.0, 0.0, 100.0))

        # Perturbation explainability
        base_score = raw_score
        feature_impacts = []

        for idx, feat_name in enumerate(FeatureExtractor.FEATURE_NAMES):
            perturbed_vec = vec.copy()
            perturbed_vec[0, idx] = 0.0
            delta = float(self.model.decision_function(perturbed_vec)[0]) - base_score
            impact = abs(delta) * 100.0
            if impact > 0.05:
                feature_impacts.append({
                    "feature": feat_name,
                    "impact": round(impact, 2),
                    "value": feature_dict.get(feat_name, 0.0)
                })

        feature_impacts.sort(key=lambda x: x["impact"], reverse=True)

        return {
            "status": "READY",
            "raw_decision_score": round(raw_score, 4),
            "anomaly_score": round(normalized_score, 1),
            "is_outlier": bool(prediction == -1),
            "top_anomalous_features": feature_impacts[:3],
            "disclaimer": "Unsupervised topological outlier measure; does not represent calibrated fraud probability."
        }
