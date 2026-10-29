from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

# Bank Schemas
class BankBase(BaseModel):
    name: str
    bank_code: str

class BankRead(BankBase):
    id: str
    created_at: datetime
    class Config:
        from_attributes = True

# Account Schemas
class AccountBase(BaseModel):
    account_ref: str
    account_type: str = "INDIVIDUAL"
    status: str = "ACTIVE"
    risk_state: str = "NORMAL"

class AccountRead(AccountBase):
    id: str
    bank_id: str
    bank_name: Optional[str] = None
    bank_code: Optional[str] = None
    balance_minor: int
    opened_at: datetime
    class Config:
        from_attributes = True

class AccountDetailRead(AccountRead):
    inbound_tx_count: int = 0
    outbound_tx_count: int = 0
    total_inbound_minor: int = 0
    total_outbound_minor: int = 0
    alert_count: int = 0
    active_alerts: List[Any] = []

# Transaction Schemas
class TransactionCreate(BaseModel):
    source_account_id: str
    destination_account_id: str
    amount_minor: int = Field(gt=0, description="Amount in minor units (paise)")
    currency: str = "INR"
    rail: str = "IMPS"
    memo: Optional[str] = None
    idempotency_key: Optional[str] = None
    scenario_id: Optional[str] = None

class TransactionEventRead(BaseModel):
    id: str
    event_type: str
    event_time: datetime
    payload_json: Optional[Dict[str, Any]] = None
    class Config:
        from_attributes = True

class TransactionRead(BaseModel):
    id: str
    source_account_id: str
    destination_account_id: str
    source_account_ref: Optional[str] = None
    source_bank_code: Optional[str] = None
    destination_account_ref: Optional[str] = None
    destination_bank_code: Optional[str] = None
    amount_minor: int
    currency: str
    rail: str
    status: str
    memo: Optional[str] = None
    initiated_at: datetime
    posted_at: Optional[datetime] = None
    reversal_of_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    is_cross_bank: bool = False
    class Config:
        from_attributes = True

class TransactionDetailRead(TransactionRead):
    events: List[TransactionEventRead] = []

# Alert Evidence & Alert Schemas
class AlertEvidenceRead(BaseModel):
    id: str
    rule_code: str
    observed_value: str
    threshold: str
    explanation: str
    related_transaction_ids: Optional[List[str]] = None
    class Config:
        from_attributes = True

class DetectionAlertRead(BaseModel):
    id: str
    account_id: str
    account_ref: Optional[str] = None
    bank_code: Optional[str] = None
    trigger_transaction_id: Optional[str] = None
    risk_score: float
    severity: str
    status: str
    detector_version: str
    created_at: datetime
    rules_triggered: List[str] = []
    evidence_count: int = 0
    class Config:
        from_attributes = True

class DetectionAlertDetailRead(DetectionAlertRead):
    evidence: List[AlertEvidenceRead] = []
    related_transactions: List[TransactionRead] = []

class AlertStatusUpdate(BaseModel):
    status: str # OPEN, REVIEWED, DISMISSED, ESCALATED
    rationale: Optional[str] = None

# Lineage & Investigation Schemas
class LineageNodeRead(BaseModel):
    id: str
    account_id: str
    account_ref: str
    bank_id: str
    bank_code: str
    bank_name: str
    account_type: str
    direction: str # ROOT, BACKWARD, FORWARD, BOTH
    hop_depth: int
    amount_attributed_minor: int
    evidence_type: str
    uncertainty: float
    is_off_ramp: bool
    is_origin: bool
    risk_state: str

class LineagePathRead(BaseModel):
    path_id: str
    path_type: str # ATTRIBUTED, CANDIDATE
    nodes: List[str]
    node_ids: List[str] = []
    edges: List[str] = []
    total_amount_minor: int = 0
    attributed_amount_minor: int = 0
    hop_count: int = 0
    confidence: float = 1.0
    explanation: str = ""

class LineageEdgeRead(BaseModel):
    id: str
    transaction_id: str
    source_account_id: str
    destination_account_id: str
    source_account_ref: str
    destination_account_ref: str
    source_bank_code: str
    destination_bank_code: str
    amount_minor: int
    direction: str
    hop_depth: int
    allocation_method: str
    confidence: float
    posted_at: Optional[datetime] = None
    rail: str
    is_cross_bank: bool
    edge_type: str = "ATTRIBUTED" # ATTRIBUTED, CANDIDATE, EXCLUDED
    attributed_amount_minor: int = 0
    exclusion_reason: Optional[str] = None
    allocation_assumptions: Optional[Dict[str, Any]] = None

class InvestigationCreate(BaseModel):
    root_account_id: str
    alert_id: Optional[str] = None
    trigger_transaction_id: Optional[str] = None
    lookback_hours: Optional[int] = 72
    lookahead_hours: Optional[int] = 72
    max_hops: Optional[int] = 12
    max_nodes: Optional[int] = 150

class InvestigationRead(BaseModel):
    id: str
    alert_id: Optional[str] = None
    root_account_id: str
    root_account_ref: Optional[str] = None
    root_bank_code: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    stop_reason: Optional[str] = None
    config_json: Optional[Dict[str, Any]] = None
    summary_metrics_json: Optional[Dict[str, Any]] = None
    class Config:
        from_attributes = True

class InvestigationDetailRead(InvestigationRead):
    nodes: List[LineageNodeRead] = []
    edges: List[LineageEdgeRead] = []
    candidate_paths: List[Any] = []
    attributed_paths: List[Any] = []
    timeline: List[Dict[str, Any]] = []

# Scenario Schemas
class ScenarioRead(BaseModel):
    id: str
    name: str
    description: str
    scenario_type: str
    seed: int
    parameters_json: Optional[Dict[str, Any]] = None
    class Config:
        from_attributes = True

class ScenarioRunRequest(BaseModel):
    seed: Optional[int] = None
    override_parameters: Optional[Dict[str, Any]] = None

# Evaluation Schemas
class EvaluationRunRequest(BaseModel):
    scenario_ids: Optional[List[str]] = None
    seeds: Optional[List[int]] = None
    compare_baseline: bool = True

class EvaluationMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    false_positive_rate: float
    lineage_edge_recovery: float
    stop_reason_accuracy: float
    avg_runtime_ms: float
    total_accounts_evaluated: int
    true_positives: int
    false_positives: int
    false_negatives: int
    true_negatives: int
    source_recovery: Optional[float] = None
    terminal_recovery: Optional[float] = None
    attribution_error: Optional[float] = None

class EvaluationComparison(BaseModel):
    baseline_metrics: EvaluationMetrics
    candidate_metrics: EvaluationMetrics
    relative_f1_delta: float
    relative_fp_reduction: float
    scenario_breakdowns: List[Dict[str, Any]]

class EvaluationRunRead(BaseModel):
    id: str
    scenario_id: str
    detector_version: str
    metrics: Dict[str, Any]
    created_at: datetime
    class Config:
        from_attributes = True

# Settings Schemas
class SettingsUpdate(BaseModel):
    detector_version: Optional[str] = None
    pass_through_ratio_threshold: Optional[float] = None
    pass_through_window_minutes: Optional[int] = None
    velocity_burst_count: Optional[int] = None
    velocity_burst_window_minutes: Optional[int] = None
    fan_in_min_counterparties: Optional[int] = None
    fan_out_min_counterparties: Optional[int] = None
    retention_min_pct: Optional[float] = None
    retention_max_pct: Optional[float] = None
    risk_alert_threshold: Optional[float] = None
    lookback_hours: Optional[int] = None
    lookahead_hours: Optional[int] = None
    max_hops: Optional[int] = None
    max_nodes: Optional[int] = None
