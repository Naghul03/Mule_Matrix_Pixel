export interface Bank {
  id: string;
  name: string;
  bank_code: string;
  created_at: string;
}

export interface Account {
  id: string;
  bank_id: string;
  bank_name?: string;
  bank_code?: string;
  account_ref: string;
  account_type: string;
  opened_at: string;
  status: string;
  risk_state: string;
  balance_minor: number;
}

export interface AccountDetail extends Account {
  inbound_tx_count: number;
  outbound_tx_count: number;
  total_inbound_minor: number;
  total_outbound_minor: number;
  alert_count: number;
  active_alerts: Array<{ id: string; risk_score: number; severity: string; status: string }>;
}

export interface Transaction {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  source_account_ref: string;
  source_bank_code: string;
  destination_account_ref: string;
  destination_bank_code: string;
  amount_minor: number;
  currency: string;
  rail: string;
  status: string;
  memo?: string;
  initiated_at: string;
  posted_at?: string;
  reversal_of_id?: string;
  idempotency_key?: string;
  is_cross_bank: boolean;
}

export interface TransactionCreatePayload {
  source_account_id: string;
  destination_account_id: string;
  amount_minor: number;
  currency?: string;
  rail?: string;
  memo?: string;
  idempotency_key?: string;
  scenario_id?: string;
}

export interface AlertEvidence {
  id: string;
  rule_code: string;
  observed_value: string;
  threshold: string;
  explanation: string;
  related_transaction_ids?: string[];
}

export interface DetectionAlert {
  id: string;
  account_id: string;
  account_ref: string;
  bank_code: string;
  trigger_transaction_id?: string;
  risk_score: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "REVIEWED" | "DISMISSED" | "ESCALATED";
  detector_version: string;
  created_at: string;
  rules_triggered: string[];
  evidence_count: number;
}

export interface DetectionAlertDetail extends DetectionAlert {
  evidence: AlertEvidence[];
  related_transactions: Transaction[];
}

export interface LineageNode {
  id: string;
  account_id: string;
  account_ref: string;
  bank_id: string;
  bank_code: string;
  bank_name: string;
  account_type: string;
  direction: "ROOT" | "BACKWARD" | "FORWARD" | "BOTH";
  hop_depth: number;
  amount_attributed_minor: number;
  evidence_type: string;
  uncertainty: number;
  is_off_ramp: boolean;
  is_origin: boolean;
  risk_state: string;
}

export interface LineageEdge {
  id: string;
  transaction_id: string;
  source_account_id: string;
  destination_account_id: string;
  source_account_ref: string;
  destination_account_ref: string;
  source_bank_code: string;
  destination_bank_code: string;
  amount_minor: number;
  direction: "BACKWARD" | "FORWARD";
  hop_depth: number;
  allocation_method: string;
  confidence: number;
  posted_at?: string;
  rail: string;
  is_cross_bank: boolean;
}

export interface InvestigationDetail {
  id: string;
  alert_id?: string;
  root_account_id: string;
  root_account_ref: string;
  root_bank_code: string;
  started_at: string;
  completed_at?: string;
  status: string;
  stop_reason: string;
  config_json: {
    lookback_hours: number;
    lookahead_hours: number;
    max_hops: number;
    max_nodes: number;
  };
  summary_metrics_json: {
    accounts_discovered: number;
    banks_crossed: number;
    transactions_traversed: number;
    max_hop_depth: number;
    off_ramps_found: number;
    origins_found: number;
    avg_confidence: number;
    stop_reason: string;
  };
  nodes: LineageNode[];
  edges: LineageEdge[];
  candidate_paths: string[][];
  timeline: Array<{
    timestamp: string;
    transaction_id: string;
    source_account_ref: string;
    source_bank_code: string;
    destination_account_ref: string;
    destination_bank_code: string;
    amount_minor: number;
    direction: string;
    hop_depth: number;
    confidence: number;
    allocation_method: string;
    rail: string;
    memo?: string;
  }>;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  scenario_type: string;
  seed: number;
}

export interface EvaluationMetrics {
  precision: number;
  recall: number;
  f1: number;
  false_positive_rate: number;
  lineage_edge_recovery: number;
  stop_reason_accuracy: number;
  avg_runtime_ms: number;
  total_accounts_evaluated: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
}

export interface EvaluationComparison {
  evaluation_id: string;
  timestamp: string;
  scenarios_evaluated: number;
  seeds_evaluated: number;
  baseline_metrics: EvaluationMetrics;
  candidate_metrics: EvaluationMetrics;
  relative_f1_delta_pct: number;
  relative_fp_reduction_pct: number;
  scenario_breakdowns: Array<{
    scenario_id: string;
    ground_truth_mules: number;
    ground_truth_legitimate: number;
    baseline_detected: number;
    candidate_detected: number;
    baseline_fp: number;
    candidate_fp: number;
  }>;
}

export interface AppSettings {
  detector_version: string;
  pass_through_ratio_threshold: number;
  pass_through_window_minutes: number;
  velocity_burst_count: number;
  velocity_burst_window_minutes: number;
  fan_in_min_counterparties: number;
  fan_out_min_counterparties: number;
  retention_min_pct: number;
  retention_max_pct: number;
  risk_alert_threshold: number;
  lookback_hours: number;
  lookahead_hours: number;
  max_hops: number;
  max_nodes: number;
}
