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
from backend.app.detection.scoring import DetectionEngine
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
        
        # After generating transfers, run detection across involved unique accounts
        recent_txs = (
            db.query(Transaction)
            .filter(Transaction.scenario_id == scenario_id)
            .order_by(Transaction.initiated_at.asc())
            .all()
        )
        involved_account_ids = []
        for tx in recent_txs:
            if tx.destination_account_id not in involved_account_ids:
                involved_account_ids.append(tx.destination_account_id)
            if tx.source_account_id not in involved_account_ids:
                involved_account_ids.append(tx.source_account_id)

        generated_alerts = []
        seen_alert_ids = set()
        for acc_id in involved_account_ids:
            acc = db.query(Account).filter(Account.id == acc_id).first()
            if acc:
                alert = DetectionEngine.evaluate_account(db, acc)
                if alert and alert.id not in seen_alert_ids:
                    seen_alert_ids.add(alert.id)
                    generated_alerts.append(alert)

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
