from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

from backend.app.db.session import get_db
from backend.app.models.models import Bank, Account, Transaction, DetectionAlert
from backend.app.core.config import settings

router = APIRouter()

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    # Check DB connectivity
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    bank_count = db.query(Bank).count() if db_ok else 0
    account_count = db.query(Account).count() if db_ok else 0
    tx_count = db.query(Transaction).count() if db_ok else 0
    alert_count = db.query(DetectionAlert).count() if db_ok else 0

    return {
        "status": "healthy" if db_ok else "unhealthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENV,
        "timestamp": datetime.utcnow().isoformat(),
        "database_connected": db_ok,
        "metrics": {
            "banks": bank_count,
            "accounts": account_count,
            "transactions": tx_count,
            "alerts": alert_count
        }
    }
