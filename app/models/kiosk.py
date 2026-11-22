"""Tabel untuk kiosk self-service: stok per cabang, log pergerakan stok, order, item order, pembayaran.

Uang disimpan sebagai rupiah utuh (Integer). Status disimpan sebagai string + CHECK constraint
(lebih gampang ditambah daripada enum Postgres).
"""
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, true

from app.models.base import Base

ORDER_STATUSES = ("PENDING_PAYMENT", "PAID", "CANCELLED", "EXPIRED")
PAYMENT_STATUSES = ("PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED", "PAID_LATE")
MOVEMENT_TYPES = ("in", "out", "adjust", "sale")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN (" + ", ".join(f"'{v}'" for v in values) + ")"


class BranchStock(Base):
    __tablename__ = "branch_stock"

    id = Column(Integer, primary_key=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    # Boleh negatif: kalau pembayaran sudah masuk tapi stok di sistem kurang, penjualan tetap dicatat
    # dan selisihnya kelihatan saat stock opname.
    qty = Column(Integer, nullable=False, server_default="0")
    # Dijual di kiosk cabang ini (products.is_active dipakai website, jadi terpisah). Migrasi e3b5c7d9f124.
    is_active = Column(Boolean, nullable=False, server_default=true())
    # Batas "stok menipis" untuk laporan & peringatan admin.
    min_qty = Column(Integer, nullable=False, server_default="5")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    product = relationship("Product")

    __table_args__ = (UniqueConstraint("branch_id", "product_id", name="uq_branch_stock_branch_product"),)


class StockMovement(Base):
    """Setiap perubahan stok dicatat di sini (barang masuk, keluar, koreksi opname, penjualan)."""

    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(16), nullable=False)
    # Perubahan bertanda: +masuk, -keluar/penjualan; adjust bisa + atau -.
    qty = Column(Integer, nullable=False)
    qty_after = Column(Integer, nullable=True)
    # Harga modal per unit untuk barang masuk (opsional, buat laporan HPP).
    unit_cost = Column(Integer, nullable=True)
    ref = Column(String, nullable=True)  # mis. nomor order untuk type=sale
    note = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(_in("type", MOVEMENT_TYPES), name="ck_stock_movements_type"),
        Index("ix_stock_movements_branch_product", "branch_id", "product_id"),
        Index("ix_stock_movements_created_at", "created_at"),
    )


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    order_number = Column(String(32), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    channel = Column(String(16), nullable=False, server_default="kiosk")
    status = Column(String(20), nullable=False, server_default="PENDING_PAYMENT")
    total = Column(Integer, nullable=False)
    payment_method = Column(String(16), nullable=False, server_default="QRIS")
    expires_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    branch = relationship("Branch")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id")
    payments = relationship("Payment", back_populates="order", cascade="all, delete-orphan", order_by="Payment.id")

    __table_args__ = (
        UniqueConstraint("order_number", name="uq_orders_order_number"),
        CheckConstraint(_in("status", ORDER_STATUSES), name="ck_orders_status"),
        Index("ix_orders_branch_status", "branch_id", "status"),
        Index("ix_orders_created_at", "created_at"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    # Snapshot saat order dibuat, supaya laporan tidak berubah kalau harga/nama produk diganti.
    product_name = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    unit_price = Column(Integer, nullable=False)
    cost_price = Column(Integer, nullable=True)
    qty = Column(Integer, nullable=False)
    subtotal = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")

    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_order_items_qty_positive"),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_product_id", "product_id"),
    )


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(32), nullable=False)
    provider_ref = Column(String, nullable=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, server_default="PENDING")
    qr_string = Column(Text, nullable=True)
    qr_image_url = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_by = Column(String, nullable=True)  # "webhook", "poll", "staff"
    raw_callback = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    order = relationship("Order", back_populates="payments")

    __table_args__ = (
        CheckConstraint(_in("status", PAYMENT_STATUSES), name="ck_payments_status"),
        UniqueConstraint("provider", "provider_ref", name="uq_payments_provider_ref"),
        Index("ix_payments_order_id", "order_id"),
    )
