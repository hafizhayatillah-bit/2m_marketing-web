"""Seed data test buat validasi endpoint publik Day 8 (Card 2-5).

Semua row diberi prefix "TEST -" di field name/title biar gampang dikenali
dan aman dihapus lagi lewat scripts/cleanup_test_data.py setelah validasi selesai.
"""
from datetime import date, timedelta

from app.database import SessionLocal
from app.models import Branch, Promo, Product, News

today = date.today()

db = SessionLocal()
try:
    db.add(
        Branch(
            name="TEST - Cabang Bekasi",
            address="Jl. Test No. 1",
            city="Bekasi",  # sengaja huruf besar buat test filter ?city=bekasi
            latitude=-6.2383,
            longitude=106.9756,
            whatsapp_number="081200000000",
            operating_hours="08:00-17:00",
            category_tags=["sembako"],
            is_active=True,
        )
    )

    # promo aktif & mepet hari ini -> HARUS muncul
    db.add(
        Promo(
            title="TEST - Promo Aktif Hari Ini",
            description="Promo untuk validasi filter tanggal",
            normal_price=10000,
            promo_price=8000,
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=1),
            is_active=True,
        )
    )
    # promo sudah lewat end_date -> HARUS ke-exclude walau is_active=True
    db.add(
        Promo(
            title="TEST - Promo Kadaluarsa",
            normal_price=10000,
            promo_price=8000,
            start_date=today - timedelta(days=10),
            end_date=today - timedelta(days=1),
            is_active=True,
        )
    )
    # promo belum mulai -> HARUS ke-exclude
    db.add(
        Promo(
            title="TEST - Promo Belum Mulai",
            normal_price=10000,
            promo_price=8000,
            start_date=today + timedelta(days=1),
            end_date=today + timedelta(days=10),
            is_active=True,
        )
    )
    # promo dalam rentang tanggal tapi is_active=False -> HARUS ke-exclude
    db.add(
        Promo(
            title="TEST - Promo Dinonaktifkan Admin",
            normal_price=10000,
            promo_price=8000,
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=1),
            is_active=False,
        )
    )

    db.add(
        Product(
            name="TEST - Beras 5kg",
            description="Produk untuk validasi response bebas field harga",
            category="sembako-test",
            is_active=True,
        )
    )

    # dua news dengan event_date berbeda buat validasi urutan ascending
    db.add(
        News(
            title="TEST - Event Lebih Jauh",
            content="Event tanggal lebih jauh, harus muncul kedua",
            event_date=today + timedelta(days=20),
            is_active=True,
        )
    )
    db.add(
        News(
            title="TEST - Event Lebih Dekat",
            content="Event tanggal lebih dekat, harus muncul pertama",
            event_date=today + timedelta(days=5),
            is_active=True,
        )
    )

    db.commit()
    print("Seed data test berhasil di-insert.")
finally:
    db.close()
