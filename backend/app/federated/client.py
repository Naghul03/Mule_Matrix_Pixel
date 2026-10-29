"""
Federated Learning Architecture & Privacy Module for Multi-Bank Mule Detection.
Simulates decentralized collaborative learning across simulated banking nodes
without centrally pooling raw customer transaction records.
"""

from typing import Dict, Any, List, Optional, Tuple
import copy
import math
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class MuleRiskClassifier(nn.Module):
    """
    Standardized multi-layer neural classifier for account mule risk.
    Compatible across all participating simulated banking institutions.
    Input: 12-dimensional normalized topological & velocity feature vector.
    """
    def __init__(self, in_dim: int = 12, hidden_dim: int = 16, out_dim: int = 1):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, out_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.relu(self.fc1(x))
        return torch.sigmoid(self.fc2(h))

    def get_logits(self, x: torch.Tensor) -> torch.Tensor:
        h = self.relu(self.fc1(x))
        return self.fc2(h)


class BankFederatedClient:
    """
    Simulated local bank client (e.g. Bank of Baroda, HDFC, ICICI, SBI).
    Maintains strictly local transaction records and training partitions.
    """
    def __init__(
        self,
        bank_id: str,
        bank_name: str,
        train_x: np.ndarray,
        train_y: np.ndarray,
        test_x: np.ndarray,
        test_y: np.ndarray
    ):
        self.bank_id = bank_id
        self.bank_name = bank_name
        # Local data strictly preserved within the simulated bank boundary
        self._train_x = train_x
        self._train_y = train_y
        self._test_x = test_x
        self._test_y = test_y
        self.num_samples = len(train_x)
        self.last_round_loss: float = 0.0

    def local_train(
        self,
        global_state_dict: Dict[str, torch.Tensor],
        epochs: int = 3,
        lr: float = 0.02,
        dp_clip_norm: float = 1.0,
        dp_noise_sigma: float = 0.01
    ) -> Dict[str, Any]:
        """
        Executes local SGD training on private bank data.
        Returns ONLY updated model weights and sample count.
        Raw records NEVER leave this client boundary.
        """
        model = MuleRiskClassifier()
        model.load_state_dict(copy.deepcopy(global_state_dict))
        model.train()

        x = torch.tensor(self._train_x, dtype=torch.float32)
        y = torch.tensor(self._train_y, dtype=torch.float32).unsqueeze(1)

        pos_count = max(1, int(torch.sum(y).item()))
        neg_count = max(1, len(y) - pos_count)
        pos_weight = torch.tensor([neg_count / pos_count], dtype=torch.float32)
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        optimizer = torch.optim.Adam(model.parameters(), lr=lr)

        avg_loss = 0.0
        for _ in range(epochs):
            optimizer.zero_grad()
            logits = model.get_logits(x)
            loss = criterion(logits, y)
            loss.backward()

            # Differential Privacy Gradient Clipping
            if dp_clip_norm > 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=dp_clip_norm)

            optimizer.step()
            avg_loss = float(loss.item())

        # Differential Privacy Gaussian Weight Perturbation
        updated_weights = {}
        for k, v in model.state_dict().items():
            tensor_copy = v.clone().detach()
            if dp_noise_sigma > 0:
                noise = torch.randn_like(tensor_copy) * dp_noise_sigma
                tensor_copy = tensor_copy + noise
            updated_weights[k] = tensor_copy

        self.last_round_loss = round(avg_loss, 4)

        return {
            "bank_id": self.bank_id,
            "weights": updated_weights,
            "num_samples": self.num_samples,
            "local_loss": self.last_round_loss
        }

    def evaluate(self, state_dict: Dict[str, torch.Tensor]) -> Dict[str, float]:
        """
        Evaluates a model checkpoint against the bank's local test partition.
        """
        model = MuleRiskClassifier()
        model.load_state_dict(state_dict)
        model.eval()

        if len(self._test_x) == 0:
            return {"loss": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0, "accuracy": 1.0}

        x = torch.tensor(self._test_x, dtype=torch.float32)
        y = torch.tensor(self._test_y, dtype=torch.float32).unsqueeze(1)

        with torch.no_grad():
            probs = model(x).squeeze(1).numpy()
            labels = self._test_y

        preds = (probs >= 0.5).astype(int)

        tp = int(np.sum((preds == 1) & (labels == 1)))
        fp = int(np.sum((preds == 1) & (labels == 0)))
        fn = int(np.sum((preds == 0) & (labels == 1)))
        tn = int(np.sum((preds == 0) & (labels == 0)))

        acc = (tp + tn) / max(1, len(labels))
        prec = tp / max(1, tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / max(1, tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / max(1e-6, prec + rec) if (prec + rec) > 0 else 0.0

        return {
            "accuracy": round(float(acc), 4),
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1": round(float(f1), 4),
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn
        }

