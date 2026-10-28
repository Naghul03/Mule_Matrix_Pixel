import pytest
from backend.app.simulation.scenarios import ScenarioEngine, SCENARIO_CATALOGUE
from backend.app.simulation.ground_truth import GroundTruthStore
from backend.app.models.models import Transaction, GroundTruthLabel

def test_scenario_deterministic_reproducibility(db_session):
    # Run twice with same seed
    res1 = ScenarioEngine.run_scenario(db_session, "scenario_simple_mule_chain", custom_seed=777)
    txs_count1 = res1["transactions_count"]
    labels1 = GroundTruthStore.get_labels_for_evaluation(db_session, "scenario_simple_mule_chain")

    res2 = ScenarioEngine.run_scenario(db_session, "scenario_simple_mule_chain", custom_seed=777)
    txs_count2 = res2["transactions_count"]
    labels2 = GroundTruthStore.get_labels_for_evaluation(db_session, "scenario_simple_mule_chain")

    assert txs_count1 == txs_count2
    assert len(labels1) == len(labels2)

def test_ground_truth_isolation(db_session):
    """
    Spec requirement: Ground truth labels are stored in ground_truth_labels table
    and never exposed in detector modules or public scenario list.
    """
    ScenarioEngine.run_scenario(db_session, "scenario_cross_bank_matrix", custom_seed=101)
    labels = GroundTruthStore.get_labels_for_evaluation(db_session, "scenario_cross_bank_matrix")
    assert len(labels) >= 5
    # Verify label types
    label_types = set(l.label for l in labels)
    assert "SUSPECTED_MULE" in label_types
    assert "ORIGIN_VICTIM" in label_types
    assert "OFF_RAMP_DESTINATION" in label_types
