from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import News
from app.schemas.news import NewsOut, NewsSummaryOut

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=List[NewsSummaryOut])
def list_news(db: Session = Depends(get_db)):
    # TODO: ascending sort assumes no past events with is_active=True — kalau ada event
    # lama yang masih aktif, dia muncul paling atas, bukan yang upcoming. Keputusan filter
    # tanggal masih pending, tergantung apakah News ini juga nampung artikel lama yang
    # sengaja mau tetap kelihatan.
    # Only id/title/image_url/event_date columns are selected so the card-list payload
    # stays small — the (potentially large) `content` column is fetched only on-demand below.
    stmt = (
        select(News.id, News.title, News.image_url, News.event_date)
        .where(News.is_active == True)
        .order_by(News.event_date.asc())
    )
    return db.execute(stmt).all()


@router.get("/{news_id}", response_model=NewsOut)
def get_news_detail(news_id: int, db: Session = Depends(get_db)):
    news = db.get(News, news_id)
    if news is None or not news.is_active:
        raise HTTPException(status_code=404, detail="Berita tidak ditemukan")
    return news
