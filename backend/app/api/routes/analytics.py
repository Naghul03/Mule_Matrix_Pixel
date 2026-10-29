"""
Analytics API Router for Mule Matrix.
Exposes Louvain Community Detection, Isolation Forest Anomaly Detection,
and GraphSAGE Inductive Neighborhood Classification.
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import numpy as np

from backend.app.db.session import get_db
from backend.app.models.models import Account, Transaction
from backend.app.detection.community import LouvainCommunityEngine
from backend.app.detection.anomaly import FeatureExtractor, IsolationForestEngine
from backend.app.detection.graphsage import GraphSAGEEngine

router = APIRouter(prefix="/analytics", tags=["Graph Analytics & ML"])

# Singletons for caching and runtime inference
_community_engine = LouvainCommunityEngine(seed=42)
_iso_engine = IsolationForestEngine()
_graphsage_engine = GraphSAGEEngine()


@router.get("/communities", response_model=Dict[str, Any])
def get_graph_communities(
    resolution: float = Query(1.0, ge=0.1, le=5.0),
    db: Session = Depends(get_db)
):
    """
    Computes and returns Louvain modularity partitions across multi-bank transaction graph.
    """
    engine = LouvainCommunityEngine(seed=42, resolution=resolution)
    G = engine.build_graph_from_db(db)
    partition_res = engine.compute_communities(G)
    summaries = engine.get_all_communities_summary(G)

    return {
        "status": partition_res["status"],
        "modularity": partition_res["modularity"],
        "total_communities": partition_res["total_communities"],
        "communities": summaries,
        "disclaimer": "Community membership reflects graph partition structure, not conclusive proof of fraud."
    }


@router.get("/account/{account_id}/community", response_model=Dict[str, Any])
def get_account_community(
    account_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns Louvain community membership, size, and internal density for a specific account.
    """
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    G = _community_engine.build_graph_from_db(db)
    analysis = _community_engine.analyze_account(G, account_id)
    return {
        "account_id": account_id,
        "account_ref": acc.account_ref,
        "analysis": analysis
    }


@router.get("/account/{account_id}/anomaly", response_model=Dict[str, Any])
def get_account_anomaly(
    account_id: str,
    db: Session = Depends(get_db)
):
    """
    Calculates 12-dimensional topological features and runs Isolation Forest anomaly detection.
    """
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    G = _community_engine.build_graph_from_db(db)
    features = FeatureExtractor.extract_features(G, account_id)
    pred = _iso_engine.predict(features)

    return {
        "account_id": account_id,
        "features": features,
        "anomaly_result": pred
    }


@router.get("/account/{account_id}/graphsage", response_model=Dict[str, Any])
def get_account_graphsage(
    account_id: str,
    db: Session = Depends(get_db)
):
    """
    Runs 2-layer GraphSAGE neighborhood aggregation inference for a specific account.
    """
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    G = _community_engine.build_graph_from_db(db)
    pred = _graphsage_engine.predict(G, account_id)

    return {
        "account_id": account_id,
        "account_ref": acc.account_ref,
        "graphsage_result": pred
    }


@router.post("/anomaly/train", response_model=Dict[str, Any])
def train_anomaly_detector(db: Session = Depends(get_db)):
    """
    Trains the Isolation Forest engine on active accounts in the database.
    """
    G = _community_engine.build_graph_from_db(db)
    accounts = db.query(Account).all()
    if len(accounts) < 10:
        return {"status": "FAILED", "reason": "At least 10 accounts required for Isolation Forest training."}

    vectors = []
    for acc in accounts:
        f = FeatureExtractor.extract_features(G, acc.id)
        v = FeatureExtractor.to_normalized_vector(f)
        vectors.append(v)

    res = _iso_engine.train(np.array(vectors))
    return res


@router.post("/graphsage/train", response_model=Dict[str, Any])
def train_graphsage_detector(
    epochs: int = Query(20, ge=5, le=100),
    db: Session = Depends(get_db)
):
    """
    Trains the PyTorch GraphSAGE model on active accounts with available risk indicators.
    """
    G = _community_engine.build_graph_from_db(db)
    accounts = db.query(Account).all()
    if len(accounts) < 10:
        return {"status": "FAILED", "reason": "At least 10 accounts required for GraphSAGE training."}

    labels = {acc.id: 1 if getattr(acc.risk_state, "value", str(acc.risk_state)) in ("HIGH", "CRITICAL") else 0 for acc in accounts}
    train_nodes = [acc.id for acc in accounts]

    # Ensure both pos and neg exist
    pos_count = sum(labels.values())
    if pos_count == 0:
        # Mark first 2 as synthetic positives if none flagged
        for acc in accounts[:2]:
            labels[acc.id] = 1

    res = _graphsage_engine.train_on_graph(G, labels, train_nodes, epochs=epochs)
    return res
