"""
Federated Learning API Router for Mule Matrix.
Supports simulated multi-bank decentralized training, FedAvg aggregation,
differential privacy parameterization, and side-by-side comparative benchmarks.
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.federated.client import BankFederatedClient
from backend.app.federated.coordinator import FederatedCoordinator
from backend.app.federated.privacy import PrivacySpecification, build_bank_federated_clients

router = APIRouter(prefix="/federated", tags=["Federated Multi-Bank Learning"])

# Singleton coordinator instance
_coordinator = FederatedCoordinator()


class FederatedTrainRequest(BaseModel):
    num_rounds: int = 5
    epochs_per_client: int = 2
    learning_rate: float = 0.02
    dp_clip_norm: float = 1.0
    dp_noise_sigma: float = 0.005


@router.get("/privacy", response_model=Dict[str, Any])
def get_privacy_specification():
    """
    Returns formal privacy specifications, data isolation guarantees, and threat models.
    """
    return PrivacySpecification.get_privacy_report()


@router.get("/status", response_model=Dict[str, Any])
def get_federated_status(db: Session = Depends(get_db)):
    """
    Returns the current state of the federated coordinator, registered clients, and training history.
    """
    # Ensure clients are registered from the DB
    if not _coordinator.clients:
        clients = build_bank_federated_clients(db)
        for c in clients:
            _coordinator.register_client(c)

    return {
        "current_round": _coordinator.current_round,
        "registered_banks": [
            {"bank_id": c.bank_id, "bank_name": c.bank_name, "training_samples": c.num_samples}
            for c in _coordinator.clients.values()
        ],
        "total_rounds_executed": len(_coordinator.training_history),
        "latest_round_summary": _coordinator.training_history[-1] if _coordinator.training_history else None
    }


@router.post("/train", response_model=Dict[str, Any])
def train_federated_model(
    req: FederatedTrainRequest,
    db: Session = Depends(get_db)
):
    """
    Executes decentralized federated training across registered simulated banks using FedAvg and DP.
    """
    if not _coordinator.clients:
        clients = build_bank_federated_clients(db)
        for c in clients:
            _coordinator.register_client(c)

    res = _coordinator.train_federated(
        num_rounds=req.num_rounds,
        epochs_per_client=req.epochs_per_client,
        lr=req.learning_rate,
        dp_clip_norm=req.dp_clip_norm,
        dp_noise_sigma=req.dp_noise_sigma
    )
    return res


@router.post("/compare", response_model=Dict[str, Any])
def compare_centralized_vs_federated(
    rounds: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db)
):
    """
    Runs a side-by-side evaluation comparing centralized pooled training vs federated multi-bank training.
    """
    if not _coordinator.clients:
        clients = build_bank_federated_clients(db)
        for c in clients:
            _coordinator.register_client(c)

    # 1. Run Federated Training
    fed_res = _coordinator.train_federated(num_rounds=rounds, epochs_per_client=2, lr=0.02)

    # 2. Run Centralized Training Baseline
    cent_res = _coordinator.train_centralized(epochs=rounds * 2, lr=0.02)

    fed_metrics = fed_res.get("final_metrics", {})
    cent_metrics = cent_res.get("metrics", {})

    return {
        "evaluation_title": "Multi-Bank Centralized vs Federated Model Comparison",
        "participating_banks_count": len(_coordinator.clients),
        "federated_results": {
            "rounds": rounds,
            "metrics": fed_metrics,
            "privacy_guarantee": "Decentralized FedAvg with DP gradient clipping. Raw records stay local."
        },
        "centralized_results": {
            "epochs": rounds * 2,
            "metrics": cent_metrics,
            "privacy_guarantee": "None (Requires pooling raw customer data into single central repository)."
        },
        "comparison_delta": {
            "f1_difference": round(fed_metrics.get("f1", 0.0) - cent_metrics.get("f1", 0.0), 4),
            "precision_difference": round(fed_metrics.get("precision", 0.0) - cent_metrics.get("precision", 0.0), 4),
            "recall_difference": round(fed_metrics.get("recall", 0.0) - cent_metrics.get("recall", 0.0), 4),
            "utility_retention_pct": round((fed_metrics.get("f1", 0.0) / max(1e-4, cent_metrics.get("f1", 0.0))) * 100.0, 1)
        }
    }
