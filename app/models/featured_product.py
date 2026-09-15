from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class FeaturedProduct(Base):
    __tablename__ = "featured_products"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    # custom PNG asset for the homepage card; NULL falls back to products.image_url
    image_url = Column(String, nullable=True)
    position = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    product = relationship("Product")

    __table_args__ = (
        Index("ix_featured_products_position", "position"),
        Index("ix_featured_products_is_active", "is_active"),
    )
