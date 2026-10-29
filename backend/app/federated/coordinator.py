"""
Federated Coordinator and FedAvg Aggregation Engine.
Orchestrates multi-bank collaborative training rounds, performs model validation,
FedAvg weight aggregation, round logging, and comparative benchmark evaluation.
"""

from typing import Dict, Any, List, Optional
import copy
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn

from backend.app.federated.client import BankFederatedClient, MuleRiskClassifier


class FederatedCoordinator:
    """
    Central aggregation coordinator for federated learning across simulated banks.
    Enforces privacy boundary: only model weight updates and sample counts are received.
    """

    def __init__(self, in_dim: int = 12, hidden_dim: int = 16, checkpoint_dir: Optional[Path] = None):
        self.in_dim = in_dim
        self.hidden_dim = hidden_dim
        base_dir = Path(__file__).resolve().parent.parent.parent
        self.checkpoint_dir = checkpoint_dir or (base_dir / "data" / "models" / "federated")
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.global_model = MuleRiskClassifier(in_dim=in_dim, hidden_dim=hidden_dim, out_dim=1)
        self.clients: Dict[str, BankFederatedClient] = {}
        self.training_history: List[Dict[str, Any]] = []
        self.current_round: int = 0

    def register_client(self, client: BankFederatedClient):
        self.clients[client.bank_id] = client

    def get_global_weights(self) -> Dict[str, torch.Tensor]:
        return copy.deepcopy(self.global_model.state_dict())

    def validate_client_weights(self, client_weights: Dict[str, torch.Tensor]) -> bool:
        """
        Validates that client weight tensors match global model parameter shapes.
        """
        global_sd = self.global_model.state_dict()
        if set(client_weights.keys()) != set(global_sd.keys()):
            return False
        for k in global_sd:
            if client_weights[k].shape != global_sd[k].shape:
                return False
        return True

    def aggregate_fedavg(self, client_updates: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        """
        Implements Federated Averaging (FedAvg):
        theta_global = sum_{k=1}^K (n_k / N) * theta_k
        """
        valid_updates = [u for u in client_updates if self.validate_client_weights(u["weights"])]
        if not valid_updates:
            return self.get_global_weights()

        total_samples = sum(u["num_samples"] for u in valid_updates)
        if total_samples <= 0:
            return self.get_global_weights()

        aggregated_dict = {}
        first_weights = valid_updates[0]["weights"]

        for key in first_weights:
            running_tensor = torch.zeros_like(first_weights[key], dtype=torch.float32)
            for upd in valid_updates:
                weight_factor = float(upd["num_samples"]) / float(total_samples)
                running_tensor += upd["weights"][key].float() * weight_factor
            aggregated_dict[key] = running_tensor

        return aggregated_dict

    def run_round(
        self,
        epochs_per_client: int = 2,
        lr: float = 0.02,
        dp_clip_norm: float = 1.0,
        dp_noise_sigma: float = 0.005
    ) -> Dict[str, Any]:
        """
        Runs a single federated training round across all registered bank clients.
        """
        if not self.clients:
            return {"status": "FAILED", "reason": "No registered bank clients."}

        self.current_round += 1
        current_global_weights = self.get_global_weights()

        # Step 1: Broadcast weights to clients & train locally
        client_updates = []
        for bank_id, client in self.clients.items():
            upd = client.local_train(
                global_state_dict=current_global_weights,
                epochs=epochs_per_client,
                lr=lr,
                dp_clip_norm=dp_clip_norm,
                dp_noise_sigma=dp_noise_sigma
            )
            client_updates.append(upd)

        # Step 2: FedAvg Aggregation on coordinator
        new_global_weights = self.aggregate_fedavg(client_updates)
        self.global_model.load_state_dict(new_global_weights)

        # Step 3: Evaluate new global weights across banks
        per_bank_metrics = {}
        total_tp = 0
        total_fp = 0
        total_fn = 0
        total_tn = 0

        for bank_id, client in self.clients.items():
            m = client.evaluate(new_global_weights)
            per_bank_metrics[bank_id] = m
            total_tp += m["tp"]
            total_fp += m["fp"]
            total_fn += m["fn"]
            total_tn += m["tn"]

        agg_acc = (total_tp + total_tn) / max(1, total_tp + total_tn + total_fp + total_fn)
        agg_prec = total_tp / max(1, total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
        agg_rec = total_tp / max(1, total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
        agg_f1 = (2 * agg_prec * agg_rec) / max(1e-6, agg_prec + agg_rec) if (agg_prec + agg_rec) > 0 else 0.0

        avg_loss = float(np.mean([u["local_loss"] for u in client_updates]))

        round_summary = {
            "round": self.current_round,
            "participating_banks": list(self.clients.keys()),
            "total_training_samples": sum(u["num_samples"] for u in client_updates),
            "average_local_loss": round(avg_loss, 4),
            "aggregate_metrics": {
                "accuracy": round(float(agg_acc), 4),
                "precision": round(float(agg_prec), 4),
                "recall": round(float(agg_rec), 4),
                "f1": round(float(agg_f1), 4)
            },
            "per_bank_metrics": per_bank_metrics,
            "privacy_parameters": {
                "dp_clip_norm": dp_clip_norm,
                "dp_noise_sigma": dp_noise_sigma,
                "protocol": "FedAvg + Differential Privacy"
            }
        }
        self.training_history.append(round_summary)

        # Save checkpoint
        ckpt_path = self.checkpoint_dir / f"fed_model_round_{self.current_round}.pt"
        torch.save(new_global_weights, ckpt_path)

        return round_summary

    def train_federated(
        self,
        num_rounds: int = 5,
        epochs_per_client: int = 2,
        lr: float = 0.02,
        dp_clip_norm: float = 1.0,
        dp_noise_sigma: float = 0.005
    ) -> Dict[str, Any]:
        """
        Executes a full federated training loop across specified rounds.
        """
        history = []
        for _ in range(num_rounds):
            res = self.run_round(
                epochs_per_client=epochs_per_client,
                lr=lr,
                dp_clip_norm=dp_clip_norm,
                dp_noise_sigma=dp_noise_sigma
            )
            history.append(res)

        final_round = history[-1] if history else {}
        return {
            "status": "COMPLETED",
            "total_rounds": len(history),
            "rounds_history": history,
            "final_metrics": final_round.get("aggregate_metrics", {}),
            "per_bank_metrics": final_round.get("per_bank_metrics", {})
        }

    def train_centralized(self, epochs: int = 10, lr: float = 0.02) -> Dict[str, Any]:
        """
        Simulates centralized pooled training for comparative baseline evaluation.
        Combines all bank datasets into a single pooled matrix (privacy-violating scenario).
        """
        if not self.clients:
            return {"status": "FAILED", "reason": "No registered clients."}

        all_train_x = []
        all_train_y = []
        all_test_x = []
        all_test_y = []

        for c in self.clients.values():
            if len(c._train_x) > 0:
                all_train_x.append(c._train_x)
                all_train_y.append(c._train_y)
            if len(c._test_x) > 0:
                all_test_x.append(c._test_x)
                all_test_y.append(c._test_y)

        if not all_train_x:
            return {"status": "FAILED", "reason": "Empty dataset."}

        X_train = np.vstack(all_train_x)
        y_train = np.concatenate(all_train_y)
        X_test = np.vstack(all_test_x)
        y_test = np.concatenate(all_test_y)

        model = MuleRiskClassifier(in_dim=self.in_dim, hidden_dim=self.hidden_dim, out_dim=1)
        x_t = torch.tensor(X_train, dtype=torch.float32)
        y_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)

        pos_count = max(1, int(np.sum(y_train)))
        neg_count = max(1, len(y_train) - pos_count)
        pos_weight = torch.tensor([neg_count / pos_count], dtype=torch.float32)
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        optimizer = torch.optim.Adam(model.parameters(), lr=lr)

        model.train()
        for _ in range(epochs):
            optimizer.zero_grad()
            logits = model.get_logits(x_t)
            loss = criterion(logits, y_t)
            loss.backward()
            optimizer.step()

        model.eval()
        x_val = torch.tensor(X_test, dtype=torch.float32)
        with torch.no_grad():
            probs = model(x_val).squeeze(1).numpy()
        preds = (probs >= 0.5).astype(int)

        tp = int(np.sum((preds == 1) & (y_test == 1)))
        fp = int(np.sum((preds == 1) & (y_test == 0)))
        fn = int(np.sum((preds == 0) & (y_test == 1)))
        tn = int(np.sum((preds == 0) & (y_test == 0)))

        acc = (tp + tn) / max(1, len(y_test))
        prec = tp / max(1, tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / max(1, tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / max(1e-6, prec + rec) if (prec + rec) > 0 else 0.0

        return {
            "status": "COMPLETED",
            "epochs": epochs,
            "total_samples": len(X_train),
            "metrics": {
                "accuracy": round(float(acc), 4),
                "precision": round(float(prec), 4),
                "recall": round(float(rec), 4),
                "f1": round(float(f1), 4)
            }
        }
