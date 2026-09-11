from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NewsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    image_url: Optional[str] = None
    event_date: date
