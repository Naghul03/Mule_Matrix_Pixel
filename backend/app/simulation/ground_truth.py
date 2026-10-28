"""
GROUND TRUTH ISOLATION BOUNDARY
This module MUST NOT be imported or referenced by any detection or lineage code.
Only the scenario generator (to write labels) and the evaluation service (to score accuracy)
may access ground-truth records.
"""
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
import uuid

from backend.app.models.models import GroundTruthLabel

class GroundTruthStore:
    @staticmethod
    def record_label(
        db: Session,
        scenario_id: str,
        account_id: str,
        label: str, # SUSPECTED_MULE, LEGITIMATE, ORIGIN_VICTIM, OFF_RAMP_DESTINATION
        role: Optional[str] = None,
        source_funds_id: Optional[str] = None
    ) -> GroundTruthLabel:
        gt = GroundTruthLabel(
            id=str(uuid.uuid4()),
            scenario_id=scenario_id,
            account_id=account_id,
            label=label,
            role=role,
            source_funds_id=source_funds_id
        )
        db.add(gt)
        return gt

    @staticmethod
    def get_labels_for_evaluation(db: Session, scenario_id: str) -> List[GroundTruthLabel]:
        """
        Only called by evaluation_service to compute precision, recall, and false positive rates.
        """
        return db.query(GroundTruthLabel).filter(GroundTruthLabel.scenario_id == scenario_id).all()
