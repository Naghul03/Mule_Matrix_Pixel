import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from backend.app.models.models import Bank, Account, Transaction, TransactionEvent
from backend.app.schemas.schemas import TransactionCreate
from backend.app.core.errors import LedgerValidationError, ResourceNotFoundError
from backend.app.services.event_service import event_bus

class LedgerService:
    @staticmethod
    def post_transfer(
        db: Session,
        transfer_data: TransactionCreate,
        status: str = "POSTED",
        posted_at: Optional[datetime] = None
    ) -> Tuple[Transaction, bool]:
        """
        Posts a transfer to the immutable ledger.
        Returns (Transaction, was_created).
        """
        # 1. Idempotency check
        if transfer_data.idempotency_key:
            existing = db.query(Transaction).filter(
                Transaction.idempotency_key == transfer_data.idempotency_key
            ).first()
            if existing:
                return existing, False

        # 2. Validation: Source != Destination
        if transfer_data.source_account_id == transfer_data.destination_account_id:
            raise LedgerValidationError("Source and destination accounts must not be identical.")

        # 3. Validation: Positive amount
        if transfer_data.amount_minor <= 0:
            raise LedgerValidationError("Transfer amount must be strictly greater than zero.")

        # 4. Accounts lookup
        source_acc = db.query(Account).filter(Account.id == transfer_data.source_account_id).first()
        dest_acc = db.query(Account).filter(Account.id == transfer_data.destination_account_id).first()

        if not source_acc:
            raise ResourceNotFoundError(f"Source account {transfer_data.source_account_id} not found.")
        if not dest_acc:
            raise ResourceNotFoundError(f"Destination account {transfer_data.destination_account_id} not found.")

        if source_acc.status == "CLOSED":
            raise LedgerValidationError(f"Source account {source_acc.account_ref} is closed.")
        if dest_acc.status == "CLOSED":
            raise LedgerValidationError(f"Destination account {dest_acc.account_ref} is closed.")

        now = datetime.utcnow()
        actual_posted_at = posted_at or (now if status == "POSTED" else None)

        tx = Transaction(
            id=str(uuid.uuid4()),
            source_account_id=source_acc.id,
            destination_account_id=dest_acc.id,
            amount_minor=transfer_data.amount_minor,
            currency=transfer_data.currency,
            initiated_at=now,
            posted_at=actual_posted_at,
            status=status,
            rail=transfer_data.rail,
            scenario_id=transfer_data.scenario_id,
            memo=transfer_data.memo,
            idempotency_key=transfer_data.idempotency_key
        )
        db.add(tx)

        # Record events
        init_event = TransactionEvent(
            transaction_id=tx.id,
            event_type="INITIATED",
            event_time=now,
            payload_json={"rail": tx.rail, "amount_minor": tx.amount_minor}
        )
        db.add(init_event)

        if status == "POSTED":
            post_event = TransactionEvent(
                transaction_id=tx.id,
                event_type="POSTED",
                event_time=actual_posted_at or now,
                payload_json={"posted_at": (actual_posted_at or now).isoformat()}
            )
            db.add(post_event)

            # Update balances
            source_acc.balance_minor -= transfer_data.amount_minor
            dest_acc.balance_minor += transfer_data.amount_minor

        db.commit()
        db.refresh(tx)

        # Notify event bus
        event_bus.publish_nowait("TRANSFER_POSTED", {
            "transaction_id": tx.id,
            "source_account_id": source_acc.id,
            "source_account_ref": source_acc.account_ref,
            "source_bank_code": source_acc.bank.bank_code if source_acc.bank else "UNKNOWN",
            "destination_account_id": dest_acc.id,
            "destination_account_ref": dest_acc.account_ref,
            "destination_bank_code": dest_acc.bank.bank_code if dest_acc.bank else "UNKNOWN",
            "amount_minor": tx.amount_minor,
            "rail": tx.rail,
            "status": tx.status,
            "is_cross_bank": source_acc.bank_id != dest_acc.bank_id
        })

        return tx, True

    @staticmethod
    def reverse_transaction(db: Session, original_tx_id: str, reason: str = "Investigation freeze / fraud dispute") -> Transaction:
        original_tx = db.query(Transaction).filter(Transaction.id == original_tx_id).first()
        if not original_tx:
            raise ResourceNotFoundError(f"Transaction {original_tx_id} not found.")

        if original_tx.status != "POSTED":
            raise LedgerValidationError(f"Cannot reverse transaction with status {original_tx.status}.")

        now = datetime.utcnow()
        # Create reversal transaction (opposite direction)
        reversal_tx = Transaction(
            id=str(uuid.uuid4()),
            source_account_id=original_tx.destination_account_id,
            destination_account_id=original_tx.source_account_id,
            amount_minor=original_tx.amount_minor,
            currency=original_tx.currency,
            initiated_at=now,
            posted_at=now,
            status="POSTED",
            rail=original_tx.rail,
            scenario_id=original_tx.scenario_id,
            memo=f"REVERSAL for tx {original_tx.id}: {reason}",
            reversal_of_id=original_tx.id
        )
        original_tx.status = "REVERSED"
        db.add(reversal_tx)

        # Update balances back
        orig_src = db.query(Account).filter(Account.id == original_tx.source_account_id).first()
        orig_dst = db.query(Account).filter(Account.id == original_tx.destination_account_id).first()
        if orig_src and orig_dst:
            orig_src.balance_minor += original_tx.amount_minor
            orig_dst.balance_minor -= original_tx.amount_minor

        rev_event = TransactionEvent(
            transaction_id=original_tx.id,
            event_type="REVERSED",
            event_time=now,
            payload_json={"reversal_tx_id": reversal_tx.id, "reason": reason}
        )
        db.add(rev_event)

        db.commit()
        db.refresh(original_tx)
        db.refresh(reversal_tx)

        event_bus.publish_nowait("TRANSACTION_REVERSED", {
            "original_transaction_id": original_tx.id,
            "reversal_transaction_id": reversal_tx.id,
            "reason": reason
        })

        return reversal_tx
