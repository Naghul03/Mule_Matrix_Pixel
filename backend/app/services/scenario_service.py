from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.models.models import (
    Scenario, Account, Transaction, TransactionEvent,
    DetectionAlert, AlertEvidence, Investigation, LineageNode, LineageEdge,
    GroundTruthLabel, TransferAllocation
)
from backend.app.simulation.scenarios import (
    SCENARIO_CATALOGUE, ScenarioEngine, register_scenario_catalogue
)
from backend.app.services.detection_service import DetectionService
from backend.app.services.event_service import event_bus
from backend.app.core.errors import ResourceNotFoundError

class ScenarioService:
    @staticmethod
    def get_all_scenarios(db: Session) -> List[Dict[str, Any]]:
        register_scenario_catalogue(db)
        scenarios = db.query(Scenario).all()
        # Strictly return metadata only - NO ground-truth labels
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "scenario_type": s.scenario_type,
                "seed": s.seed,
                "parameters_json": s.parameters_json
            }
            for s in scenarios
        ]

    @staticmethod
    def run_scenario(db: Session, scenario_id: str, custom_seed: Optional[int] = None) -> Dict[str, Any]:
        result = ScenarioEngine.run_scenario(db, scenario_id, custom_seed)
        
        # After generating transfers, run detection across involved transactions
        recent_txs = db.query(Transaction).filter(Transaction.scenario_id == scenario_id).all()
        generated_alerts = []
        for tx in recent_txs:
            alerts = DetectionService.process_transaction_detection(db, tx)
            generated_alerts.extend(alerts)

        event_bus.publish_nowait("SIMULATION_STEP", {
            "scenario_id": scenario_id,
            "transactions_posted": len(recent_txs),
            "alerts_raised": len(generated_alerts),
            "root_account_id": result.get("root_account_id")
        })

        return {
            "scenario_id": scenario_id,
            "transactions_count": len(recent_txs),
            "alerts_generated": len(generated_alerts),
            "root_account_id": result.get("root_account_id"),
            "status": "COMPLETED"
        }

    @staticmethod
    def reset_simulation(db: Session) -> Dict[str, str]:
        """
        Clears transactions, events, alerts, and investigations for a clean slate.
        Preserves synthetic banks and accounts with reset balances.
        """
        db.query(LineageEdge).delete()
        db.query(LineageNode).delete()
        db.query(Investigation).delete()
        db.query(AlertEvidence).delete()
        db.query(DetectionAlert).delete()
        db.query(TransferAllocation).delete()
        db.query(TransactionEvent).delete()
        db.query(Transaction).delete()
        db.query(GroundTruthLabel).delete()

        # Reset account risk states and restore balances
        for acc in db.query(Account).all():
            acc.risk_state = "NORMAL"
            acc.balance_minor = 10000000 # ₹1,00,000 standard initial

        db.commit()

        event_bus.publish_nowait("SIMULATION_RESET", {
            "timestamp": "reset_complete"
        })

        return {"status": "SUCCESS", "message": "Simulation ledger and investigation state reset to clean baseline."}
