from sqlalchemy import Boolean, Column, Integer, String, Text, UniqueConstraint

from app.models.base import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    category = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Harga dalam rupiah utuh. NULL = belum diberi harga, tidak dijual di kiosk.
    price = Column(Integer, nullable=True)
    # Harga modal (HPP) saat ini; di-snapshot ke order_items saat order dibuat untuk laporan laba.
    cost_price = Column(Integer, nullable=True)
    sku = Column(String, nullable=True)

    __table_args__ = (UniqueConstraint("sku", name="uq_products_sku"),)
