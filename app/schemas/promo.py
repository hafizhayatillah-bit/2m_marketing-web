from pydantic import BaseModel, ConfigDict, field_serializer
from typing import Optional
from datetime import date
from decimal import Decimal

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


class PromoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    normal_price: Decimal
    promo_price: Decimal
    image_url: Optional[str] = None
    start_date: date
    end_date: date

    # tanpa ini, Decimal ter-serialize sebagai string di mode JSON
    @field_serializer("normal_price", "promo_price")
    def serialize_price(self, value: Decimal) -> float:
        return float(value)
