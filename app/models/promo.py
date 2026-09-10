from sqlalchemy import Boolean, Column, Date, Integer, Numeric, String, Text

from app.models.base import Base


class Promo(Base):
    __tablename__ = "promos"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    normal_price = Column(Numeric(12, 2), nullable=False)
    promo_price = Column(Numeric(12, 2), nullable=False)
    image_url = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
