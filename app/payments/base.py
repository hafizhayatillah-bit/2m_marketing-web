"""Antarmuka payment provider untuk QRIS.

Setiap provider (manual, mock, nanti Midtrans/Xendit) mengimplementasikan PaymentProvider.
Kode order (app/services/kiosk_orders.py) hanya bicara lewat antarmuka ini, jadi ganti
gateway cukup dengan menulis provider baru dan mengubah env PAYMENT_PROVIDER.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional, Protocol

from fastapi import Request


@dataclass
class QrisCharge:
    """Hasil create_qris: yang ditampilkan ke pelanggan + referensi di sisi provider."""

    provider_ref: str
    expires_at: Optional[datetime] = None
    # Salah satu (atau dua-duanya): string QRIS (dirender jadi QR di kiosk) atau URL gambar QR.
    qr_string: Optional[str] = None
    qr_image_url: Optional[str] = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookEvent:
    """Notifikasi dari provider yang sudah diverifikasi (tanda tangan valid)."""

    provider_ref: str
    status: str  # "PAID" | "FAILED" | "EXPIRED" | "PENDING"
    amount: Optional[int] = None
    raw: dict[str, Any] = field(default_factory=dict)


class WebhookRejected(Exception):
    """Webhook tidak lolos verifikasi (tanda tangan salah, provider tidak mendukung webhook, dsb)."""


class PaymentProvider(Protocol):
    name: str
    # True kalau pembayaran dikonfirmasi staf (bukan otomatis oleh gateway).
    needs_staff_confirmation: bool

    def create_qris(self, order: Any) -> QrisCharge:
        """Buat tagihan QRIS untuk order (order.order_number, order.total, order.expires_at)."""
        ...

    async def verify_webhook(self, request: Request) -> WebhookEvent:
        """Verifikasi tanda tangan webhook dan kembalikan event. Raise WebhookRejected kalau tidak valid."""
        ...

    def check_status(self, payment: Any) -> Optional[str]:
        """Opsional: tanya status ke provider (cadangan kalau webhook telat). Return "PAID"/None."""
        ...

    def cancel(self, payment: Any) -> None:
        """Opsional: batalkan tagihan di sisi provider."""
        ...
