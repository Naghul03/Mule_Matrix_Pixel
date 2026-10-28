import uuid
import random
from typing import List, Dict
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from backend.app.models.models import Bank, Account

SYNTHETIC_BANKS = [
    {"name": "HDFC Synthetic Bank", "bank_code": "HDFX"},
    {"name": "ICICI Synthetic Bank", "bank_code": "ICIX"},
    {"name": "State Bank Synthetic", "bank_code": "SBNX"},
    {"name": "Axis Synthetic Bank", "bank_code": "AXSX"},
    {"name": "Kotak Synthetic Bank", "bank_code": "KOTX"},
    {"name": "PNB Synthetic Bank", "bank_code": "PNBX"},
    {"name": "Bank of Baroda Synthetic", "bank_code": "BOBX"},
    {"name": "Paytm Payments Synthetic", "bank_code": "PAYX"},
]

def seed_banks(db: Session) -> List[Bank]:
    banks = []
    for b_data in SYNTHETIC_BANKS:
        existing = db.query(Bank).filter(Bank.bank_code == b_data["bank_code"]).first()
        if not existing:
            bank = Bank(
                id=str(uuid.uuid4()),
                name=b_data["name"],
                bank_code=b_data["bank_code"],
                created_at=datetime.utcnow()
            )
            db.add(bank)
            banks.append(bank)
        else:
            banks.append(existing)
    db.commit()
    return banks

def seed_synthetic_accounts(db: Session, count: int = 100, seed: int = 42) -> List[Account]:
    """
    Seeds a pool of synthetic accounts across the 8 synthetic banks.
    Can be scaled up to 10,000 accounts on demand.
    """
    banks = seed_banks(db)
    rng = random.Random(seed)
    
    existing_count = db.query(Account).count()
    if existing_count >= count:
        return db.query(Account).limit(count).all()

    account_types = ["INDIVIDUAL", "INDIVIDUAL", "INDIVIDUAL", "SALARY", "MERCHANT", "CORPORATE"]
    accounts = []
    
    start_idx = existing_count + 1
    for i in range(start_idx, start_idx + count):
        bank = rng.choice(banks)
        acc_type = rng.choice(account_types)
        balance = rng.randint(2000000, 50000000) # ₹20,000 to ₹500,000
        opened_days_ago = rng.randint(5, 365)
        
        acc = Account(
            id=str(uuid.uuid4()),
            bank_id=bank.id,
            account_ref=f"ACC-{i:04d}-{bank.bank_code}",
            account_type=acc_type,
            opened_at=datetime.utcnow() - timedelta(days=opened_days_ago),
            status="ACTIVE",
            risk_state="NORMAL",
            balance_minor=balance
        )
        db.add(acc)
        accounts.append(acc)

    db.commit()
    return db.query(Account).all()
