# MULE MATRIX

> **Explainable Detection of Suspected Mule Accounts & Reconstructing Multi-Hop Cross-Bank Transaction Lineage**

---

## 1. System Overview & Mission
Mule Matrix is a simulation-first, explainable intelligence platform designed to uncover illicit funds movement across multi-bank networks. Rather than flagging accounts arbitrarily or relying on opaque black-box models, Mule Matrix provides:
1. **Explainable Detection**: Every alert includes observable rule signals, precise evidence time-windows, threshold comparisons, and bounded score contributions.
2. **Deterministic Multi-Hop Lineage Reconstruction**: Bounded bidirectional graph traversal over settled movements, tracking funds backward to plausible origins and forward to terminal off-ramps across synthetic institutions.
3. **Explicit Uncertainty & Machine-Readable Stop Reasons**: Traversal halts cleanly with reasons such as `OFF_RAMP_REACHED`, `NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS`, `LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED`, or `MAX_HOPS_REACHED`.
4. **Isolated Ground-Truth Evaluation**: Ground-truth labels are stored strictly outside detector runtime and only accessed by the evaluation harness to measure precision, recall, false positive rates, and edge recovery.

---

## 2. Honesty Boundaries & Non-Goals
- **Synthetic Simulation**: All financial institutions (HDFX, ICIX, SBNX, AXSX, KOTX, PNBX, BOBX, PAYX), accounts, balances, and payment rails are synthetic. No live bank records or personal data are used.
- **Cross-Bank Visibility**: Multi-bank tracking operates on a shared synthetic event ledger provided by the simulation environment.
- **Explainable Review**: Accounts are flagged as "suspected mule" and "requires review"—never declared guilty.

---

## 3. Technology Stack & Architecture
- **Backend**: Python 3.14+, FastAPI, SQLAlchemy 2.0 (Dual-mode: SQLite for zero-friction local execution, PostgreSQL for containerized deployments), Pydantic v2.
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Cytoscape.js for directed graph visualization, Recharts, Lucide Icons.
- **Event Streaming**: Server-Sent Events (SSE) `/api/events/stream` for real-time transaction postings and detector alerts.
- **Dossier Export**: Self-contained printable HTML investigation reports and structured JSON packages.

---

## 4. Quick Start (One-Command Setup)

### Option A: Local Run (Zero Friction - Default)

#### 1. Start the Backend:
```bash
# In project root
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt # or pip install fastapi uvicorn sqlalchemy alembic pytest httpx python-multipart jinja2 pydantic-settings
PYTHONPATH=. ./backend/.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. Start the Frontend:
```bash
# In frontend directory
cd frontend
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

### Option B: Docker Compose (PostgreSQL)
To run with PostgreSQL persistence:
```bash
docker compose up -d db
DATABASE_URL="postgresql+psycopg2://mule_user:mule_pass@localhost:5432/mule_matrix" uvicorn backend.app.main:app --reload
```

---

## 5. Automated Demo Walkthrough for Judges

You can run the full automated verification walkthrough script from your terminal:
```bash
./backend/.venv/bin/python scripts/demo_walkthrough.py
```
This script automatically:
1. Resets the simulation to a clean baseline.
2. Replays the **"Cross-bank split-and-merge mule network"** scenario.
3. Validates observable signal triggers (`PASS_THROUGH_VELOCITY`, `SMALL_RETENTION`, `FAN_IN_FAN_OUT`).
4. Reconstructs multi-hop lineage backward to the origin victim and forward to the cash off-ramp.
5. Saves a printable case report to `sample_case_report.html`.
6. Executes empirical comparative benchmarks comparing Baseline vs Candidate algorithms on held-out seeds.

---

## 6. Primary Frontend Screens
1. **Overview Dashboard**: Real-time summary metric cards, live SSE event feed, recent auditable alerts, and one-click Judge Demo launcher.
2. **Transfer Simulator**: Manual transfer submission with instant balance lookups, scenario playback controls, and live interactive mini-graph.
3. **Network Explorer**: Cytoscape.js graph canvas, bank filtering by institution colors, entity search, and side drawer inspector.
4. **Alerts & Account Risk**: Filterable alerts table, severity badges, observable rule breakdowns, and review actions (Mark Reviewed, Dismiss, Escalate).
5. **Investigation Workspace (Showcase)**: Interactive lineage graph, Combined/Backward/Forward filters, chronological hop timeline, allocation confidence, and case export (HTML/JSON).
6. **Scenario Lab & Evaluation**: Catalogue of all 20 deterministic scenarios, seed tuning, and benchmark evaluation comparing Baseline vs Candidate algorithms with side-by-side confusion matrices.
7. **Settings & Rules**: Configurable detector thresholds, time windows, and traversal hop/node budgets.

---

## 7. Running Backend Tests
Execute the comprehensive test suite (21 unit, integration, and scenario tests):
```bash
PYTHONPATH=. ./backend/.venv/bin/pytest backend/tests/ -v
```
All tests validate ledger immutability, constraint enforcement, detection explainability, cycle safety, no-off-ramp handling, and ground-truth isolation.

---

## 8. License
Prototype developed for evaluation and educational demonstration.
