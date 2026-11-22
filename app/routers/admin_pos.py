"""API JSON untuk admin toko kiosk (frontend admin-pos-web di /admin-pos): /api/v1/admin/*

Auth: cookie sesi dari POST /api/v1/admin/auth/login (lihat app/admin_session.py).
Semua perubahan stok lewat app/services/stock.py; mark-paid/cancel lewat app/services/kiosk_orders.py.
Uang dalam rupiah utuh. Tanggal filter (YYYY-MM-DD) dibaca sebagai tanggal WIB.
"""
from __future__ import annotations

import csv
import io
import os
from datetime import date, datetime, time, timedelta
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import admin_session
from app.database import get_db
from app.models import Branch, BranchStock, Expense, Order, OrderItem, Payment, Product, StockMovement
from app.services import kiosk_orders as orders_svc
from app.services import stock as stock_svc

WIB = orders_svc.WIB
TZ_NAME = "Asia/Jakarta"
PAGE_SIZE = 50

router = APIRouter(prefix="/api/v1/admin", tags=["admin-pos"])
# Tanpa prefix sendiri: di-include ke `router` di bawah.
authed = APIRouter(dependencies=[Depends(admin_session.require_admin_session)])


def _fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# ---------------------------------------------------------------- auth


class LoginIn(BaseModel):
    username: str = Field(max_length=200)
    password: str = Field(max_length=200)


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    if not admin_session.check_credentials(body.username, body.password, request):
        raise _fail(401, "BAD_CREDENTIALS", "Username atau password salah.")
    admin_session.set_session_cookie(response, request, body.username)
    return {"username": body.username}


@router.post("/auth/logout")
def logout(response: Response):
    admin_session.clear_session_cookie(response)
    return {"ok": True}


@authed.get("/auth/me")
def me(username: str = Depends(admin_session.require_admin_session)):
    return {"username": username}


# ---------------------------------------------------------------- helpers


def _branch_or_404(db: Session, branch_id: int) -> Branch:
    branch = db.get(Branch, branch_id)
    if branch is None:
        raise _fail(404, "BRANCH_NOT_FOUND", "Cabang tidak ditemukan.")
    return branch


def _product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise _fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan di katalog.")
    return product


def _parse_day(value: Optional[str], field: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _fail(422, "BAD_DATE", f"Tanggal {field} tidak valid (format YYYY-MM-DD).")


def _today() -> date:
    return datetime.now(WIB).date()


def _range(date_from: Optional[str], date_to: Optional[str], *, default_today: bool) -> tuple[Optional[datetime], Optional[datetime], Optional[date], Optional[date]]:
    """Tanggal WIB inklusif -> [awal, akhir) dalam datetime ber-zona."""
    d1 = _parse_day(date_from, "awal")
    d2 = _parse_day(date_to, "akhir")
    if default_today:
        d1 = d1 or d2 or _today()
        d2 = d2 or d1
    if d1 and d2 and d2 < d1:
        d1, d2 = d2, d1
    start = datetime.combine(d1, time.min, WIB) if d1 else None
    end = datetime.combine(d2 + timedelta(days=1), time.min, WIB) if d2 else None
    return start, end, d1, d2


def _local_day(col):
    return cast(func.timezone(TZ_NAME, col), Date)


def _state(stock: BranchStock, product: Product) -> str:
    if not stock.is_active or not product.is_active:
        return "hidden"
    if not product.price:
        return "no_price"
    if stock.qty <= 0:
        return "out"
    if stock.qty <= stock.min_qty:
        return "low"
    return "available"


def _margin(price: Optional[int], cost: Optional[int]) -> dict[str, Any]:
    if not price or cost is None:
        return {"margin": None, "margin_pct": None}
    return {"margin": price - cost, "margin_pct": round((price - cost) * 100 / price, 1)}


def _branch_product_out(stock: BranchStock, product: Product) -> dict[str, Any]:
    return {
        "product_id": product.id,
        "name": product.name,
        "sku": product.sku,
        "category": product.category,
        "image_url": product.image_url,
        "price": product.price,
        "cost_price": product.cost_price,
        "stock": stock.qty,
        "min_qty": stock.min_qty,
        "is_active": stock.is_active,
        "catalog_active": product.is_active,
        "state": _state(stock, product),
        "updated_at": _iso(stock.updated_at),
        **_margin(product.price, product.cost_price),
    }


# ---------------------------------------------------------------- cabang


@authed.get("/branches")
def list_branches(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(BranchStock.branch_id, func.count()).group_by(BranchStock.branch_id)).all())
    branches = db.execute(select(Branch).order_by(Branch.is_active.desc(), Branch.name)).scalars().all()
    default_id = None
    try:
        default_id = orders_svc.resolve_branch(db, None).id
    except orders_svc.KioskError:
        pass
    return {
        "default_branch_id": default_id,
        "branches": [
            {"id": b.id, "name": b.name, "address": b.address, "is_active": b.is_active, "product_count": counts.get(b.id, 0)}
            for b in branches
        ],
    }


# ---------------------------------------------------------------- produk per cabang


@authed.get("/products")
def list_branch_products(branch_id: int, db: Session = Depends(get_db)):
    _branch_or_404(db, branch_id)
    rows = db.execute(
        select(BranchStock, Product)
        .join(Product, Product.id == BranchStock.product_id)
        .where(BranchStock.branch_id == branch_id)
        .order_by(Product.category, Product.name)
    ).all()
    products = [_branch_product_out(s, p) for s, p in rows]
    summary = {k: 0 for k in ("available", "low", "out", "hidden", "no_price")}
    for p in products:
        summary[p["state"]] += 1
    summary["total"] = len(products)
    summary["stock_value"] = sum(max(0, p["stock"]) * (p["cost_price"] or 0) for p in products)
    categories = sorted({p["category"] for p in products}, key=str.lower)
    return {"products": products, "summary": summary, "categories": categories}


class BranchProductPatch(BaseModel):
    branch_id: int
    price: Optional[int] = Field(default=None, ge=1, le=100_000_000)
    cost_price: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    is_active: Optional[bool] = None
    min_qty: Optional[int] = Field(default=None, ge=0, le=100_000)


@authed.patch("/products/{product_id}")
def update_branch_product(product_id: int, body: BranchProductPatch, db: Session = Depends(get_db)):
    product = _product_or_404(db, product_id)
    stock = db.execute(
        select(BranchStock).where(BranchStock.branch_id == body.branch_id, BranchStock.product_id == product_id)
    ).scalar_one_or_none()
    if stock is None:
        raise _fail(404, "PRODUCT_NOT_IN_BRANCH", "Produk ini belum dijual di cabang ini.")
    fields = body.model_fields_set
    # Harga & modal ada di tabel products (dipakai kiosk semua cabang); aktif & batas menipis per cabang.
    if "price" in fields and body.price is not None:
        product.price = body.price
    if "cost_price" in fields:
        product.cost_price = body.cost_price
    if "is_active" in fields and body.is_active is not None:
        stock.is_active = body.is_active
    if "min_qty" in fields and body.min_qty is not None:
        stock.min_qty = body.min_qty
    db.commit()
    db.refresh(stock)
    db.refresh(product)
    return _branch_product_out(stock, product)


@authed.get("/products/available")
def products_not_in_branch(branch_id: int, q: Optional[str] = None, db: Session = Depends(get_db)):
    _branch_or_404(db, branch_id)
    in_branch = select(BranchStock.product_id).where(BranchStock.branch_id == branch_id)
    stmt = select(Product).where(Product.id.not_in(in_branch))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    products = db.execute(stmt.order_by(Product.name).limit(100)).scalars().all()
    return {"products": [_catalog_out(p, []) for p in products]}


class AddBranchProductIn(BaseModel):
    branch_id: int
    product_id: int
    price: int = Field(ge=1, le=100_000_000)
    cost_price: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    initial_qty: int = Field(default=0, ge=0, le=100_000)
    min_qty: int = Field(default=5, ge=0, le=100_000)
    is_active: bool = True


@authed.post("/products", status_code=201)
def add_product_to_branch(body: AddBranchProductIn, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    _branch_or_404(db, body.branch_id)
    product = _product_or_404(db, body.product_id)
    exists = db.execute(
        select(BranchStock.id).where(BranchStock.branch_id == body.branch_id, BranchStock.product_id == body.product_id)
    ).scalar_one_or_none()
    if exists:
        raise _fail(409, "PRODUCT_ALREADY_IN_BRANCH", "Produk ini sudah dijual di cabang ini.")
    try:
        stock = stock_svc.lock_stock_rows(db, body.branch_id, [body.product_id])[body.product_id]
        stock.is_active = body.is_active
        stock.min_qty = body.min_qty
        product.price = body.price
        if body.cost_price is not None:
            product.cost_price = body.cost_price
        if body.initial_qty > 0:
            stock_svc.apply_movement(
                db, stock, type="in", delta=body.initial_qty, unit_cost=body.cost_price,
                note="Stok awal saat produk ditambahkan ke cabang", created_by=username,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(stock)
    db.refresh(product)
    return _branch_product_out(stock, product)


# ---------------------------------------------------------------- katalog (master produk)


def _catalog_out(p: Product, branches: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "category": p.category,
        "description": p.description,
        "image_url": p.image_url,
        "is_active": p.is_active,
        "price": p.price,
        "cost_price": p.cost_price,
        "branches": branches,
    }


@authed.get("/catalog")
def list_catalog(q: Optional[str] = None, db: Session = Depends(get_db)):
    stmt = select(Product)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.category.ilike(like)))
    products = db.execute(stmt.order_by(Product.name)).scalars().all()
    sold: dict[int, list[dict[str, Any]]] = {}
    for pid, bid, bname in db.execute(
        select(BranchStock.product_id, Branch.id, Branch.name).join(Branch, Branch.id == BranchStock.branch_id)
    ).all():
        sold.setdefault(pid, []).append({"id": bid, "name": bname})
    categories = sorted(set(db.execute(select(Product.category).distinct()).scalars()), key=str.lower)
    return {"products": [_catalog_out(p, sold.get(p.id, [])) for p in products], "categories": categories}


class CatalogIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sku: Optional[str] = Field(default=None, max_length=40)
    category: str = Field(min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=4000)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    is_active: bool = True


class CatalogPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    sku: Optional[str] = Field(default=None, max_length=40)
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=4000)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None


def _clean_sku(sku: Optional[str]) -> Optional[str]:
    sku = (sku or "").strip().upper()
    return sku or None


def _commit_catalog(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "uq_products_sku" in str(exc.orig):
            raise _fail(409, "SKU_EXISTS", "SKU itu sudah dipakai produk lain.")
        raise


@authed.post("/catalog", status_code=201)
def create_catalog_product(body: CatalogIn, db: Session = Depends(get_db)):
    product = Product(
        name=body.name.strip(),
        sku=_clean_sku(body.sku),
        category=body.category.strip().lower(),
        description=(body.description or "").strip() or None,
        image_url=(body.image_url or "").strip() or None,
        is_active=body.is_active,
    )
    db.add(product)
    _commit_catalog(db)
    db.refresh(product)
    return _catalog_out(product, [])


@authed.patch("/catalog/{product_id}")
def update_catalog_product(product_id: int, body: CatalogPatch, db: Session = Depends(get_db)):
    product = _product_or_404(db, product_id)
    fields = body.model_fields_set
    if "name" in fields and body.name:
        product.name = body.name.strip()
    if "sku" in fields:
        product.sku = _clean_sku(body.sku)
    if "category" in fields and body.category:
        product.category = body.category.strip().lower()
    if "description" in fields:
        product.description = (body.description or "").strip() or None
    if "image_url" in fields:
        product.image_url = (body.image_url or "").strip() or None
    if "is_active" in fields and body.is_active is not None:
        product.is_active = body.is_active
    _commit_catalog(db)
    db.refresh(product)
    return _catalog_out(product, [])


MAX_IMAGE_BYTES = 8 * 1024 * 1024


@authed.post("/catalog/upload-image")
def upload_catalog_image(file: UploadFile = File(...)):
    if not os.getenv("CLOUDINARY_CLOUD_NAME"):
        raise _fail(503, "UPLOAD_NOT_CONFIGURED", "Upload foto belum dikonfigurasi (CLOUDINARY_* di server).")
    if not (file.content_type or "").startswith("image/"):
        raise _fail(422, "NOT_AN_IMAGE", "File harus berupa gambar (JPG, PNG atau WebP).")
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_IMAGE_BYTES:
        raise _fail(413, "IMAGE_TOO_LARGE", "Foto maksimal 8 MB.")
    from app.cloudinary_utils import upload_image  # impor di sini: modul ini mengonfigurasi Cloudinary saat diimpor

    try:
        url = upload_image(file, folder="products")
    except Exception:
        raise _fail(502, "UPLOAD_FAILED", "Foto gagal diunggah ke Cloudinary. Coba lagi.")
    return {"url": url}


# ---------------------------------------------------------------- stok


def _stock_err(e: stock_svc.StockError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"detail": {"code": e.code, "message": e.message}})


def _movement_out(m: StockMovement, name: Optional[str] = None, sku: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": m.id,
        "branch_id": m.branch_id,
        "product_id": m.product_id,
        "product_name": name,
        "sku": sku,
        "type": m.type,
        "qty": m.qty,
        "qty_after": m.qty_after,
        "unit_cost": m.unit_cost,
        "ref": m.ref,
        "note": m.note,
        "created_by": m.created_by,
        "created_at": _iso(m.created_at),
    }


class StockInLineIn(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=100_000)
    unit_cost: Optional[int] = Field(default=None, ge=0, le=100_000_000)


class StockInIn(BaseModel):
    branch_id: int
    items: List[StockInLineIn] = Field(min_length=1, max_length=200)
    ref: Optional[str] = Field(default=None, max_length=80)
    note: Optional[str] = Field(default=None, max_length=500)
    update_cost: bool = True


@authed.post("/stock/in")
def post_stock_in(body: StockInIn, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    _branch_or_404(db, body.branch_id)
    try:
        moves = stock_svc.stock_in(
            db, body.branch_id,
            [stock_svc.StockInLine(i.product_id, i.qty, i.unit_cost) for i in body.items],
            ref=(body.ref or "").strip() or None, note=(body.note or "").strip() or None,
            created_by=username, update_cost=body.update_cost,
        )
    except stock_svc.StockError as e:
        return _stock_err(e)
    return {"movements": [_movement_out(m) for m in moves]}


class AdjustIn(BaseModel):
    branch_id: int
    product_id: int
    type: Literal["out", "adjust"]
    delta: int = Field(ge=-100_000, le=100_000)
    note: str = Field(min_length=1, max_length=500)


@authed.post("/stock/adjust")
def post_adjust(body: AdjustIn, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    _branch_or_404(db, body.branch_id)
    try:
        m = stock_svc.adjust(db, body.branch_id, body.product_id, delta=body.delta, type=body.type, note=body.note, created_by=username)
    except stock_svc.StockError as e:
        return _stock_err(e)
    return _movement_out(m)


class OpnameLineIn(BaseModel):
    product_id: int
    counted: int = Field(ge=0, le=1_000_000)
    # Stok sistem yang tampil saat barang dihitung (lihat stock_svc.opname). Opsional untuk kompatibilitas.
    system_qty: Optional[int] = Field(default=None, ge=-1_000_000, le=1_000_000)


class OpnameIn(BaseModel):
    branch_id: int
    items: List[OpnameLineIn] = Field(min_length=1, max_length=2000)
    note: Optional[str] = Field(default=None, max_length=500)


@authed.post("/stock/opname")
def post_opname(body: OpnameIn, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    _branch_or_404(db, body.branch_id)
    ref = f"OPN-{datetime.now(WIB):%y%m%d-%H%M}"
    try:
        results = stock_svc.opname(
            db, body.branch_id, [stock_svc.OpnameLine(i.product_id, i.counted, i.system_qty) for i in body.items],
            ref=ref, note=(body.note or "").strip() or None, created_by=username,
        )
    except stock_svc.StockError as e:
        return _stock_err(e)
    return {
        "ref": ref,
        "results": [
            {"product_id": r.product_id, "system_qty": r.system_qty, "counted": r.counted, "diff": r.diff}
            for r in results
        ],
        "changed": sum(1 for r in results if r.diff != 0),
    }


@authed.get("/stock/movements")
def list_movements(
    branch_id: int,
    product_id: Optional[int] = None,
    type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    start, end, _, _ = _range(date_from, date_to, default_today=False)
    stmt = (
        select(StockMovement, Product.name, Product.sku)
        .join(Product, Product.id == StockMovement.product_id)
        .where(StockMovement.branch_id == branch_id)
    )
    if product_id:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if type:
        stmt = stmt.where(StockMovement.type.in_(type.split(",")))
    if start:
        stmt = stmt.where(StockMovement.created_at >= start)
    if end:
        stmt = stmt.where(StockMovement.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), StockMovement.ref.ilike(like), StockMovement.note.ilike(like)))
    rows = db.execute(
        stmt.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1)
    ).all()
    return {
        "movements": [_movement_out(m, name, sku) for m, name, sku in rows[:PAGE_SIZE]],
        "page": page,
        "has_more": len(rows) > PAGE_SIZE,
    }


# ---------------------------------------------------------------- transaksi


def _order_cost(order: Order) -> tuple[int, int]:
    cost = sum((i.cost_price or 0) * i.qty for i in order.items)
    missing = sum(1 for i in order.items if i.cost_price is None)
    return cost, missing


def _order_out(order: Order, *, detail: bool = False) -> dict[str, Any]:
    payment = orders_svc.current_payment(order)
    cost, missing = _order_cost(order)
    out: dict[str, Any] = {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "channel": order.channel,
        "total": order.total,
        "cost": cost,
        "profit": order.total - cost,
        "missing_cost_items": missing,
        "item_count": sum(i.qty for i in order.items),
        "line_count": len(order.items),
        "payment_method": order.payment_method,
        "created_at": _iso(order.created_at),
        "paid_at": _iso(order.paid_at),
        "expires_at": _iso(order.expires_at),
        "cancelled_at": _iso(order.cancelled_at),
        "cancel_reason": order.cancel_reason,
        "payment": None
        if payment is None
        else {
            "provider": payment.provider,
            "provider_ref": payment.provider_ref,
            "status": payment.status,
            "amount": payment.amount,
            "paid_at": _iso(payment.paid_at),
            "confirmed_by": payment.confirmed_by,
        },
    }
    if detail:
        out["branch"] = {"id": order.branch.id, "name": order.branch.name, "address": order.branch.address} if order.branch else None
        out["items"] = [
            {
                "product_id": i.product_id,
                "name": i.product_name,
                "sku": i.sku,
                "qty": i.qty,
                "unit_price": i.unit_price,
                "cost_price": i.cost_price,
                "subtotal": i.subtotal,
                "profit": None if i.cost_price is None else i.subtotal - i.cost_price * i.qty,
            }
            for i in order.items
        ]
        out["payments"] = [
            {
                "id": p.id,
                "provider": p.provider,
                "provider_ref": p.provider_ref,
                "status": p.status,
                "amount": p.amount,
                "created_at": _iso(p.created_at),
                "paid_at": _iso(p.paid_at),
                "confirmed_by": p.confirmed_by,
            }
            for p in order.payments
        ]
    return out


@authed.get("/orders")
def list_orders(
    branch_id: int,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    orders_svc.expire_stale_orders(db)
    start, end, _, _ = _range(date_from, date_to, default_today=False)
    conds = [Order.branch_id == branch_id]
    if start:
        conds.append(Order.created_at >= start)
    if end:
        conds.append(Order.created_at < end)
    if q:
        conds.append(Order.order_number.ilike(f"%{q.strip()}%"))
    counts = dict(db.execute(select(Order.status, func.count()).where(*conds).group_by(Order.status)).all())
    late = db.execute(
        select(func.count()).select_from(Payment).join(Order, Order.id == Payment.order_id).where(*conds, Payment.status == "PAID_LATE")
    ).scalar_one()
    stmt = select(Order).options(selectinload(Order.items), selectinload(Order.payments)).where(*conds)
    if status:
        stmt = stmt.where(Order.status.in_(status.split(",")))
    orders = db.execute(
        stmt.order_by(Order.created_at.desc(), Order.id.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1)
    ).scalars().all()
    return {
        "orders": [_order_out(o) for o in orders[:PAGE_SIZE]],
        "page": page,
        "has_more": len(orders) > PAGE_SIZE,
        "counts": {**{s: counts.get(s, 0) for s in ("PENDING_PAYMENT", "PAID", "CANCELLED", "EXPIRED")}, "all": sum(counts.values()), "paid_late": late},
    }


def _kiosk_err(e: orders_svc.KioskError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"detail": {"code": e.code, "message": e.message, **e.extra}})


@authed.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db)):
    try:
        return _order_out(orders_svc.get_order(db, order_id), detail=True)
    except orders_svc.KioskError as e:
        return _kiosk_err(e)


@authed.post("/orders/{order_id}/mark-paid")
def mark_paid(order_id: int, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    # source="staff": sama dengan panel staf kiosk (boleh mengonfirmasi order yang sudah kedaluwarsa).
    try:
        order = orders_svc.mark_paid(db, order_id, source="staff", raw={"confirmed_by": "admin_pos", "user": username})
    except orders_svc.KioskError as e:
        return _kiosk_err(e)
    return _order_out(order, detail=True)


@authed.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    try:
        order = orders_svc.cancel_order(db, order_id, f"Dibatalkan admin ({username})")
    except orders_svc.KioskError as e:
        return _kiosk_err(e)
    return _order_out(order, detail=True)


# ---------------------------------------------------------------- biaya operasional


DEFAULT_EXPENSE_CATEGORIES = ["Listrik", "Air", "Internet", "Sewa", "Gaji staf", "Plastik & kemasan", "Kebersihan", "Transport", "Biaya QRIS", "Lain-lain"]


def _expense_out(e: Expense) -> dict[str, Any]:
    return {
        "id": e.id,
        "branch_id": e.branch_id,
        "spent_on": e.spent_on.isoformat(),
        "category": e.category,
        "amount": e.amount,
        "note": e.note,
        "created_by": e.created_by,
        "created_at": _iso(e.created_at),
    }


@authed.get("/expenses")
def list_expenses(branch_id: int, date_from: Optional[str] = None, date_to: Optional[str] = None, db: Session = Depends(get_db)):
    _branch_or_404(db, branch_id)
    _, _, d1, d2 = _range(date_from, date_to, default_today=False)
    stmt = select(Expense).where(Expense.branch_id == branch_id)
    if d1:
        stmt = stmt.where(Expense.spent_on >= d1)
    if d2:
        stmt = stmt.where(Expense.spent_on <= d2)
    rows = db.execute(stmt.order_by(Expense.spent_on.desc(), Expense.id.desc()).limit(1000)).scalars().all()
    used = db.execute(select(Expense.category).where(Expense.branch_id == branch_id).distinct()).scalars().all()
    categories = DEFAULT_EXPENSE_CATEGORIES + sorted(c for c in used if c not in DEFAULT_EXPENSE_CATEGORIES)
    return {"expenses": [_expense_out(e) for e in rows], "total": sum(e.amount for e in rows), "categories": categories}


class ExpenseIn(BaseModel):
    branch_id: int
    spent_on: date
    category: str = Field(min_length=1, max_length=40)
    amount: int = Field(ge=1, le=1_000_000_000)
    note: Optional[str] = Field(default=None, max_length=500)


class ExpensePatch(BaseModel):
    spent_on: Optional[date] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
    amount: Optional[int] = Field(default=None, ge=1, le=1_000_000_000)
    note: Optional[str] = Field(default=None, max_length=500)


def _check_day(d: date) -> None:
    if d > _today():
        raise _fail(422, "FUTURE_DATE", "Tanggal biaya tidak boleh setelah hari ini.")


@authed.post("/expenses", status_code=201)
def create_expense(body: ExpenseIn, db: Session = Depends(get_db), username: str = Depends(admin_session.require_admin_session)):
    _branch_or_404(db, body.branch_id)
    _check_day(body.spent_on)
    e = Expense(
        branch_id=body.branch_id, spent_on=body.spent_on, category=body.category.strip(), amount=body.amount,
        note=(body.note or "").strip() or None, created_by=username,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _expense_out(e)


def _expense_or_404(db: Session, expense_id: int) -> Expense:
    e = db.get(Expense, expense_id)
    if e is None:
        raise _fail(404, "EXPENSE_NOT_FOUND", "Catatan biaya tidak ditemukan.")
    return e


@authed.patch("/expenses/{expense_id}")
def update_expense(expense_id: int, body: ExpensePatch, db: Session = Depends(get_db)):
    e = _expense_or_404(db, expense_id)
    fields = body.model_fields_set
    if "spent_on" in fields and body.spent_on:
        _check_day(body.spent_on)
        e.spent_on = body.spent_on
    if "category" in fields and body.category:
        e.category = body.category.strip()
    if "amount" in fields and body.amount:
        e.amount = body.amount
    if "note" in fields:
        e.note = (body.note or "").strip() or None
    db.commit()
    db.refresh(e)
    return _expense_out(e)


@authed.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    e = _expense_or_404(db, expense_id)
    db.delete(e)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- laporan


def _paid_conds(branch_id: int, start: datetime, end: datetime) -> list:
    return [Order.branch_id == branch_id, Order.status == "PAID", Order.paid_at >= start, Order.paid_at < end]


ITEM_COST = func.coalesce(OrderItem.cost_price, 0) * OrderItem.qty


def _totals(db: Session, conds: list) -> dict[str, Any]:
    trx = db.execute(select(func.count(), func.coalesce(func.sum(Order.total), 0)).where(*conds)).one()
    items = db.execute(
        select(
            func.coalesce(func.sum(OrderItem.subtotal), 0),
            func.coalesce(func.sum(ITEM_COST), 0),
            func.coalesce(func.sum(OrderItem.qty), 0),
            func.count().filter(OrderItem.cost_price.is_(None)),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(*conds)
    ).one()
    count, total = int(trx[0]), int(trx[1])
    omzet, hpp, qty, missing = int(items[0]), int(items[1]), int(items[2]), int(items[3])
    return {
        "omzet": omzet,
        "hpp": hpp,
        "laba_kotor": omzet - hpp,
        "margin_pct": round((omzet - hpp) * 100 / omzet, 1) if omzet else None,
        "transactions": count,
        "avg_basket": round(total / count) if count else 0,
        "items_sold": qty,
        "missing_cost_lines": missing,
    }


PURCHASE_VALUE = StockMovement.qty * func.coalesce(StockMovement.unit_cost, 0)


def _purchase_conds(branch_id: int, start: datetime, end: datetime) -> list:
    return [StockMovement.branch_id == branch_id, StockMovement.type == "in", StockMovement.created_at >= start, StockMovement.created_at < end]


def _finance(db: Session, branch_id: int, start: datetime, end: datetime, d1: date, d2: date, sales: dict[str, Any]) -> dict[str, Any]:
    """Pembelian barang (barang masuk), biaya operasional, laba bersih, dan arus uang untuk satu rentang."""
    p = db.execute(
        select(
            func.coalesce(func.sum(PURCHASE_VALUE), 0),
            func.coalesce(func.sum(StockMovement.qty), 0),
            func.count(),
            func.count().filter(StockMovement.unit_cost.is_(None)),
        ).where(*_purchase_conds(branch_id, start, end))
    ).one()
    by_cat = db.execute(
        select(Expense.category, func.sum(Expense.amount), func.count())
        .where(Expense.branch_id == branch_id, Expense.spent_on >= d1, Expense.spent_on <= d2)
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
    ).all()
    biaya = sum(int(r[1]) for r in by_cat)
    pembelian = int(p[0])
    laba_bersih = sales["laba_kotor"] - biaya
    return {
        "pembelian": pembelian,
        "pembelian_qty": int(p[1]),
        "pembelian_lines": int(p[2]),
        "pembelian_tanpa_modal": int(p[3]),
        "biaya": biaya,
        "biaya_per_kategori": [{"category": c, "amount": int(a), "count": int(n)} for c, a, n in by_cat],
        "laba_bersih": laba_bersih,
        "margin_bersih_pct": round(laba_bersih * 100 / sales["omzet"], 1) if sales["omzet"] else None,
        # Arus uang (dasar kas): uang masuk dari penjualan, keluar untuk belanja barang dan biaya.
        "kas_masuk": sales["omzet"],
        "kas_keluar": pembelian + biaya,
        "kas_bersih": sales["omzet"] - pembelian - biaya,
    }


def _per_product(db: Session, conds: list) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            OrderItem.product_id,
            func.max(OrderItem.product_name),
            func.max(OrderItem.sku),
            func.sum(OrderItem.qty),
            func.sum(OrderItem.subtotal),
            func.sum(ITEM_COST),
            func.count().filter(OrderItem.cost_price.is_(None)),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(*conds)
        .group_by(OrderItem.product_id)
    ).all()
    out = []
    for pid, name, sku, qty, omzet, hpp, missing in rows:
        omzet, hpp = int(omzet), int(hpp)
        out.append({
            "product_id": pid, "name": name, "sku": sku, "qty": int(qty), "omzet": omzet, "hpp": hpp,
            "laba": omzet - hpp, "margin_pct": round((omzet - hpp) * 100 / omzet, 1) if omzet else None,
            "missing_cost_lines": int(missing),
        })
    return sorted(out, key=lambda r: (-r["qty"], -r["omzet"]))


def _daily(
    db: Session, conds: list, d1: date, d2: date,
    branch_id: Optional[int] = None, start: Optional[datetime] = None, end: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    day = _local_day(Order.paid_at)
    per_day_items = dict(
        (r[0], (int(r[1]), int(r[2])))
        for r in db.execute(
            select(day, func.sum(OrderItem.subtotal), func.sum(ITEM_COST))
            .join(Order, Order.id == OrderItem.order_id)
            .where(*conds)
            .group_by(day)
        ).all()
    )
    per_day_trx = dict(db.execute(select(day, func.count()).where(*conds).group_by(day)).all())
    per_day_buy: dict[date, int] = {}
    per_day_cost: dict[date, int] = {}
    if branch_id is not None and start is not None and end is not None:
        mday = _local_day(StockMovement.created_at)
        per_day_buy = {r[0]: int(r[1]) for r in db.execute(
            select(mday, func.sum(PURCHASE_VALUE)).where(*_purchase_conds(branch_id, start, end)).group_by(mday)
        ).all()}
        per_day_cost = {r[0]: int(r[1]) for r in db.execute(
            select(Expense.spent_on, func.sum(Expense.amount))
            .where(Expense.branch_id == branch_id, Expense.spent_on >= d1, Expense.spent_on <= d2)
            .group_by(Expense.spent_on)
        ).all()}
    out = []
    d = d1
    while d <= d2:
        omzet, hpp = per_day_items.get(d, (0, 0))
        biaya = per_day_cost.get(d, 0)
        pembelian = per_day_buy.get(d, 0)
        out.append({
            "date": d.isoformat(), "omzet": omzet, "hpp": hpp, "laba_kotor": omzet - hpp, "transactions": int(per_day_trx.get(d, 0)),
            "biaya": biaya, "laba_bersih": omzet - hpp - biaya, "pembelian": pembelian, "kas_bersih": omzet - pembelian - biaya,
        })
        d += timedelta(days=1)
    return out


def _low_stock(db: Session, branch_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(BranchStock, Product)
        .join(Product, Product.id == BranchStock.product_id)
        .where(BranchStock.branch_id == branch_id, BranchStock.is_active == True, BranchStock.qty <= BranchStock.min_qty)  # noqa: E712
        .order_by(BranchStock.qty, Product.name)
    ).all()
    return [_branch_product_out(s, p) for s, p in rows]


MAX_RANGE_DAYS = 400


def _report_range(date_from: Optional[str], date_to: Optional[str]):
    start, end, d1, d2 = _range(date_from, date_to, default_today=True)
    if (d2 - d1).days > MAX_RANGE_DAYS:
        raise _fail(422, "RANGE_TOO_LONG", f"Rentang laporan maksimal {MAX_RANGE_DAYS} hari.")
    return start, end, d1, d2


@authed.get("/reports/summary")
def report_summary(branch_id: int, date_from: Optional[str] = None, date_to: Optional[str] = None, db: Session = Depends(get_db)):
    _branch_or_404(db, branch_id)
    start, end, d1, d2 = _report_range(date_from, date_to)
    conds = _paid_conds(branch_id, start, end)
    t_start, t_end, _, _ = _range(None, None, default_today=True)
    pending = db.execute(
        select(func.count()).select_from(Order).where(Order.branch_id == branch_id, Order.status == "PENDING_PAYMENT")
    ).scalar_one()
    today = _totals(db, _paid_conds(branch_id, t_start, t_end))
    today.update(_finance(db, branch_id, t_start, t_end, _today(), _today(), today))
    totals = _totals(db, conds)
    totals.update(_finance(db, branch_id, start, end, d1, d2, totals))
    return {
        "branch_id": branch_id,
        "date_from": d1.isoformat(),
        "date_to": d2.isoformat(),
        "today": today,
        "range": totals,
        "daily": _daily(db, conds, d1, d2, branch_id, start, end),
        "products": _per_product(db, conds),
        "low_stock": _low_stock(db, branch_id),
        "pending_orders": int(pending),
    }


def _csv_cell(v: Any) -> Any:
    # Teks yang diawali = + - @ (atau tab/CR) dijalankan Excel sebagai formula (mis. nama produk/catatan
    # "=HYPERLINK(...)"). Diberi awalan ' supaya tampil sebagai teks. Angka (int) tidak disentuh.
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _csv_response(filename: str, header: list[str], rows: list[list[Any]]) -> Response:
    buf = io.StringIO()
    # ";" karena Excel dengan setelan Indonesia memakai titik koma sebagai pemisah daftar. BOM supaya UTF-8 terbaca.
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(header)
    writer.writerows([[_csv_cell(v) for v in row] for row in rows])
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@authed.get("/reports/export")
def report_export(
    branch_id: int,
    kind: Literal["daily", "products", "orders", "items", "purchases", "expenses"] = "daily",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    _branch_or_404(db, branch_id)
    start, end, d1, d2 = _report_range(date_from, date_to)
    conds = _paid_conds(branch_id, start, end)
    stamp = f"{d1:%Y%m%d}-{d2:%Y%m%d}"
    if kind == "daily":
        rows = [[r["date"], r["transactions"], r["omzet"], r["hpp"], r["laba_kotor"], r["biaya"], r["laba_bersih"], r["pembelian"], r["kas_bersih"]]
                for r in _daily(db, conds, d1, d2, branch_id, start, end)]
        return _csv_response(
            f"keuangan-harian-{stamp}.csv",
            ["tanggal", "transaksi", "omzet", "hpp", "laba_kotor", "biaya_operasional", "laba_bersih", "pembelian_barang", "kas_bersih"],
            rows,
        )
    if kind == "purchases":
        moves = db.execute(
            select(StockMovement, Product.name, Product.sku)
            .join(Product, Product.id == StockMovement.product_id)
            .where(*_purchase_conds(branch_id, start, end))
            .order_by(StockMovement.created_at)
        ).all()
        rows = [[m.created_at.astimezone(WIB).strftime("%Y-%m-%d %H:%M"), m.ref or "", sku or "", name, m.qty,
                 "" if m.unit_cost is None else m.unit_cost, m.qty * (m.unit_cost or 0), m.note or "", m.created_by or ""]
                for m, name, sku in moves]
        return _csv_response(f"pembelian-barang-{stamp}.csv",
                             ["waktu", "no_nota", "sku", "produk", "qty", "modal_per_unit", "total", "catatan", "oleh"], rows)
    if kind == "expenses":
        exps = db.execute(
            select(Expense)
            .where(Expense.branch_id == branch_id, Expense.spent_on >= d1, Expense.spent_on <= d2)
            .order_by(Expense.spent_on, Expense.id)
        ).scalars().all()
        rows = [[e.spent_on.isoformat(), e.category, e.amount, e.note or "", e.created_by or ""] for e in exps]
        return _csv_response(f"biaya-operasional-{stamp}.csv", ["tanggal", "kategori", "jumlah", "catatan", "oleh"], rows)
    if kind == "products":
        rows = [[r["sku"] or "", r["name"], r["qty"], r["omzet"], r["hpp"], r["laba"], r["margin_pct"] if r["margin_pct"] is not None else ""] for r in _per_product(db, conds)]
        return _csv_response(f"laba-per-produk-{stamp}.csv", ["sku", "produk", "qty", "omzet", "hpp", "laba_kotor", "margin_persen"], rows)
    orders = db.execute(
        select(Order).options(selectinload(Order.items), selectinload(Order.payments)).where(*conds).order_by(Order.paid_at)
    ).scalars().all()
    if kind == "orders":
        rows = []
        for o in orders:
            cost, _ = _order_cost(o)
            p = orders_svc.current_payment(o)
            rows.append([o.order_number, o.paid_at.astimezone(WIB).strftime("%Y-%m-%d %H:%M"), len(o.items), sum(i.qty for i in o.items),
                         o.total, cost, o.total - cost, o.payment_method, p.provider if p else "", p.confirmed_by if p else ""])
        return _csv_response(f"transaksi-{stamp}.csv", ["no_order", "waktu_bayar", "jenis_barang", "qty", "total", "hpp", "laba_kotor", "metode", "provider", "dikonfirmasi"], rows)
    rows = []
    for o in orders:
        for i in o.items:
            cost = (i.cost_price or 0) * i.qty
            rows.append([o.order_number, o.paid_at.astimezone(WIB).strftime("%Y-%m-%d %H:%M"), i.sku or "", i.product_name, i.qty,
                         i.unit_price, "" if i.cost_price is None else i.cost_price, i.subtotal, cost, i.subtotal - cost])
    return _csv_response(f"item-terjual-{stamp}.csv", ["no_order", "waktu_bayar", "sku", "produk", "qty", "harga", "modal", "subtotal", "hpp", "laba_kotor"], rows)


router.include_router(authed)
