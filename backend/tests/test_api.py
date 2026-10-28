import pytest

def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "metrics" in data

def test_banks_endpoint(client):
    response = client.get("/api/banks")
    assert response.status_code == 200
    banks = response.json()
    assert len(banks) == 8 # 8 synthetic banks

def test_accounts_endpoint(client):
    response = client.get("/api/accounts?limit=10")
    assert response.status_code == 200
    accounts = response.json()
    assert len(accounts) > 0
    assert "account_ref" in accounts[0]
    assert "bank_code" in accounts[0]

def test_post_transaction_api(client):
    accs = client.get("/api/accounts?limit=2").json()
    src, dst = accs[0], accs[1]

    payload = {
        "source_account_id": src["id"],
        "destination_account_id": dst["id"],
        "amount_minor": 5000000,
        "rail": "IMPS",
        "memo": "API test transfer"
    }
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 201
    tx = response.json()
    assert tx["status"] == "POSTED"
    assert tx["amount_minor"] == 5000000

def test_scenarios_and_investigation_workflow(client):
    # 1. Run showcase scenario
    sc_resp = client.post("/api/scenarios/scenario_cross_bank_matrix/run", json={"seed": 101})
    assert sc_resp.status_code == 200
    sc_data = sc_resp.json()
    root_acc_id = sc_data["root_account_id"]

    # 2. Check alerts
    alerts_resp = client.get("/api/alerts")
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    assert len(alerts) > 0

    # 3. Create Investigation
    inv_payload = {
        "root_account_id": root_acc_id,
        "lookback_hours": 72,
        "lookahead_hours": 72
    }
    inv_resp = client.post("/api/investigations", json=inv_payload)
    assert inv_resp.status_code == 201
    inv_data = inv_resp.json()
    assert len(inv_data["nodes"]) > 0
    assert len(inv_data["edges"]) > 0

    # 4. Export HTML report
    export_resp = client.get(f"/api/investigations/{inv_data['id']}/export?format=html")
    assert export_resp.status_code == 200
    assert "text/html" in export_resp.headers["content-type"]
    assert "MULE MATRIX" in export_resp.text

def test_evaluations_run(client):
    payload = {
        "scenario_ids": ["scenario_simple_mule_chain", "scenario_legit_payroll"],
        "seeds": [501]
    }
    eval_resp = client.post("/api/evaluations/run", json=payload)
    assert eval_resp.status_code == 200
    res = eval_resp.json()
    assert "baseline_metrics" in res
    assert "candidate_metrics" in res
    assert res["candidate_metrics"]["precision"] >= 0.0
