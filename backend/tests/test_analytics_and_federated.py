"""
Comprehensive verification for ported Project A features:
1. Louvain Community Detection Engine
2. Feature Extractor & Isolation Forest Anomaly Engine
3. Inductive GraphSAGE Neighborhood Classifier
4. Federated Learning Coordinator & Local Bank Clients
5. Ground-Truth Label Isolation Check
"""

import inspect
import networkx as nx
import numpy as np
import torch
import pytest

from backend.app.detection.community import LouvainCommunityEngine
from backend.app.detection.anomaly import FeatureExtractor, IsolationForestEngine
from backend.app.detection.graphsage import GraphSAGEEngine
from backend.app.federated.client import BankFederatedClient, MuleRiskClassifier
from backend.app.federated.coordinator import FederatedCoordinator
from backend.app.federated.privacy import PrivacySpecification, _generate_synthetic_bank_clients


def test_louvain_community_detection_engine():
    G = nx.MultiDiGraph()
    # Create 2 tightly coupled communities
    for i in range(5):
        G.add_node(f"bank1_acc_{i}", bank_id="B1")
        for j in range(5):
            if i != j:
                G.add_edge(f"bank1_acc_{i}", f"bank1_acc_{j}", key=f"e1_{i}_{j}", amount=1000.0)

    for i in range(5):
        G.add_node(f"bank2_acc_{i}", bank_id="B2")
        for j in range(5):
            if i != j:
                G.add_edge(f"bank2_acc_{i}", f"bank2_acc_{j}", key=f"e2_{i}_{j}", amount=2000.0)

    # 1 bridge edge
    G.add_edge("bank1_acc_0", "bank2_acc_0", key="bridge", amount=100.0)

    engine = LouvainCommunityEngine(seed=42)
    res = engine.compute_communities(G)

    assert res["status"] == "READY"
    assert res["total_communities"] >= 2
    assert res["modularity"] > 0.25

    # Check account analysis
    acc_res = engine.analyze_account(G, "bank1_acc_1")
    assert acc_res["community_size"] == 5
    assert acc_res["internal_density"] >= 0.70
    assert "Community membership reflects graph partition structure" in acc_res["disclaimer"]


def test_isolation_forest_anomaly_engine():
    np.random.seed(42)
    engine = IsolationForestEngine()
    # Normal background population
    normal_dicts = [{f: float(np.random.normal(1.5, 0.2)) for f in FeatureExtractor.FEATURE_NAMES} for _ in range(50)]
    normal_vecs = np.array([FeatureExtractor.to_normalized_vector(d) for d in normal_dicts])
    train_res = engine.train(normal_vecs)
    assert train_res["status"] == "READY"
    assert engine.status == "READY"

    # Inlier sample
    inlier_dict = {f: 1.5 for f in FeatureExtractor.FEATURE_NAMES}
    res_inlier = engine.predict(inlier_dict)
    assert res_inlier["status"] == "READY"
    assert res_inlier["is_outlier"] is False

    # Extreme Outlier sample (velocity, burst, pass-through explosion)
    outlier_dict = {f: 1.5 for f in FeatureExtractor.FEATURE_NAMES}
    outlier_dict["burst_score"] = 50.0
    outlier_dict["total_inflow"] = 1_000_000.0
    outlier_dict["total_outflow"] = 990_000.0
    outlier_dict["pass_through_ratio"] = 0.99

    res_outlier = engine.predict(outlier_dict)
    assert res_outlier["anomaly_score"] > res_inlier["anomaly_score"]
    assert len(res_outlier["top_anomalous_features"]) > 0


def test_graphsage_inductive_classifier():
    gs = GraphSAGEEngine()
    G = nx.MultiDiGraph()
    nodes = [f"node_{i}" for i in range(8)]
    labels = {}
    for i, n in enumerate(nodes):
        G.add_node(n)
        nxt = nodes[(i + 1) % 8]
        G.add_edge(n, nxt, key=f"e_{i}", amount=5000.0)
        labels[n] = 1 if i < 4 else 0

    train_res = gs.train_on_graph(G, labels, train_nodes=nodes, epochs=15)
    assert train_res["status"] == "READY"

    pred = gs.predict(G, "node_0")
    assert pred["status"] == "READY"
    assert 0.0 <= pred["mule_probability"] <= 1.0
    assert 0.0 <= pred["graphsage_risk_score"] <= 100.0


def test_federated_learning_coordinator_and_clients():
    coordinator = FederatedCoordinator()
    clients = _generate_synthetic_bank_clients(seed=42)
    assert len(clients) == 4

    for c in clients:
        coordinator.register_client(c)

    # Verify initial weights broadcast and shape validation
    init_weights = coordinator.get_global_weights()
    assert coordinator.validate_client_weights(init_weights) is True

    # Run 2 Federated Rounds
    round1 = coordinator.run_round(epochs_per_client=2, lr=0.02, dp_clip_norm=1.0, dp_noise_sigma=0.005)
    assert round1["round"] == 1
    assert len(round1["participating_banks"]) == 4
    assert "accuracy" in round1["aggregate_metrics"]
    assert "f1" in round1["aggregate_metrics"]

    round2 = coordinator.run_round(epochs_per_client=2, lr=0.02, dp_clip_norm=1.0, dp_noise_sigma=0.005)
    assert round2["round"] == 2

    # Comparative evaluation: centralized vs federated
    cent_res = coordinator.train_centralized(epochs=4, lr=0.02)
    assert cent_res["status"] == "COMPLETED"
    assert "f1" in cent_res["metrics"]


def test_label_isolation_inference_safety():
    """
    Verifies that runtime detection algorithms never access ground-truth labels.
    """
    engines = [
        LouvainCommunityEngine,
        FeatureExtractor,
        IsolationForestEngine,
        GraphSAGEEngine,
        BankFederatedClient
    ]

    for engine_cls in engines:
        src = inspect.getsource(engine_cls)
        assert "acc.is_mule" not in src, f"{engine_cls.__name__} has ground-truth leakage"
        assert "account.is_mule" not in src, f"{engine_cls.__name__} has ground-truth leakage"
        assert "acc.mule_role" not in src, f"{engine_cls.__name__} has ground-truth leakage"
        assert "account.mule_role" not in src, f"{engine_cls.__name__} has ground-truth leakage"
