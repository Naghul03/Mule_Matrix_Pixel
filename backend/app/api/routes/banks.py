from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.models import Bank
from backend.app.schemas.schemas import BankRead
from backend.app.simulation.generator import seed_banks

router = APIRouter()

@router.get("/banks", response_model=List[BankRead])
def list_banks(db: Session = Depends(get_db)):
    banks = seed_banks(db)
    return banks
