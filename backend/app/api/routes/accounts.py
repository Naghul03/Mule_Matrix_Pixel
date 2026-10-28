from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from backend.app.db.session import get_db
from backend.app.models.models import Account, Bank, Transaction, DetectionAlert
from backend.app.schemas.schemas import AccountRead, AccountDetailRead
from backend.app.core.errors import ResourceNotFoundError
from backend.app.simulation.generator import seed_synthetic_accounts

router = APIRouter()

@router.get("/accounts", response_model=List[AccountRead])
def list_accounts(
    query: Optional[str] = None,
    bank_id: Optional[str] = None,
    risk_state: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    # Ensure baseline accounts exist
    seed_synthetic_accounts(db, count=50)

    q = db.query(Account)
    if bank_id:
        q = q.filter(Account.bank_id == bank_id)
    if risk_state:
        q = q.filter(Account.risk_state == risk_state)
    if status:
        q = q.filter(Account.status == status)
    if query:
        q = q.filter(Account.account_ref.ilike(f"%{query}%"))

    accounts = q.order_by(desc(Account.opened_at)).offset(offset).limit(limit).all()

    results = []
    for acc in accounts:
        bank = db.query(Bank).filter(Bank.id == acc.bank_id).first()
        results.append(AccountRead(
            id=acc.id,
            bank_id=acc.bank_id,
            bank_name=bank.name if bank else "Unknown",
            bank_code=bank.bank_code if bank else "UNK",
            account_ref=acc.account_ref,
            account_type=acc.account_type,
            opened_at=acc.opened_at,
            status=acc.status,
            risk_state=acc.risk_state,
            balance_minor=acc.balance_minor
        ))
    return results

@router.get("/accounts/{id}", response_model=AccountDetailRead)
def get_account_detail(id: str, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == id).first()
    if not acc:
        raise ResourceNotFoundError(f"Account {id} not found.")

    bank = db.query(Bank).filter(Bank.id == acc.bank_id).first()

    # Aggregate stats
    inbound_txs = db.query(Transaction).filter(
        Transaction.destination_account_id == acc.id,
        Transaction.status == "POSTED"
    ).all()
    outbound_txs = db.query(Transaction).filter(
        Transaction.source_account_id == acc.id,
        Transaction.status == "POSTED"
    ).all()

    in_count = len(inbound_txs)
    out_count = len(outbound_txs)
    total_in = sum(t.amount_minor for t in inbound_txs)
    total_out = sum(t.amount_minor for t in outbound_txs)

    alerts = db.query(DetectionAlert).filter(DetectionAlert.account_id == acc.id).all()

    return AccountDetailRead(
        id=acc.id,
        bank_id=acc.bank_id,
        bank_name=bank.name if bank else "Unknown",
        bank_code=bank.bank_code if bank else "UNK",
        account_ref=acc.account_ref,
        account_type=acc.account_type,
        opened_at=acc.opened_at,
        status=acc.status,
        risk_state=acc.risk_state,
        balance_minor=acc.balance_minor,
        inbound_tx_count=in_count,
        outbound_tx_count=out_count,
        total_inbound_minor=total_in,
        total_outbound_minor=total_out,
        alert_count=len(alerts),
        active_alerts=[{"id": a.id, "risk_score": a.risk_score, "severity": a.severity, "status": a.status} for a in alerts]
    )
