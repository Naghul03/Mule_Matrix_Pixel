"""
Federated learning package for multi-bank simulated collaboration.
"""
from backend.app.federated.client import BankFederatedClient, MuleRiskClassifier
from backend.app.federated.coordinator import FederatedCoordinator
from backend.app.federated.privacy import PrivacySpecification, build_bank_federated_clients

__all__ = [
    "BankFederatedClient",
    "MuleRiskClassifier",
    "FederatedCoordinator",
    "PrivacySpecification",
    "build_bank_federated_clients"
]
