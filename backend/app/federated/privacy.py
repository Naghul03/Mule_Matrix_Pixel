"""
Privacy Guarantees and Multi-Bank Partition Generator for Federated Learning.
Documents formal boundary specifications, data isolation guarantees, and threat models.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
from sqlalchemy.orm import Session

from backend.app.models.models import Bank, Account, Transaction
from backend.app.detection.anomaly import FeatureExtractor
from backend.app.detection.community import LouvainCommunityEngine
from backend.app.federated.client import BankFederatedClient


class PrivacySpecification:
    """
    Formal documentation and enforcement of privacy boundaries in Mule Matrix.
    """

    LOCAL_PRIVATE_DATA = [
        "Raw transaction ledger entries (source, destination, amounts, timestamps)",
        "Raw account KYC data (holder names, account numbers, account types)",
        "Internal bank account balances and credit limits",
        "Raw unaggregated feature matrices"
    ]

    TRANSMITTED_ARTIFACTS = [
        "Model parameter tensors (layer weights & biases) after local training",
        "Sample count n_k for FedAvg weighted aggregation",
        "Locally evaluated loss and F1 summary metrics"
    ]

    PRIVACY_PRESERVING_MECHANISMS = [
        "Decentralized Data Isolation: Raw records never transit external APIs or network sockets",
        "Gradient Norm Clipping: Prevents high-leverage outliers from disproportionately shaping updates",
        "Differential Privacy Perturbation: Configurable Gaussian noise sigma injected into weights",
        "Weighted FedAvg Aggregation: Coordinator operates exclusively over abstract model spaces"
    ]

    REMAINING_THREAT_MODELS = [
        "Gradient Inversion / Reconstruction Attack: A malicious coordinator inspecting raw weight updates could attempt to infer input representations; mitigated via DP noise sigma and high sample counts.",
        "Membership Inference Attack: Attackers probing the model output may test whether a specific account was in the training distribution; mitigated by regularization and dropout.",
        "Collusion: If multiple participating banks collude with the coordinator, unmitigated differential updates might reveal inter-bank anomalies."
    ]

    @classmethod
    def get_privacy_report(cls) -> Dict[str, Any]:
        return {
            "title": "Mule Matrix Federated Multi-Bank Privacy Specification",
            "version": "1.0.0",
            "local_private_data": cls.LOCAL_PRIVATE_DATA,
            "transmitted_artifacts": cls.TRANSMITTED_ARTIFACTS,
            "privacy_preserving_mechanisms": cls.PRIVACY_PRESERVING_MECHANISMS,
            "remaining_threat_models": cls.REMAINING_THREAT_MODELS,
            "compliance_note": "Models decentralized collaboration across simulated banks under Basel/RBI data locality regulations."
        }


def build_bank_federated_clients(db: Session, seed: int = 42) -> List[BankFederatedClient]:
    """
    Builds realistic simulated bank clients partitioned by Bank ID from the current database.
    """
    np.random.seed(seed)
    banks = db.query(Bank).all()
    if not banks:
        # Fallback to simulated default banks if DB is unseeded
        return _generate_synthetic_bank_clients(seed)

    comm_engine = LouvainCommunityEngine(seed=seed)
    G = comm_engine.build_graph_from_db(db)

    clients = []
    for b in banks:
        accs = db.query(Account).filter(Account.bank_id == b.id).all()
        if not accs:
            continue

        feat_list = []
        labels = []
        for acc in accs:
            raw_f = FeatureExtractor.extract_features(G, acc.id)
            v = FeatureExtractor.to_normalized_vector(raw_f)
            feat_list.append(v)
            # Label: 1 if flagged or mule, 0 otherwise
            is_susp = 1 if getattr(acc.risk_state, "value", str(acc.risk_state)) in ("HIGH", "CRITICAL") else 0
            labels.append(is_susp)

        if len(feat_list) < 4:
            # Augment with synthetic accounts for this bank to ensure stable local training
            synth_x, synth_y = _generate_synthetic_samples_for_bank(b.id, count=20)
            X = np.vstack([np.array(feat_list), synth_x]) if feat_list else synth_x
            y = np.concatenate([np.array(labels), synth_y]) if labels else synth_y
        else:
            X = np.array(feat_list)
            y = np.array(labels)

        # 80/20 train/test split
        split_idx = max(2, int(len(X) * 0.8))
        train_x, test_x = X[:split_idx], X[split_idx:]
        train_y, test_y = y[:split_idx], y[split_idx:]

        client = BankFederatedClient(
            bank_id=b.id,
            bank_name=b.name,
            train_x=train_x,
            train_y=train_y,
            test_x=test_x,
            test_y=test_y
        )
        clients.append(client)

    if not clients:
        return _generate_synthetic_bank_clients(seed)

    return clients


def _generate_synthetic_samples_for_bank(bank_id: str, count: int = 30) -> Tuple[np.ndarray, np.ndarray]:
    feats = []
    labels = []
    for i in range(count):
        is_mule = 1 if (i % 4 == 0) else 0
        if is_mule:
            # High burst, high velocity, high pass-through
            vec = [
                np.log1p(np.random.uniform(5, 20)),
                np.log1p(np.random.uniform(5, 20)),
                np.log1p(np.random.uniform(50000, 200000)),
                np.log1p(np.random.uniform(48000, 195000)),
                np.log1p(np.random.uniform(4, 15)),
                np.log1p(np.random.uniform(4, 15)),
                np.random.uniform(0.8, 1.2),
                np.random.uniform(0.4, 0.9),
                np.log1p(np.random.uniform(5, 30)),
                np.log1p(np.random.uniform(10, 40)),
                np.random.uniform(0.85, 0.99),
                np.log1p(np.random.uniform(4, 12))
            ]
        else:
            # Normal retail behavior
            vec = [
                np.log1p(np.random.uniform(1, 4)),
                np.log1p(np.random.uniform(1, 3)),
                np.log1p(np.random.uniform(2000, 25000)),
                np.log1p(np.random.uniform(1000, 15000)),
                np.log1p(np.random.uniform(1, 3)),
                np.log1p(np.random.uniform(1, 2)),
                np.random.uniform(0.3, 0.7),
                np.random.uniform(0.0, 0.2),
                np.log1p(np.random.uniform(2, 6)),
                np.log1p(np.random.uniform(1, 5)),
                np.random.uniform(0.1, 0.6),
                np.log1p(np.random.uniform(1, 2))
            ]
        feats.append(vec)
        labels.append(is_mule)

    return np.array(feats, dtype=np.float32), np.array(labels, dtype=np.int64)


def _generate_synthetic_bank_clients(seed: int = 42) -> List[BankFederatedClient]:
    bank_defs = [
        ("bank-hdfx", "HDFC Simulated Bank"),
        ("bank-icix", "ICICI Simulated Bank"),
        ("bank-sbin", "State Bank of India Simulated"),
        ("bank-axis", "Axis Simulated Bank")
    ]
    clients = []
    for b_id, b_name in bank_defs:
        train_x, train_y = _generate_synthetic_samples_for_bank(b_id, count=40)
        test_x, test_y = _generate_synthetic_samples_for_bank(b_id, count=15)
        clients.append(BankFederatedClient(
            bank_id=b_id,
            bank_name=b_name,
            train_x=train_x,
            train_y=train_y,
            test_x=test_x,
            test_y=test_y
        ))
    return clients
