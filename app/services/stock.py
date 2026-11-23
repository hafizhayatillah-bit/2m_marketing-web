"""Satu-satunya jalur untuk mengubah stok cabang.

Setiap perubahan stok (penjualan kiosk, barang masuk, barang keluar, koreksi, stock opname) lewat sini:
- baris branch_stock dikunci dengan SELECT ... FOR UPDATE, urut product_id supaya tidak deadlock,
- qty di branch_stock diubah dan satu baris stock_movements ditulis dengan qty_after,
- lock_stock_rows/apply_movement tidak commit (dipakai di dalam transaksi pemanggil, mis. mark_paid);
  stock_in/adjust/opname adalah satu transaksi utuh dan commit sendiri.

Dipakai oleh app/services/kiosk_orders.mark_paid (type "sale") dan API admin POS (in/out/adjust).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import BranchStock, Product, StockMovement

MOVEMENT_TYPES = ("in", "out", "adjust", "sale")


class StockError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def lock_stock_rows(
    db: Session, branch_id: int, product_ids: Iterable[int], *, create_missing: bool = True
) -> dict[int, BranchStock]:
    """Kunci baris branch_stock untuk produk-produk ini (urut product_id). Baris yang belum ada dibuat (qty 0)."""
    ids = sorted(set(product_ids))
    if not ids:
        return {}
    if create_missing:
        # ON CONFLICT DO NOTHING: aman kalau dua transaksi membuat baris yang sama bersamaan.
        db.execute(
            pg_insert(BranchStock)
            .values([{"branch_id": branch_id, "product_id": pid, "qty": 0} for pid in ids])
            .on_conflict_do_nothing(constraint="uq_branch_stock_branch_product")
        )
    rows = db.execute(
        select(BranchStock)
        .where(BranchStock.branch_id == branch_id, BranchStock.product_id.in_(ids))
        .order_by(BranchStock.product_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalars()
    return {s.product_id: s for s in rows}


def apply_movement(
    db: Session,
    stock: BranchStock,
    *,
    type: str,
    delta: int,
    unit_cost: Optional[int] = None,
    ref: Optional[str] = None,
    note: Optional[str] = None,
    created_by: Optional[str] = None,
) -> StockMovement:
    """Ubah qty baris yang SUDAH dikunci (lewat lock_stock_rows) dan catat movement-nya."""
    if type not in MOVEMENT_TYPES:
        raise ValueError(f"type movement tidak dikenal: {type}")
    stock.qty = (stock.qty or 0) + delta
    movement = StockMovement(
        branch_id=stock.branch_id,
        product_id=stock.product_id,
        type=type,
        qty=delta,
        qty_after=stock.qty,
        unit_cost=unit_cost,
        ref=ref,
        note=note,
        created_by=created_by,
    )
    db.add(movement)
    return movement


# ---------------------------------------------------------------- operasi admin (commit di sini)


@dataclass
class StockInLine:
    product_id: int
    qty: int
    unit_cost: Optional[int] = None


def weighted_cost(old_qty: int, old_cost: Optional[int], in_qty: int, in_cost: int) -> int:
    """Modal rata-rata tertimbang setelah barang masuk.

    Stok lama (old_qty, dinilai old_cost) digabung dengan barang baru (in_qty @ in_cost). Kalau stok lama kosong/negatif
    atau belum punya modal, modal baru = harga belanja ini. Hasil dibulatkan ke rupiah.
    """
    if old_cost is None or old_qty <= 0:
        return in_cost
    return round((old_qty * old_cost + in_qty * in_cost) / (old_qty + in_qty))


def _check_products(db: Session, product_ids: Iterable[int]) -> dict[int, Product]:
    ids = set(product_ids)
    products = {p.id: p for p in db.execute(select(Product).where(Product.id.in_(ids))).scalars()}
    missing = ids - products.keys()
    if missing:
        raise StockError(404, "PRODUCT_NOT_FOUND", f"Produk {sorted(missing)} tidak ditemukan di katalog.")
    return products


def stock_in(
    db: Session,
    branch_id: int,
    lines: list[StockInLine],
    *,
    ref: Optional[str],
    note: Optional[str],
    created_by: str,
    update_cost: bool = True,
) -> list[StockMovement]:
    """Barang masuk. Kalau update_cost dan unit_cost diisi, modal produk DI CABANG INI dihitung ulang sebagai rata-rata
    tertimbang: stok cabang yang ada dengan modal lamanya, ditambah barang masuk ini dengan harga belanjanya."""
    if not lines:
        raise StockError(422, "EMPTY", "Belum ada barang yang diisi.")
    merged: dict[int, StockInLine] = {}
    # Total belanja per produk (hanya baris yang punya harga), supaya baris ganda digabung dengan rata-rata tertimbang.
    costed: dict[int, tuple[int, int]] = {}
    for line in lines:
        if line.qty <= 0:
            raise StockError(422, "INVALID_QTY", "Jumlah barang masuk harus lebih dari 0.")
        if line.product_id in merged:
            merged[line.product_id].qty += line.qty
        else:
            merged[line.product_id] = StockInLine(line.product_id, line.qty, None)
        if line.unit_cost is not None:
            q, total = costed.get(line.product_id, (0, 0))
            costed[line.product_id] = (q + line.qty, total + line.qty * line.unit_cost)
    for pid, (q, total) in costed.items():
        merged[pid].unit_cost = round(total / q)
    try:
        _check_products(db, merged.keys())
        stocks = lock_stock_rows(db, branch_id, merged.keys())
        out = []
        for pid in sorted(merged):
            line = merged[pid]
            stock = stocks[pid]
            # Baris branch_stock sudah dikunci, jadi qty & modal ini tidak berubah sampai commit.
            if update_cost and line.unit_cost is not None and line.unit_cost > 0:
                stock.cost_price = weighted_cost(stock.qty or 0, stock.cost_price, line.qty, line.unit_cost)
            out.append(
                apply_movement(
                    db, stock, type="in", delta=line.qty, unit_cost=line.unit_cost,
                    ref=ref, note=note or "Barang masuk", created_by=created_by,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return out


def adjust(
    db: Session,
    branch_id: int,
    product_id: int,
    *,
    delta: int,
    type: str,
    note: str,
    created_by: str,
    ref: Optional[str] = None,
) -> StockMovement:
    """Barang keluar (type out, delta negatif) atau koreksi (type adjust, +/-)."""
    if type not in ("out", "adjust"):
        raise StockError(422, "INVALID_TYPE", "Jenis penyesuaian harus out atau adjust.")
    if delta == 0:
        raise StockError(422, "INVALID_QTY", "Jumlah perubahan tidak boleh 0.")
    if type == "out" and delta > 0:
        delta = -delta
    if not (note or "").strip():
        raise StockError(422, "NOTE_REQUIRED", "Tulis alasan penyesuaian stok.")
    try:
        _check_products(db, [product_id])
        stock = lock_stock_rows(db, branch_id, [product_id])[product_id]
        movement = apply_movement(db, stock, type=type, delta=delta, ref=ref, note=note.strip(), created_by=created_by)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return movement


@dataclass
class OpnameLine:
    product_id: int
    counted: int
    # Stok sistem yang dilihat petugas saat barang ini dihitung. Kalau diisi, selisih = counted - system_qty dan
    # diterapkan ke stok SAAT DISIMPAN, jadi penjualan kiosk di antara hitung dan simpan tidak tertimpa.
    system_qty: Optional[int] = None


@dataclass
class OpnameResult:
    product_id: int
    system_qty: int
    counted: int
    diff: int
    movement: Optional[StockMovement]


def opname(
    db: Session,
    branch_id: int,
    lines: list[OpnameLine],
    *,
    ref: str,
    note: Optional[str],
    created_by: str,
) -> list[OpnameResult]:
    """Stock opname: selisih hitung fisik dicatat sebagai movement adjust.

    Tanpa system_qty: qty sistem (dibaca setelah baris dikunci) diganti hasil hitung. Ini salah kalau ada penjualan
    antara barang dihitung dan opname disimpan (barang itu sudah keluar dari rak tapi masih terhitung).
    Dengan system_qty (stok sistem saat dihitung): selisih = counted - system_qty, diterapkan ke stok terkini.
    """
    if not lines:
        raise StockError(422, "EMPTY", "Belum ada hasil hitung yang diisi.")
    counted: dict[int, int] = {}
    seen: dict[int, Optional[int]] = {}
    for line in lines:
        if line.counted < 0:
            raise StockError(422, "INVALID_QTY", "Hasil hitung tidak boleh negatif.")
        counted[line.product_id] = line.counted
        seen[line.product_id] = line.system_qty
    try:
        _check_products(db, counted.keys())
        stocks = lock_stock_rows(db, branch_id, counted.keys())
        results = []
        for pid in sorted(counted):
            stock = stocks[pid]
            current = stock.qty or 0
            system_qty = seen[pid] if seen[pid] is not None else current
            diff = counted[pid] - system_qty
            movement = None
            if diff != 0:
                text = f"Stock opname: sistem {system_qty}, hitung fisik {counted[pid]} (selisih {diff:+d})"
                if system_qty != current:
                    text += f"; stok saat disimpan {current} -> {current + diff} (ada transaksi di tengah opname)"
                if note:
                    text += f". {note.strip()}"
                movement = apply_movement(db, stock, type="adjust", delta=diff, ref=ref, note=text, created_by=created_by)
            results.append(OpnameResult(pid, system_qty, counted[pid], diff, movement))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return results
