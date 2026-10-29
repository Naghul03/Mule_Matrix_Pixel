import pytest
from starlette.testclient import TestClient

def test_full_demo_walkthrough_workflow(client):
    """
    Executes the exact 7-step Judge Demo Walkthrough end-to-end:
    1. Health check
    2. Simulation reset
    3. Showcase scenario run
    4. Explainable alert inspection
    5. Multi-hop lineage reconstruction with dual tracing
    6. Case dossier export (HTML & JSON)
    7. Algorithmic comparative benchmark evaluation
    """
    # 1. Health
    health = client.get("/api/health").json()
    assert health["status"] == "healthy"
    assert health["metrics"]["banks"] == 8

    # 2. Reset
    reset_res = client.post("/api/simulation/reset").json()
    assert reset_res["status"].upper() == "SUCCESS"

    # 3. Run showcase scenario
    sc_res = client.post("/api/scenarios/scenario_cross_bank_matrix/run", json={"seed": 101}).json()
    assert sc_res["scenario_id"] == "scenario_cross_bank_matrix"
    assert sc_res["transactions_count"] >= 4
    assert sc_res["alerts_generated"] >= 1
    root_acc_id = sc_res["root_account_id"]
    assert root_acc_id is not None

    # 4. Inspect explainable alerts
    alerts = client.get("/api/alerts").json()
    assert len(alerts) >= 1
    target_alert = alerts[0]
    alert_detail = client.get(f"/api/alerts/{target_alert['id']}").json()
    assert len(alert_detail["evidence"]) >= 1
    for ev in alert_detail["evidence"]:
        assert ev["rule_code"] != ""
        assert ev["observed_value"] != ""
        assert ev["threshold"] != ""
        assert ev["explanation"] != ""

    # 5. Dual Lineage Reconstruction
    inv_payload = {
        "root_account_id": root_acc_id,
        "alert_id": target_alert["id"],
        "lookback_hours": 72,
        "lookahead_hours": 72,
        "max_hops": 12
    }
    inv = client.post("/api/investigations", json=inv_payload).json()
    assert inv["status"] == "COMPLETED"
    assert inv["stop_reason"] == "OFF_RAMP_REACHED"
    assert inv["summary_metrics_json"]["banks_crossed"] >= 3
    assert inv["summary_metrics_json"]["off_ramps_found"] >= 1
    assert len(inv["nodes"]) >= 4
    assert len(inv["edges"]) >= 3

    # Verify dual tracing metadata
    assert "attributed_paths" in inv
    assert "candidate_paths" in inv
    for edge in inv["edges"]:
        assert edge["edge_type"] in ["ATTRIBUTED", "CANDIDATE", "EXCLUDED"]

    # 6. Dossier Export
    html_export = client.get(f"/api/investigations/{inv['id']}/export?format=html")
    assert html_export.status_code == 200
    assert "MULE MATRIX" in html_export.text
    assert "Reconstructed Lineage Routes" in html_export.text

    json_export = client.get(f"/api/investigations/{inv['id']}/export?format=json")
    assert json_export.status_code == 200
    assert json_export.json()["format"] == "MULE_MATRIX_CASE_REPORT_V1"

    # 7. Benchmark Evaluation against Baseline
    eval_payload = {
        "scenario_ids": ["scenario_simple_mule_chain", "scenario_split_flow", "scenario_legit_payroll"],
        "seeds": [101]
    }
    eval_res = client.post("/api/evaluations/run", json=eval_payload).json()
    cand = eval_res["candidate_metrics"]
    base = eval_res["baseline_metrics"]

    assert cand["precision"] >= base["precision"]
    assert cand["lineage_edge_recovery"] >= base["lineage_edge_recovery"]
    assert cand["stop_reason_accuracy"] >= base["stop_reason_accuracy"]
