"""Logika order kiosk: buat order, tandai lunas (idempotent, potong stok), batal, kedaluwarsa.

Aturan penting:
- Harga & total selalu dihitung di server dari tabel products; harga dari client diabaikan.
- Stok dicek saat order dibuat, tapi baru DIPOTONG saat order jadi PAID, dalam satu transaksi
  dengan row lock (SELECT ... FOR UPDATE) di order dan branch_stock, plus log stock_movements "sale".
- mark_paid aman dipanggil berulang (webhook bisa dikirim ulang): order yang sudah PAID tidak diproses lagi.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.models import Branch, BranchStock, Order, OrderItem, Payment, Product, StockMovement
from app.payments.base import QrisCharge
from app.payments.providers import get_provider
from app.services import stock as stock_svc

log = logging.getLogger("kiosk")

WIB = timezone(timedelta(hours=7))
MAX_QTY_PER_ITEM = 99
MAX_LINES = 60


def order_ttl() -> timedelta:
    return timedelta(seconds=int(os.getenv("KIOSK_ORDER_TTL_SECONDS", "600")))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class KioskError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}


# ---------------------------------------------------------------- branch & katalog


def resolve_branch(db: Session, key: Optional[str]) -> Branch:
    key = (key or os.getenv("KIOSK_DEFAULT_BRANCH", "jatibening")).strip()
    stmt = select(Branch).where(Branch.is_active == True)  # noqa: E712
    if key.isdigit():
        branch = db.execute(stmt.where(Branch.id == int(key))).scalar_one_or_none()
    else:
        branch = db.execute(stmt.where(Branch.name.ilike(f"%{key}%")).order_by(Branch.id)).scalars().first()
    if branch is None:
        raise KioskError(404, "BRANCH_NOT_FOUND", f"Cabang '{key}' tidak ditemukan atau tidak aktif.")
    return branch


def list_products(db: Session, branch: Branch) -> list[dict[str, Any]]:
    """Produk aktif yang punya harga dan terdaftar di stok cabang ini."""
    rows = db.execute(
        select(Product, BranchStock.qty)
        .join(BranchStock, BranchStock.product_id == Product.id)
        .where(
            BranchStock.branch_id == branch.id,
            BranchStock.is_active == True,  # noqa: E712  (disembunyikan dari admin POS)
            Product.is_active == True,  # noqa: E712
            Product.price.is_not(None),
            Product.price > 0,
        )
        .order_by(Product.category, Product.name)
    ).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "image_url": p.image_url,
            "price": p.price,
            "stock": max(0, qty),
        }
        for p, qty in rows
    ]


# ---------------------------------------------------------------- kedaluwarsa


def expire_stale_orders(db: Session) -> int:
    """Tandai order PENDING_PAYMENT yang lewat expires_at jadi EXPIRED. Aman dipanggil sering."""
    now = now_utc()
    ids = db.execute(
        update(Order)
        .where(Order.status == "PENDING_PAYMENT", Order.expires_at.is_not(None), Order.expires_at < now)
        .values(status="EXPIRED", cancelled_at=now, cancel_reason="Waktu pembayaran habis")
        .returning(Order.id)
    ).scalars().all()
    if ids:
        db.execute(
            update(Payment)
            .where(Payment.order_id.in_(ids), Payment.status == "PENDING")
            .values(status="EXPIRED")
        )
    db.commit()
    return len(ids)


# ---------------------------------------------------------------- buat order


@dataclass
class LineIn:
    product_id: int
    qty: int


def _order_number(order: Order) -> str:
    created = (order.created_at or now_utc()).astimezone(WIB)
    return f"K{created:%y%m%d}-{order.id:04d}"


def create_order(db: Session, branch: Branch, lines: list[LineIn]) -> Order:
    merged: dict[int, int] = {}
    for line in lines:
        if line.qty <= 0:
            raise KioskError(422, "INVALID_QTY", "Jumlah barang harus lebih dari 0.")
        merged[line.product_id] = merged.get(line.product_id, 0) + line.qty
    if not merged:
        raise KioskError(422, "EMPTY_CART", "Keranjang kosong.")
    if len(merged) > MAX_LINES:
        raise KioskError(422, "TOO_MANY_LINES", f"Maksimal {MAX_LINES} jenis barang per transaksi.")
    for pid, qty in merged.items():
        if qty > MAX_QTY_PER_ITEM:
            raise KioskError(422, "INVALID_QTY", f"Maksimal {MAX_QTY_PER_ITEM} per barang.")

    rows = {
        p.id: (p, qty)
        for p, qty in db.execute(
            select(Product, BranchStock.qty)
            .join(BranchStock, BranchStock.product_id == Product.id)
            .where(
                BranchStock.branch_id == branch.id,
                BranchStock.is_active == True,  # noqa: E712
                Product.id.in_(merged.keys()),
            )
        ).all()
    }

    problems = []
    for pid, qty in merged.items():
        row = rows.get(pid)
        if row is None or not row[0].is_active or not row[0].price:
            problems.append({"product_id": pid, "name": row[0].name if row else None, "available": 0})
            continue
        product, stock = row
        if qty > stock:
            problems.append({"product_id": pid, "name": product.name, "available": max(0, stock)})
    if problems:
        raise KioskError(
            409,
            "INSUFFICIENT_STOCK",
            "Stok beberapa barang tidak cukup. Keranjang sudah disesuaikan.",
            {"items": problems},
        )

    now = now_utc()
    order = Order(branch_id=branch.id, status="PENDING_PAYMENT", total=0, created_at=now, expires_at=now + order_ttl())
    total = 0
    for pid, qty in merged.items():
        product, _ = rows[pid]
        subtotal = product.price * qty
        total += subtotal
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                sku=product.sku,
                unit_price=product.price,
                cost_price=product.cost_price,
                qty=qty,
                subtotal=subtotal,
            )
        )
    order.total = total
    db.add(order)
    db.flush()
    order.order_number = _order_number(order)

    provider = get_provider()
    try:
        charge: QrisCharge = provider.create_qris(order)
    except Exception as exc:  # gateway down / belum dikonfigurasi
        db.rollback()
        log.exception("create_qris gagal")
        raise KioskError(503, "PAYMENT_UNAVAILABLE", "Pembayaran QRIS sedang tidak tersedia. Silakan hubungi kasir.") from exc

    db.add(
        Payment(
            order_id=order.id,
            provider=provider.name,
            provider_ref=charge.provider_ref,
            amount=total,
            status="PENDING",
            qr_string=charge.qr_string,
            qr_image_url=charge.qr_image_url,
            expires_at=charge.expires_at or order.expires_at,
            created_at=now,
        )
    )
    db.commit()
    return get_order(db, order.id)


# ---------------------------------------------------------------- baca order


def get_order(db: Session, order_id: int) -> Order:
    order = db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payments), selectinload(Order.branch))
        .where(Order.id == order_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if order is None:
        raise KioskError(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.")
    return order


def current_payment(order: Order) -> Optional[Payment]:
    return order.payments[-1] if order.payments else None


def refresh_from_provider(db: Session, order: Order) -> Order:
    """Cadangan webhook: tanya provider kalau order masih menunggu bayar."""
    payment = current_payment(order)
    if order.status != "PENDING_PAYMENT" or payment is None or payment.provider != get_provider().name:
        return order
    try:
        status = get_provider().check_status(payment)
    except Exception:
        log.exception("check_status gagal untuk order %s", order.id)
        return order
    if status == "PAID":
        mark_paid(db, order.id, source="poll", raw={"via": "check_status"})
        return get_order(db, order.id)
    return order


# ---------------------------------------------------------------- lunas


def mark_paid(
    db: Session,
    order_id: int,
    *,
    source: str,
    raw: Optional[dict[str, Any]] = None,
    amount: Optional[int] = None,
) -> Order:
    """Tandai order PAID dan potong stok. Idempotent. Satu transaksi, dengan row lock."""
    try:
        # populate_existing WAJIB: kalau order/payment sudah pernah dimuat di session ini (mis. kiosk_get_order ->
        # refresh_from_provider), tanpa ini SQLAlchemy mengembalikan objek lama dari identity map walaupun
        # SELECT ... FOR UPDATE sudah menunggu transaksi lain selesai menandai PAID -> stok terpotong dua kali.
        order = db.execute(
            select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
        ).scalar_one_or_none()
        if order is None:
            raise KioskError(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.")
        payment = db.execute(
            select(Payment)
            .where(Payment.order_id == order.id)
            .order_by(Payment.id.desc())
            .limit(1)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalar_one_or_none()
        now = now_utc()

        if order.status == "PAID":
            if amount is not None and amount != order.total:
                log.warning("callback nominal %s untuk order %s yang sudah PAID (%s) diabaikan", amount, order.id, order.total)
                if payment is not None:
                    _append_callback(payment, source, {"ignored": "amount_mismatch_after_paid", "amount": amount, "raw": raw})
                db.commit()
            else:
                db.rollback()
            return get_order(db, order.id)

        if amount is not None and amount != order.total:
            log.warning("nominal pembayaran %s tidak sama dengan total order %s (%s)", amount, order.id, order.total)
            if payment is not None:
                _append_callback(payment, source, {"amount_mismatch": amount, "raw": raw})
            db.commit()
            raise KioskError(400, "AMOUNT_MISMATCH", "Nominal pembayaran tidak sesuai total order.")

        if order.status in ("CANCELLED", "EXPIRED") and source != "staff":
            # Uang masuk setelah order dibatalkan/kedaluwarsa: jangan ubah order & stok,
            # tandai pembayarannya supaya admin bisa refund / proses manual.
            if payment is not None:
                if payment.status != "PAID_LATE":
                    payment.status = "PAID_LATE"
                    payment.paid_at = now
                    payment.confirmed_by = source
                _append_callback(payment, source, raw)
            log.warning("pembayaran masuk untuk order %s yang sudah %s", order.order_number, order.status)
            db.commit()
            return get_order(db, order.id)

        items = db.execute(select(OrderItem).where(OrderItem.order_id == order.id)).scalars().all()
        # Kunci baris stok (urut product_id, baris yang belum ada dibuat) lewat service stok bersama.
        stocks = stock_svc.lock_stock_rows(db, order.branch_id, [i.product_id for i in items])
        for item in items:
            stock = stocks[item.product_id]
            stock_svc.apply_movement(
                db,
                stock,
                type="sale",
                delta=-item.qty,
                ref=order.order_number,
                note=f"Penjualan kiosk ({source})",
                created_by=source,
            )
            if stock.qty < 0:
                log.warning("stok produk %s cabang %s jadi negatif (%s)", item.product_id, order.branch_id, stock.qty)

        if order.status != "PENDING_PAYMENT":
            # Staf mengonfirmasi order yang sudah kedaluwarsa/batal (uang ternyata masuk).
            order.cancel_reason = f"{order.status} lalu dikonfirmasi lunas oleh {source}"
            order.cancelled_at = None
        order.status = "PAID"
        order.paid_at = now
        if payment is not None:
            payment.status = "PAID"
            payment.paid_at = now
            payment.confirmed_by = source
            _append_callback(payment, source, raw)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_order(db, order_id)


MAX_CALLBACK_EVENTS = 20


def _append_callback(payment: Payment, source: str, raw: Optional[dict[str, Any]]) -> None:
    """Simpan callback/konfirmasi sebagai riwayat (bukan ditimpa), supaya rekonsiliasi & sengketa bisa dilacak."""
    current = payment.raw_callback
    events = list(current.get("events", [])) if isinstance(current, dict) and "events" in current else ([current] if current else [])
    events.append({"at": now_utc().isoformat(), "source": source, "data": raw})
    # Assign objek baru supaya SQLAlchemy mendeteksi perubahan kolom JSONB.
    payment.raw_callback = {"events": events[-MAX_CALLBACK_EVENTS:]}


def find_order_by_provider_ref(db: Session, provider: str, provider_ref: str) -> Optional[int]:
    return db.execute(
        select(Payment.order_id).where(Payment.provider == provider, Payment.provider_ref == provider_ref)
    ).scalar_one_or_none()


# ---------------------------------------------------------------- batal


def cancel_order(db: Session, order_id: int, reason: str) -> Order:
    order = db.execute(
        select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if order is None:
        db.rollback()
        raise KioskError(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.")
    if order.status == "PAID":
        db.rollback()
        raise KioskError(409, "ALREADY_PAID", "Order sudah lunas, tidak bisa dibatalkan.")
    if order.status == "PENDING_PAYMENT":
        now = now_utc()
        order.status = "CANCELLED"
        order.cancelled_at = now
        order.cancel_reason = reason
        payments = db.execute(
            select(Payment)
            .where(Payment.order_id == order.id, Payment.status == "PENDING")
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalars().all()
        for p in payments:
            p.status = "CANCELLED"
            try:
                if p.provider == get_provider().name:
                    get_provider().cancel(p)
            except Exception:
                log.exception("cancel di provider gagal untuk payment %s", p.id)
    db.commit()
    return get_order(db, order_id)


# ---------------------------------------------------------------- staf


def list_staff_orders(db: Session, branch: Branch) -> dict[str, list[Order]]:
    since = now_utc() - timedelta(hours=12)
    base = select(Order).options(
        selectinload(Order.items), selectinload(Order.payments), selectinload(Order.branch)
    ).where(Order.branch_id == branch.id)
    pending = db.execute(base.where(Order.status == "PENDING_PAYMENT").order_by(Order.created_at.desc())).scalars().all()
    recent = db.execute(
        base.where(Order.status != "PENDING_PAYMENT", Order.created_at >= since).order_by(Order.created_at.desc()).limit(15)
    ).scalars().all()
    return {"pending": list(pending), "recent": list(recent)}
