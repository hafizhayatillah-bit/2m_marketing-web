"""Implementasi provider QRIS. Pilih lewat env PAYMENT_PROVIDER=manual|mock|midtrans|xendit."""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional

from fastapi import Request

from app.payments.base import PaymentProvider, QrisCharge, WebhookEvent, WebhookRejected


class ManualQrisProvider:
    """QRIS statis toko (gambar QR yang dicetak/ditempel di toko).

    Pelanggan scan QR statis, isi nominal total yang tampil di layar, lalu staf mengecek mutasi
    di aplikasi merchant dan menandai order LUNAS lewat layar staf (PIN). Tidak ada webhook.
    """

    name = "manual"
    needs_staff_confirmation = True

    def __init__(self) -> None:
        self.image_url = os.getenv("KIOSK_QRIS_IMAGE_URL", "/kiosk/qris-static.png")

    def create_qris(self, order: Any) -> QrisCharge:
        return QrisCharge(
            provider_ref=f"manual-{order.order_number}",
            expires_at=order.expires_at,
            qr_image_url=self.image_url,
        )

    async def verify_webhook(self, request: Request) -> WebhookEvent:
        raise WebhookRejected("provider manual tidak menerima webhook; konfirmasi lewat layar staf")

    def check_status(self, payment: Any) -> Optional[str]:
        return None

    def cancel(self, payment: Any) -> None:
        return None


class MockQrisProvider:
    """Untuk development/test lokal. Bayar otomatis setelah MOCK_AUTO_PAY_SECONDS (0 = tidak otomatis),
    atau lewat POST /api/v1/kiosk/payments/webhook/mock {"provider_ref": "...", "status": "PAID"}.
    """

    name = "mock"
    needs_staff_confirmation = False

    def __init__(self) -> None:
        self.auto_pay_seconds = int(os.getenv("MOCK_AUTO_PAY_SECONDS", "8"))
        self.webhook_secret = os.getenv("MOCK_WEBHOOK_SECRET", "")

    def create_qris(self, order: Any) -> QrisCharge:
        ref = f"mock-{order.order_number}"
        # Bukan QRIS sungguhan (tidak bisa dibayar), cuma supaya kiosk bisa merender QR.
        return QrisCharge(
            provider_ref=ref,
            expires_at=order.expires_at,
            qr_string=f"MOCKQRIS|{ref}|{order.total}",
        )

    async def verify_webhook(self, request: Request) -> WebhookEvent:
        if self.webhook_secret:
            got = request.headers.get("x-mock-signature", "")
            if not hmac.compare_digest(got, self.webhook_secret):
                raise WebhookRejected("signature mock salah")
        body = await request.json()
        if not isinstance(body, dict) or not body.get("provider_ref"):
            raise WebhookRejected("payload mock tidak valid")
        return WebhookEvent(
            provider_ref=str(body["provider_ref"]),
            status=str(body.get("status", "PAID")).upper(),
            amount=body.get("amount"),
            raw=body,
        )

    def check_status(self, payment: Any) -> Optional[str]:
        if self.auto_pay_seconds <= 0 or payment.created_at is None:
            return None
        age = (datetime.now(timezone.utc) - payment.created_at).total_seconds()
        return "PAID" if age >= self.auto_pay_seconds else None

    def cancel(self, payment: Any) -> None:
        return None


# ---------------------------------------------------------------------------------------------
# TODO(gateway): Midtrans / Xendit
#
# Cara pasang gateway sungguhan nanti:
#   1. Isi kelas di bawah (create_qris memanggil API gateway, verify_webhook mengecek tanda tangan).
#      - Midtrans Core API: POST /v2/charge {"payment_type": "qris", "transaction_details": {...}}
#        -> actions[].url (gambar QR) / qr_string; webhook diverifikasi dengan
#        signature_key = SHA512(order_id + status_code + gross_amount + SERVER_KEY).
#        transaction_status "settlement" = PAID, "expire" = EXPIRED, "cancel"/"deny" = FAILED.
#      - Xendit: POST /qr_codes {"type": "DYNAMIC", "amount": ..., "reference_id": ...} -> qr_string;
#        webhook diverifikasi dengan header x-callback-token == XENDIT_CALLBACK_TOKEN.
#   2. Simpan server key / callback token di env Render (JANGAN di kiosk-web).
#   3. Set PAYMENT_PROVIDER=midtrans (atau xendit) dan daftarkan URL webhook di dashboard gateway:
#      https://<domain>/api/v1/kiosk/payments/webhook/midtrans
# ---------------------------------------------------------------------------------------------
class GatewayQrisProviderStub:
    needs_staff_confirmation = False

    def __init__(self, name: str) -> None:
        self.name = name

    def create_qris(self, order: Any) -> QrisCharge:
        raise NotImplementedError(f"provider {self.name} belum diimplementasikan (lihat TODO di app/payments/providers.py)")

    async def verify_webhook(self, request: Request) -> WebhookEvent:
        raise WebhookRejected(f"provider {self.name} belum diimplementasikan")

    def check_status(self, payment: Any) -> Optional[str]:
        return None

    def cancel(self, payment: Any) -> None:
        return None


@lru_cache(maxsize=1)
def get_provider() -> PaymentProvider:
    name = os.getenv("PAYMENT_PROVIDER", "manual").strip().lower()
    if name == "manual":
        return ManualQrisProvider()
    if name == "mock":
        return MockQrisProvider()
    if name in ("midtrans", "xendit"):
        return GatewayQrisProviderStub(name)
    raise RuntimeError(f"PAYMENT_PROVIDER tidak dikenal: {name!r}")
