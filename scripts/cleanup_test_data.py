"""Hapus semua row seed test (prefix "TEST - ") yang dibuat scripts/seed_test_data.py."""
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Branch, Promo, Product, News

db = SessionLocal()
try:
    for model, field in [
        (Branch, Branch.name),
        (Promo, Promo.title),
        (Product, Product.name),
        (News, News.title),
    ]:
        rows = db.execute(select(model).where(field.like("TEST - %"))).scalars().all()
        for row in rows:
            db.delete(row)
        print(f"Menghapus {len(rows)} baris {model.__tablename__}")
    db.commit()
finally:
    db.close()
