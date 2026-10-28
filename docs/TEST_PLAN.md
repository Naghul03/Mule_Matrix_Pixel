# Mule Matrix: Test Plan & Acceptance Matrix

## Overview
This test plan validates all functional and algorithmic requirements outlined in the Mule Matrix specification.

## Test Suites

### 1. Ledger Integrity (`test_ledger.py`)
- **Self-transfers**: Source == Destination rejected with HTTP 422 / LedgerValidationError.
- **Negative/Zero amount**: Transfers with amount <= 0 rejected.
- **Idempotency**: Retrying same idempotency key returns existing transaction without duplicate money movement.
- **Transaction Reversal**: Reversal posts adjustment event and updates effective net flow without deleting historical records.
- **Pending/Failed Exclusions**: Pending/failed transactions are not treated as settled funds movement.

### 2. Detection Rules (`test_detection.py`)
- **Pass-through velocity**: Inbound ₹1,00,000 followed by ₹95,000 outbound within 15 minutes flags `PASS_THROUGH_VELOCITY`.
- **Fan-in / Fan-out**: 10 distinct incoming accounts funneling to 1 account dispersing to 5 accounts flags `FAN_IN_FAN_OUT`.
- **Small retention**: Mule retaining ~5% across repeated transfers triggers `SMALL_RETENTION` evidence.
- **Explainability requirement**: Every generated alert contains at least one auditable `AlertEvidence` row with observed value, threshold, and rule explanation.
- **Lookalike resilience**: High-volume legitimate merchant aggregators and payroll transfers do not trigger false positive mule alerts.

### 3. Lineage Engine Traversal (`test_lineage.py`)
- **Chains**: Correct multi-hop backward/forward reconstruction across synthetic banks.
- **Split & Merge**: Correct allocation candidate bounds and attribution tracking.
- **Cycles**: Traversal safely terminates on circular transaction flows using composite state tracking.
- **No Off-ramp**: Traversal stops with `NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS` or `LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED` and clearly notes no off-ramp was observed.
- **Budgets**: Max hop limit (e.g. 5 hops) triggers `MAX_HOPS_REACHED`.

### 4. Scenario Reproducibility (`test_scenarios.py`)
- Identical random seeds produce byte-identical transaction histories, balances, and ground-truth labels.
- Ground truth isolation: detector modules never import or access `ground_truth.py`.

### 5. API Endpoints (`test_api.py`)
- Health check returns status `healthy`.
- Full workflow: Post transfer -> Alert generated -> Investigation created -> Lineage traced -> Report exported.
