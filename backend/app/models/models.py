import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, BigInteger, Float, Boolean, DateTime,
    ForeignKey, Text, JSON, Enum, Index
)
from sqlalchemy.orm import relationship
from backend.app.db.session import Base

def generate_uuid():
    return str(uuid.uuid4())

class Bank(Base):
    __tablename__ = "banks"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    bank_code = Column(String(20), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    accounts = relationship("Account", back_populates="bank")

class Account(Base):
    __tablename__ = "accounts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    bank_id = Column(String(36), ForeignKey("banks.id"), nullable=False, index=True)
    account_ref = Column(String(50), unique=True, nullable=False, index=True)
    account_type = Column(String(50), default="INDIVIDUAL") # INDIVIDUAL, MERCHANT, CORPORATE, SALARY
    opened_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default="ACTIVE") # ACTIVE, SUSPENDED, FROZEN, CLOSED
    risk_state = Column(String(20), default="NORMAL") # NORMAL, ELEVATED, SUSPECTED_MULE, CONFIRMED_MULE
    balance_minor = Column(BigInteger, default=0, nullable=False)
    
    bank = relationship("Bank", back_populates="accounts")
    sent_transactions = relationship("Transaction", foreign_keys="Transaction.source_account_id", back_populates="source_account")
    received_transactions = relationship("Transaction", foreign_keys="Transaction.destination_account_id", back_populates="destination_account")
    alerts = relationship("DetectionAlert", back_populates="account")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    destination_account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    amount_minor = Column(BigInteger, nullable=False)
    currency = Column(String(10), default="INR")
    initiated_at = Column(DateTime, default=datetime.utcnow, index=True)
    posted_at = Column(DateTime, nullable=True, index=True)
    status = Column(String(20), default="POSTED", index=True) # PENDING, POSTED, FAILED, REVERSED
    rail = Column(String(20), default="IMPS") # IMPS, UPI, NEFT, RTGS, CBDC_SIM
    scenario_id = Column(String(50), nullable=True, index=True)
    memo = Column(String(255), nullable=True)
    reversal_of_id = Column(String(36), ForeignKey("transactions.id"), nullable=True)
    idempotency_key = Column(String(100), unique=True, nullable=True, index=True)
    
    source_account = relationship("Account", foreign_keys=[source_account_id], back_populates="sent_transactions")
    destination_account = relationship("Account", foreign_keys=[destination_account_id], back_populates="received_transactions")
    events = relationship("TransactionEvent", back_populates="transaction", cascade="all, delete-orphan")
    reversals = relationship("Transaction", foreign_keys=[reversal_of_id])

Index("ix_tx_src_posted", Transaction.source_account_id, Transaction.posted_at)
Index("ix_tx_dst_posted", Transaction.destination_account_id, Transaction.posted_at)

class TransactionEvent(Base):
    __tablename__ = "transaction_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False) # INITIATED, PENDING, POSTED, FAILED, REVERSED, OFF_RAMP
    event_time = Column(DateTime, default=datetime.utcnow, index=True)
    payload_json = Column(JSON, nullable=True)
    
    transaction = relationship("Transaction", back_populates="events")

class TransferAllocation(Base):
    __tablename__ = "transfer_allocations"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=False, index=True)
    downstream_transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=False, index=True)
    allocated_amount_minor = Column(BigInteger, nullable=False)
    method = Column(String(50), default="PROPORTIONAL_FIFO") # FIFO, PROPORTIONAL_FIFO, EXACT_MATCH
    confidence = Column(Float, default=1.0) # 0.0 - 1.0

class DetectionAlert(Base):
    __tablename__ = "detection_alerts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    trigger_transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=True, index=True)
    risk_score = Column(Float, nullable=False)
    severity = Column(String(20), default="HIGH") # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(20), default="OPEN") # OPEN, REVIEWED, DISMISSED, ESCALATED
    detector_version = Column(String(50), default="v2_candidate_matrix")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    account = relationship("Account", back_populates="alerts")
    evidence = relationship("AlertEvidence", back_populates="alert", cascade="all, delete-orphan")
    investigations = relationship("Investigation", back_populates="alert")

class AlertEvidence(Base):
    __tablename__ = "alert_evidence"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    alert_id = Column(String(36), ForeignKey("detection_alerts.id"), nullable=False, index=True)
    rule_code = Column(String(50), nullable=False)
    observed_value = Column(String(255), nullable=False)
    threshold = Column(String(255), nullable=False)
    explanation = Column(Text, nullable=False)
    related_transaction_ids = Column(JSON, nullable=True)
    
    alert = relationship("DetectionAlert", back_populates="evidence")

class Investigation(Base):
    __tablename__ = "investigations"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    alert_id = Column(String(36), ForeignKey("detection_alerts.id"), nullable=True, index=True)
    root_account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    trigger_transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="IN_PROGRESS") # IN_PROGRESS, COMPLETED, CANCELLED
    stop_reason = Column(String(80), nullable=True)
    config_json = Column(JSON, nullable=True)
    summary_metrics_json = Column(JSON, nullable=True)
    
    alert = relationship("DetectionAlert", back_populates="investigations")
    root_account = relationship("Account", foreign_keys=[root_account_id])
    nodes = relationship("LineageNode", back_populates="investigation", cascade="all, delete-orphan")
    edges = relationship("LineageEdge", back_populates="investigation", cascade="all, delete-orphan")

class LineageNode(Base):
    __tablename__ = "lineage_nodes"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    bank_id = Column(String(36), nullable=False)
    direction = Column(String(20), nullable=False) # ROOT, BACKWARD, FORWARD, BOTH
    hop_depth = Column(Integer, default=0)
    amount_attributed_minor = Column(BigInteger, default=0)
    evidence_type = Column(String(50), default="DIRECT_TRANSFER")
    uncertainty = Column(Float, default=0.0) # 0.0 (certain) to 1.0 (highly uncertain)
    is_off_ramp = Column(Boolean, default=False)
    is_origin = Column(Boolean, default=False)
    
    investigation = relationship("Investigation", back_populates="nodes")
    account = relationship("Account")

class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    investigation_id = Column(String(36), ForeignKey("investigations.id"), nullable=False, index=True)
    transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=False)
    source_account_id = Column(String(36), nullable=False)
    destination_account_id = Column(String(36), nullable=False)
    amount_minor = Column(BigInteger, nullable=False)
    direction = Column(String(20), nullable=False) # BACKWARD, FORWARD
    hop_depth = Column(Integer, default=0)
    allocation_method = Column(String(50), default="ESTIMATED_FLOW")
    confidence = Column(Float, default=1.0)
    edge_type = Column(String(30), default="ATTRIBUTED") # ATTRIBUTED, CANDIDATE, EXCLUDED
    attributed_amount_minor = Column(BigInteger, default=0)
    exclusion_reason = Column(String(255), nullable=True)
    allocation_assumptions = Column(JSON, nullable=True)
    
    investigation = relationship("Investigation", back_populates="edges")
    transaction = relationship("Transaction")

class Scenario(Base):
    __tablename__ = "scenarios"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    scenario_type = Column(String(50), nullable=False) # MULE_CHAIN, RETENTION, SPLIT, MERGE, LOOKALIKE, etc.
    parameters_json = Column(JSON, nullable=True)
    seed = Column(Integer, default=42)
    expected_labels_ref = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class GroundTruthLabel(Base):
    """
    STRICTLY ISOLATED FROM OPERATIONAL DETECTION CODE!
    Only accessed during evaluation runs to compute precision/recall/F1.
    """
    __tablename__ = "ground_truth_labels"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(50), ForeignKey("scenarios.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    label = Column(String(30), nullable=False) # SUSPECTED_MULE, LEGITIMATE, ORIGIN_VICTIM, OFF_RAMP_DESTINATION
    role = Column(String(50), nullable=True) # LAYER_1_MULE, LAYER_2_MULE, AGGREGATOR, SMURF, PAYROLL
    source_funds_id = Column(String(50), nullable=True)

class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    scenario_id = Column(String(50), nullable=True, index=True)
    detector_version = Column(String(50), nullable=False)
    metrics_json = Column(JSON, nullable=False) # precision, recall, f1, fpr, edge_recovery, runtime_ms, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
