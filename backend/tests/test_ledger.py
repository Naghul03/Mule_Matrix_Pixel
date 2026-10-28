import pytest
from datetime import datetime
from backend.app.models.models import Account, Transaction
from backend.app.schemas.schemas import TransactionCreate
from backend.app.services.ledger_service import LedgerService
from backend.app.core.errors import LedgerValidationError

def test_post_valid_transfer(db_session):
    accs = db_session.query(Account).limit(2).all()
    src, dst = accs[0], accs[1]
    initial_src_bal = src.balance_minor
    initial_dst_bal = dst.balance_minor

    tx_data = TransactionCreate(
        source_account_id=src.id,
        destination_account_id=dst.id,
        amount_minor=1000000, # ₹10,000
        rail="IMPS",
        memo="Unit test transfer"
    )
    tx, created = LedgerService.post_transfer(db_session, tx_data)

    assert created is True
    assert tx.id is not None
    assert tx.status == "POSTED"
    assert tx.amount_minor == 1000000
    assert src.balance_minor == initial_src_bal - 1000000
    assert dst.balance_minor == initial_dst_bal + 1000000

def test_self_transfer_rejected(db_session):
    acc = db_session.query(Account).first()
    tx_data = TransactionCreate(
        source_account_id=acc.id,
        destination_account_id=acc.id,
        amount_minor=500000,
        rail="UPI"
    )
    with pytest.raises(LedgerValidationError) as exc:
        LedgerService.post_transfer(db_session, tx_data)
    assert "identical" in str(exc.value)

def test_zero_or_negative_amount_rejected(db_session):
    accs = db_session.query(Account).limit(2).all()
    # Zero amount
    with pytest.raises(Exception): # Pydantic or Ledger validation
        tx_data = TransactionCreate(
            source_account_id=accs[0].id,
            destination_account_id=accs[1].id,
            amount_minor=0,
            rail="UPI"
        )
        LedgerService.post_transfer(db_session, tx_data)

def test_idempotency_key_duplicate_prevention(db_session):
    accs = db_session.query(Account).limit(2).all()
    src, dst = accs[0], accs[1]
    idem_key = "test-idem-key-123"

    tx_data = TransactionCreate(
        source_account_id=src.id,
        destination_account_id=dst.id,
        amount_minor=2000000,
        idempotency_key=idem_key
    )
    tx1, created1 = LedgerService.post_transfer(db_session, tx_data)
    assert created1 is True

    # Resubmit with same key
    tx2, created2 = LedgerService.post_transfer(db_session, tx_data)
    assert created2 is False
    assert tx1.id == tx2.id

def test_reversal_lifecycle(db_session):
    accs = db_session.query(Account).limit(2).all()
    src, dst = accs[0], accs[1]
    initial_src_bal = src.balance_minor

    tx_data = TransactionCreate(
        source_account_id=src.id,
        destination_account_id=dst.id,
        amount_minor=1500000,
        rail="NEFT"
    )
    tx, _ = LedgerService.post_transfer(db_session, tx_data)
    assert src.balance_minor == initial_src_bal - 1500000

    # Reverse transaction
    reversal_tx = LedgerService.reverse_transaction(db_session, tx.id, reason="Disputed transaction")
    assert reversal_tx.reversal_of_id == tx.id
    assert tx.status == "REVERSED"
    # Balances restored
    assert src.balance_minor == initial_src_bal
