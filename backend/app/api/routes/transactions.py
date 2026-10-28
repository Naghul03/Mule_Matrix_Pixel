from fastapi import APIRouter, Depends, Query, status
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from backend.app.db.session import get_db
from backend.app.models.models import Transaction, Account, Bank
from backend.app.schemas.schemas import TransactionCreate, TransactionRead, TransactionDetailRead
from backend.app.services.ledger_service import LedgerService
from backend.app.services.detection_service import DetectionService
from backend.app.core.errors import ResourceNotFoundError

router = APIRouter()

def _enrich_transaction(db: Session, tx: Transaction) -> TransactionRead:
    src_acc = db.query(Account).filter(Account.id == tx.source_account_id).first()
    dst_acc = db.query(Account).filter(Account.id == tx.destination_account_id).first()
    src_bank = db.query(Bank).filter(Bank.id == src_acc.bank_id).first() if src_acc else None
    dst_bank = db.query(Bank).filter(Bank.id == dst_acc.bank_id).first() if dst_acc else None

    is_cross = (src_acc.bank_id != dst_acc.bank_id) if (src_acc and dst_acc) else False

    return TransactionRead(
        id=tx.id,
        source_account_id=tx.source_account_id,
        destination_account_id=tx.destination_account_id,
        source_account_ref=src_acc.account_ref if src_acc else "UNKNOWN",
        source_bank_code=src_bank.bank_code if src_bank else "UNK",
        destination_account_ref=dst_acc.account_ref if dst_acc else "UNKNOWN",
        destination_bank_code=dst_bank.bank_code if dst_bank else "UNK",
        amount_minor=tx.amount_minor,
        currency=tx.currency,
        rail=tx.rail,
        status=tx.status,
        memo=tx.memo,
        initiated_at=tx.initiated_at,
        posted_at=tx.posted_at,
        reversal_of_id=tx.reversal_of_id,
        idempotency_key=tx.idempotency_key,
        is_cross_bank=is_cross
    )

@router.post("/transactions", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def post_transaction(transfer: TransactionCreate, db: Session = Depends(get_db)):
    tx, created = LedgerService.post_transfer(db, transfer)
    
    # Run immediate detection on source & destination
    if tx.status == "POSTED":
        DetectionService.process_transaction_detection(db, tx)

    return _enrich_transaction(db, tx)

@router.get("/transactions", response_model=List[TransactionRead])
def list_transactions(
    account_id: Optional[str] = None,
    scenario_id: Optional[str] = None,
    status: Optional[str] = None,
    rail: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    q = db.query(Transaction)
    if account_id:
        q = q.filter(or_(
            Transaction.source_account_id == account_id,
            Transaction.destination_account_id == account_id
        ))
    if scenario_id:
        q = q.filter(Transaction.scenario_id == scenario_id)
    if status:
        q = q.filter(Transaction.status == status)
    if rail:
        q = q.filter(Transaction.rail == rail)

    txs = q.order_by(desc(Transaction.initiated_at)).offset(offset).limit(limit).all()
    return [_enrich_transaction(db, t) for t in txs]

@router.get("/transactions/{id}", response_model=TransactionDetailRead)
def get_transaction(id: str, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise ResourceNotFoundError(f"Transaction {id} not found.")

    base = _enrich_transaction(db, tx)
    events = [
        {"id": e.id, "event_type": e.event_type, "event_time": e.event_time, "payload_json": e.payload_json}
        for e in tx.events
    ]
    return TransactionDetailRead(**base.dict(), events=events)
