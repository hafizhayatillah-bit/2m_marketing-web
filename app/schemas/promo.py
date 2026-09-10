from pydantic import BaseModel
from typing import Optional
from datetime import date

class PromoBase(BaseModel):
    title: str
    description: Optional[str] = None
    normal_price: float
    promo_price: float
    image_url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = True

class PromoCreate(PromoBase):
    pass

class PromoResponse(PromoBase):
    id: int

    class Config:
        from_attributes = True