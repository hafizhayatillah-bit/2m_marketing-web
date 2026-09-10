from sqlalchemy import Boolean, Column, Integer, String, Text

from app.models.base import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    category = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
