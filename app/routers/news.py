from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import News
from app.schemas.news import NewsOut

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=List[NewsOut])
def list_news(db: Session = Depends(get_db)):
    # TODO: ascending sort assumes no past events with is_active=True — kalau ada event
    # lama yang masih aktif, dia muncul paling atas, bukan yang upcoming. Keputusan filter
    # tanggal masih pending, tergantung apakah News ini juga nampung artikel lama yang
    # sengaja mau tetap kelihatan.
    stmt = select(News).where(News.is_active == True).order_by(News.event_date.asc())
    return db.execute(stmt).scalars().all()
