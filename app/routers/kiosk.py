"""API kiosk self-service: /api/v1/kiosk/*

Auth ringan: semua endpoint (kecuali webhook gateway) butuh header X-Kiosk-Token == env KIOSK_DEVICE_TOKEN.
Endpoint staf juga butuh header X-Staff-Pin == env KIOSK_STAFF_PIN.
"""
from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order
from app.payments.base import WebhookRejected
from app.payments.providers import get_provider
from app.services import kiosk_orders as svc

log = logging.getLogger("kiosk")

STORE_NAME = "2M Sembako"


# ---------------------------------------------------------------- auth


def require_device(x_kiosk_token: str = Header(default="")) -> None:
    expected = os.getenv("KIOSK_DEVICE_TOKEN", "")
    # Fail closed: tanpa token di server, kiosk tidak bisa dipakai sama sekali.
    if not expected:
        raise HTTPException(503, detail={"code": "KIOSK_NOT_CONFIGURED", "message": "KIOSK_DEVICE_TOKEN belum diset di server."})
    if not secrets.compare_digest(x_kiosk_token, expected):
        raise HTTPException(401, detail={"code": "BAD_DEVICE_TOKEN", "message": "Perangkat kiosk tidak dikenali."})


_pin_lock = threading.Lock()
_pin_failures: list[float] = []
PIN_MAX_FAILURES = 5
PIN_WINDOW_SECONDS = 300


def require_staff(x_staff_pin: str = Header(default="")) -> None:
    expected = os.getenv("KIOSK_STAFF_PIN", "")
    if not expected:
        raise HTTPException(503, detail={"code": "STAFF_PIN_NOT_CONFIGURED", "message": "KIOSK_STAFF_PIN belum diset di server."})
    now = time.monotonic()
    with _pin_lock:
        _pin_failures[:] = [t for t in _pin_failures if now - t < PIN_WINDOW_SECONDS]
        if len(_pin_failures) >= PIN_MAX_FAILURES:
            raise HTTPException(429, detail={"code": "PIN_LOCKED", "message": "Terlalu banyak PIN salah. Coba lagi 5 menit lagi."})
        if not secrets.compare_digest(x_staff_pin, expected):
            _pin_failures.append(now)
            raise HTTPException(401, detail={"code": "BAD_PIN", "message": "PIN salah."})
        _pin_failures.clear()


router = APIRouter(prefix="/api/v1/kiosk", tags=["kiosk"])
device = [Depends(require_device)]
staff = [Depends(require_device), Depends(require_staff)]


def _err(e: svc.KioskError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"detail": {"code": e.code, "message": e.message, **e.extra}})


# ---------------------------------------------------------------- serialisasi


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def order_out(order: Order) -> dict[str, Any]:
    payment = svc.current_payment(order)
    provider = get_provider()
    expires_in = None
    if order.status == "PENDING_PAYMENT" and order.expires_at:
        expires_in = max(0, int((order.expires_at - svc.now_utc()).total_seconds()))
    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "total": order.total,
        "payment_method": order.payment_method,
        "created_at": _iso(order.created_at),
        "paid_at": _iso(order.paid_at),
        "expires_at": _iso(order.expires_at),
        "expires_in_seconds": expires_in,
        "cancel_reason": order.cancel_reason,
        "branch": {"id": order.branch.id, "name": order.branch.name, "address": order.branch.address} if order.branch else None,
        # Harga modal sengaja tidak dikirim ke kiosk.
        "items": [
            {"product_id": i.product_id, "name": i.product_name, "qty": i.qty, "unit_price": i.unit_price, "subtotal": i.subtotal}
            for i in order.items
        ],
        "payment": None
        if payment is None
        else {
            "provider": payment.provider,
            "status": payment.status,
            "qr_string": payment.qr_string,
            "qr_image_url": payment.qr_image_url,
            "expires_at": _iso(payment.expires_at),
            "needs_staff_confirmation": payment.provider == provider.name and provider.needs_staff_confirmation,
        },
    }


# ---------------------------------------------------------------- kiosk


@router.get("/config", dependencies=device)
def kiosk_config(branch: Optional[str] = None, db: Session = Depends(get_db)):
    try:
        b = svc.resolve_branch(db, branch)
    except svc.KioskError as e:
        return _err(e)
    provider = get_provider()
    return {
        "store_name": STORE_NAME,
        "branch": {"id": b.id, "name": b.name, "address": b.address, "whatsapp_number": b.whatsapp_number},
        "payment_provider": provider.name,
        "needs_staff_confirmation": provider.needs_staff_confirmation,
        "order_ttl_seconds": int(svc.order_ttl().total_seconds()),
        "server_time": svc.now_utc().isoformat(),
    }


@router.get("/products", dependencies=device)
def kiosk_products(branch: Optional[str] = None, db: Session = Depends(get_db)):
    try:
        b = svc.resolve_branch(db, branch)
    except svc.KioskError as e:
        return _err(e)
    products = svc.list_products(db, b)
    categories = sorted({p["category"] for p in products}, key=str.lower)
    return {"branch_id": b.id, "products": products, "categories": categories}


class OrderLineIn(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=svc.MAX_QTY_PER_ITEM)


class OrderIn(BaseModel):
    branch: Optional[str] = None
    # Harga/total dari client tidak diterima; server menghitung ulang dari database.
    items: List[OrderLineIn] = Field(min_length=1, max_length=svc.MAX_LINES)


@router.post("/orders", dependencies=device, status_code=201)
def kiosk_create_order(body: OrderIn, db: Session = Depends(get_db)):
    try:
        b = svc.resolve_branch(db, body.branch)
        order = svc.create_order(db, b, [svc.LineIn(i.product_id, i.qty) for i in body.items])
    except svc.KioskError as e:
        return _err(e)
    return order_out(order)


@router.get("/orders/{order_id}", dependencies=device)
def kiosk_get_order(order_id: int, db: Session = Depends(get_db)):
    try:
        svc.expire_stale_orders(db)
        order = svc.get_order(db, order_id)
        order = svc.refresh_from_provider(db, order)
    except svc.KioskError as e:
        return _err(e)
    return order_out(order)


@router.post("/orders/{order_id}/cancel", dependencies=device)
def kiosk_cancel_order(order_id: int, db: Session = Depends(get_db)):
    try:
        order = svc.cancel_order(db, order_id, "Dibatalkan pelanggan di kiosk")
    except svc.KioskError as e:
        return _err(e)
    return order_out(order)


# ---------------------------------------------------------------- webhook gateway (tanpa device token)


@router.post("/payments/webhook/{provider_name}")
async def payment_webhook(provider_name: str, request: Request, db: Session = Depends(get_db)):
    provider = get_provider()
    if provider_name != provider.name:
        raise HTTPException(404, detail="provider tidak aktif")
    try:
        event = await provider.verify_webhook(request)
    except WebhookRejected as e:
        log.warning("webhook %s ditolak: %s", provider_name, e)
        raise HTTPException(401, detail=str(e))
    order_id = svc.find_order_by_provider_ref(db, provider.name, event.provider_ref)
    if order_id is None:
        # 200 supaya gateway tidak mengulang terus untuk ref yang memang bukan milik kita.
        log.warning("webhook %s: provider_ref %s tidak dikenal", provider_name, event.provider_ref)
        return {"ok": True, "ignored": True}
    try:
        if event.status == "PAID":
            order = svc.mark_paid(db, order_id, source="webhook", raw=event.raw, amount=event.amount)
        elif event.status in ("EXPIRED", "FAILED"):
            order = svc.cancel_order(db, order_id, f"Pembayaran {event.status.lower()} di gateway")
        else:
            order = svc.get_order(db, order_id)
    except svc.KioskError as e:
        if e.code == "ALREADY_PAID":
            return {"ok": True}
        return _err(e)
    return {"ok": True, "status": order.status}


# ---------------------------------------------------------------- staf (PIN)


@router.post("/staff/login", dependencies=staff)
def staff_login():
    return {"ok": True}


@router.get("/staff/orders", dependencies=staff)
def staff_orders(branch: Optional[str] = None, db: Session = Depends(get_db)):
    try:
        svc.expire_stale_orders(db)
        b = svc.resolve_branch(db, branch)
    except svc.KioskError as e:
        return _err(e)
    lists = svc.list_staff_orders(db, b)
    return {"pending": [order_out(o) for o in lists["pending"]], "recent": [order_out(o) for o in lists["recent"]]}


@router.post("/staff/orders/{order_id}/mark-paid", dependencies=staff)
def staff_mark_paid(order_id: int, db: Session = Depends(get_db)):
    try:
        order = svc.mark_paid(db, order_id, source="staff", raw={"confirmed_by": "staff_pin"})
    except svc.KioskError as e:
        return _err(e)
    return order_out(order)


@router.post("/staff/orders/{order_id}/cancel", dependencies=staff)
def staff_cancel(order_id: int, db: Session = Depends(get_db)):
    try:
        order = svc.cancel_order(db, order_id, "Dibatalkan staf")
    except svc.KioskError as e:
        return _err(e)
    return order_out(order)
