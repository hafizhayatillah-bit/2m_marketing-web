from sqlalchemy import Boolean, Column, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.base import Base


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    city = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    google_maps_url = Column(String, nullable=True)
    google_drive_url = Column(String, nullable=True)
    whatsapp_number = Column(String, nullable=False)
    operating_hours = Column(String, nullable=False)
    category_tags = Column(ARRAY(String), nullable=False, default=list)
    is_active = Column(Boolean, default=True, nullable=False)
