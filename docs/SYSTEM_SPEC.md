# Mule Matrix: System Specification & Architecture

## 1. System Mission
Mule Matrix is an explainable, simulation-first system for detecting suspected mule accounts and reconstructing multi-hop cross-bank transaction lineage. It addresses the critical challenge in fraud operations: following illicit funds through complex splits, merges, rapid pass-through bursts, cycles, and cross-institutional hops, with complete transparency into detection reasons and algorithmic traversal constraints.

## 2. Core Pillars
1. **Explainable Detection**: No account is ever flagged without explicit, inspectable signals, exact evidence windows, contributing rules, and bounded risk contribution scores.
2. **Deterministic Bounded Lineage Traversal**: Bounded backward and forward BFS graph exploration respecting lookback/lookahead temporal horizons, maximum hop budgets, cycle avoidance (composite state keys), and split/merge amount attribution.
3. **Explicit Uncertainty & Stop Reasons**: When a trace finishes, it explicitly reports one of the machine-readable stop reasons (`OFF_RAMP_REACHED`, `NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS`, `LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED`, `MAX_HOPS_REACHED`, `MAX_NODES_OR_EDGES_REACHED`, `AMBIGUOUS_AMOUNT_ATTRIBUTION`, `INVESTIGATION_CANCELLED`).
4. **Honesty Boundaries**: All data is synthetic; cross-bank visibility is provided by a shared simulation event ledger. Ground truth is isolated and strictly hidden from detector runtime.

## 3. Data Integrity & Ledger Rules
- Immutable transactions: Only settled/posted transactions count as funds movement.
- Reversals create linked adjustment events without rewriting history.
- Amounts stored in minor currency units (paise, INR) as 64-bit integers.
- Unique idempotency keys on every transaction submission.
- Self-transfers rejected by constraint.
