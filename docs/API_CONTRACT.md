# Mule Matrix: API Contract

## Base URL
`/api`

## Health & Metadata
- `GET /api/health` -> System health, environment, active detector version, ledger stats.

## Banks & Accounts
- `GET /api/banks` -> List synthetic banks (ID, name, bank code).
- `GET /api/accounts` -> Paginated account search and filtering (query, bank_id, risk_state, status, page, limit).
- `GET /api/accounts/{id}` -> Account profile, current balance, inbound/outbound stats, recent transactions, active alerts.

## Transactions & Ledger
- `POST /api/transactions` -> Submit transfer with idempotency key, source, destination, amount_minor, rail, memo. Returns transaction lifecycle record and any immediate triggered signals.
- `GET /api/transactions` -> Paginated list of transactions with filtering.
- `GET /api/transactions/{id}` -> Transaction detail plus full event history (initiated, pending, posted, reversed).

## Detection & Alerts
- `GET /api/alerts` -> Paginated list of detection alerts (severity, risk score, status, rule triggers).
- `GET /api/alerts/{id}` -> Alert details with full auditable `AlertEvidence` records, threshold comparisons, and related transactions.
- `PATCH /api/alerts/{id}` -> Review actions (e.g. `status`: `REVIEWED`, `DISMISSED`, `ESCALATED`).

## Investigations & Lineage Traversal
- `POST /api/investigations` -> Create investigation from trigger account, transaction, or alert.
- `POST /api/investigations/{id}/trace` -> Execute bounded backward and forward traversal with configurable lookback/lookahead hours, max hops, and budget.
- `GET /api/investigations/{id}` -> Retrieve full investigation graph (nodes, edges, candidate paths, stop reasons, summary metrics).
- `GET /api/investigations/{id}/export` -> Export investigation dossier as structured JSON or print-ready self-contained HTML case report.

## Scenarios & Simulation
- `GET /api/scenarios` -> List all 20 scenario definitions (name, category, description, complexity). Note: Ground truth is hidden from this endpoint.
- `POST /api/scenarios/{id}/run` -> Reset state and execute deterministic scenario generator with specified seed.
- `POST /api/simulation/pause` -> Pause real-time event playback.
- `POST /api/simulation/reset` -> Clean reset of simulation ledger.
- `GET /api/events/stream` -> Server-Sent Events (SSE) stream for real-time transactions, detector alerts, and trace progress.

## Evaluation
- `POST /api/evaluations/run` -> Run algorithmic comparison between Baseline rules and Candidate Lineage Engine on held-out seeds.
- `GET /api/evaluations/{id}` -> Evaluation results (Precision, Recall, F1, FPR, Lineage Edge Recovery, Stop Reason Accuracy, Runtime).

## Settings
- `GET /api/settings` -> Current rule weights, alert thresholds, and traversal budgets.
- `PUT /api/settings` -> Update settings and trigger version bump.
