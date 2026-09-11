from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Branch
from app.schemas.branch import BranchOut

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=List[BranchOut])
def list_branches(city: Optional[str] = None, db: Session = Depends(get_db)):
    stmt = select(Branch).where(Branch.is_active == True)
    if city is not None:
        # case-insensitive karena city diinput manual dan casing bisa gak konsisten
        stmt = stmt.where(func.lower(Branch.city) == func.lower(city))
    return db.execute(stmt).scalars().all()
