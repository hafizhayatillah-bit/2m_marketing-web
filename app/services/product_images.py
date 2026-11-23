"""Bersih-bersih foto produk di Cloudinary.

Foto produk disimpan sebagai URL di products.image_url (dan featured_products.image_url).
Saat foto diganti/dihapus atau produknya dihapus, file lamanya ikut dihapus dari Cloudinary,
asal URL itu sudah tidak dipakai baris lain. Gagal hapus tidak menggagalkan request: cukup dicatat.
"""
from __future__ import annotations

import logging
import os
from typing import Iterable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import FeaturedProduct, Product

log = logging.getLogger(__name__)


def _still_used(db: Session, url: str) -> bool:
    return bool(
        db.execute(select(Product.id).where(Product.image_url == url).limit(1)).first()
        or db.execute(select(FeaturedProduct.id).where(FeaturedProduct.image_url == url).limit(1)).first()
    )


def destroy_unused(db: Session, urls: Iterable[Optional[str]]) -> None:
    """Panggil SETELAH commit: hapus dari Cloudinary tiap URL yang sudah tidak dipakai."""
    if not os.getenv("CLOUDINARY_CLOUD_NAME"):
        return
    from app.cloudinary_utils import delete_image  # impor di sini: modul itu mengonfigurasi Cloudinary saat diimpor

    for url in {u for u in urls if u}:
        if _still_used(db, url):
            continue
        try:
            delete_image(url)
        except Exception:  # noqa: BLE001 - jaringan/kredensial; foto yatim tidak boleh menggagalkan simpan
            log.warning("Gagal menghapus foto lama dari Cloudinary: %s", url, exc_info=True)
