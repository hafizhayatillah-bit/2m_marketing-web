from typing import List
from zoneinfo import ZoneInfo

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Promo
from app.schemas.promo import PromoOut

router = APIRouter(prefix="/promos", tags=["promos"])

JAKARTA_TZ = ZoneInfo("Asia/Jakarta")


@router.get("", response_model=List[PromoOut])
def list_promos(db: Session = Depends(get_db)):
    # server kemungkinan jalan di UTC, jadi "hari ini" harus dihitung eksplisit di WIB
    today = datetime.now(JAKARTA_TZ).date()
    stmt = select(Promo).where(
        Promo.is_active == True,
        Promo.start_date <= today,
        Promo.end_date >= today,
    )
    return db.execute(stmt).scalars().all()
