"""Biaya operasional toko (listrik, sewa, gaji, plastik, ...) untuk menghitung laba bersih di admin POS.

Belanja barang dagangan TIDAK dicatat di sini: itu barang masuk (stock_movements type "in" + unit_cost).
"""
from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.models.base import Base


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    # Tanggal biaya (WIB), bukan waktu input: tagihan listrik bulan lalu bisa dicatat hari ini.
    spent_on = Column(Date, nullable=False)
    category = Column(String(40), nullable=False)
    amount = Column(Integer, nullable=False)  # rupiah utuh
    note = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
        Index("ix_expenses_branch_spent_on", "branch_id", "spent_on"),
    )
