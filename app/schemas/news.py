from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NewsSummaryOut(BaseModel):
    """Lightweight card-list payload — deliberately excludes `content` to keep it small."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    image_url: Optional[str] = None
    event_date: date


class NewsOut(NewsSummaryOut):
    """Full article detail, fetched on-demand when a card is opened."""

    content: str
