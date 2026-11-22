"""Seed data untuk mengetes kiosk: harga, harga modal, SKU, dan stok cabang Jatibening.

HARGA YANG DIISI DI SINI DUMMY (perkiraan per kategori), hanya untuk tes. Ganti dengan harga asli
lewat admin / SQL sebelum toko buka. Produk yang sudah punya harga/SKU/stok tidak ditimpa
(kecuali pakai --overwrite).

Contoh (lokal):
    set ENV_FILE=.env.local
    python -m scripts.seed_kiosk --create-branch --demo-products

Opsi:
    --branch NAMA        kata kunci nama cabang (default: Jatibening)
    --create-branch      buat cabang kalau belum ada (alamat placeholder, edit di admin)
    --demo-products      buat katalog contoh kalau tabel products masih kosong (khusus lokal)
    --stock N            stok awal per produk (default 24)
    --overwrite          timpa harga/modal/stok yang sudah ada
    --dry-run            tampilkan saja, tidak menyimpan
"""
from __future__ import annotations

import argparse

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Branch, BranchStock, Product, StockMovement

# Harga dummy per kategori (rupiah). Kategori lain pakai DEFAULT_PRICE.
CATEGORY_PRICES = {
    "beras": 72000,
    "minyak": 38000,
    "gula": 18500,
    "telur": 29000,
    "tepung": 13500,
    "mie": 3500,
    "minuman": 6000,
    "bumbu": 5000,
    "snack": 9500,
    "kaleng": 21000,
    "rumah tangga": 15000,
    "sayur": 8000,
}
DEFAULT_PRICE = 12000

DEMO_PRODUCTS = [
    ("Beras Premium 5 kg", "beras"),
    ("Beras Medium 5 kg", "beras"),
    ("Minyak Goreng 2 L", "minyak"),
    ("Minyak Goreng 1 L", "minyak"),
    ("Gula Pasir 1 kg", "gula"),
    ("Telur Ayam 1 kg", "telur"),
    ("Tepung Terigu 1 kg", "tepung"),
    ("Mie Instan Goreng", "mie"),
    ("Mie Instan Kuah Soto", "mie"),
    ("Air Mineral 1,5 L", "minuman"),
    ("Teh Botol 350 ml", "minuman"),
    ("Kecap Manis 520 ml", "bumbu"),
    ("Garam Dapur 250 g", "bumbu"),
    ("Sarden Kaleng 425 g", "kaleng"),
    ("Sabun Cuci Piring 780 ml", "rumah tangga"),
    ("Keripik Singkong 200 g", "snack"),
]


def dummy_price(category: str, product_id: int) -> int:
    base = CATEGORY_PRICES.get(category.strip().lower(), DEFAULT_PRICE)
    # Variasi kecil per produk supaya tidak semua sama; dibulatkan ke Rp500.
    bump = (product_id * 7 % 5) * 500
    return base + bump


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default="Jatibening")
    ap.add_argument("--create-branch", action="store_true")
    ap.add_argument("--demo-products", action="store_true")
    ap.add_argument("--stock", type=int, default=24)
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        branch = db.execute(select(Branch).where(Branch.name.ilike(f"%{args.branch}%")).order_by(Branch.id)).scalars().first()
        if branch is None:
            if not args.create_branch:
                raise SystemExit(f"Cabang '{args.branch}' tidak ada. Tambah lewat admin, atau jalankan dengan --create-branch.")
            branch = Branch(
                name=f"2M Sembako {args.branch}",
                address="Jatibening, Bekasi (alamat lengkap: edit di admin)",
                city="Bekasi",
                latitude=-6.2560,
                longitude=106.9450,
                whatsapp_number="6281200000000",
                operating_hours="07:00-21:00",
                category_tags=["sembako"],
                is_active=True,
            )
            db.add(branch)
            db.flush()
            print(f"+ cabang dibuat: {branch.name} (id {branch.id})")
        print(f"Cabang: {branch.name} (id {branch.id})")

        if args.demo_products and db.execute(select(func.count(Product.id))).scalar_one() == 0:
            for name, cat in DEMO_PRODUCTS:
                db.add(Product(name=name, category=cat, is_active=True))
            db.flush()
            print(f"+ {len(DEMO_PRODUCTS)} produk contoh dibuat")

        products = db.execute(select(Product).where(Product.is_active == True).order_by(Product.id)).scalars().all()  # noqa: E712
        stocks = {
            s.product_id: s
            for s in db.execute(select(BranchStock).where(BranchStock.branch_id == branch.id)).scalars()
        }
        for idx, p in enumerate(products):
            changes = []
            if p.price is None or args.overwrite:
                p.price = dummy_price(p.category, p.id)
                changes.append(f"harga {p.price}")
            if p.cost_price is None or args.overwrite:
                p.cost_price = int(p.price * 0.85 // 100 * 100)
                changes.append(f"modal {p.cost_price}")
            if p.sku is None:
                p.sku = f"2M-{p.id:05d}"
                changes.append(f"sku {p.sku}")

            # Variasi stok untuk tes: produk ke-5 habis, produk ke-4 tinggal 3.
            target = 0 if idx == 4 else 3 if idx == 3 else args.stock
            stock = stocks.get(p.id)
            if stock is None or args.overwrite:
                before = stock.qty if stock else 0
                if stock is None:
                    stock = BranchStock(branch_id=branch.id, product_id=p.id, qty=target)
                    db.add(stock)
                else:
                    stock.qty = target
                db.add(
                    StockMovement(
                        branch_id=branch.id,
                        product_id=p.id,
                        type="adjust",
                        qty=target - before,
                        qty_after=target,
                        ref="seed",
                        note="Stok awal dari scripts/seed_kiosk.py (data tes)",
                        created_by="seed",
                    )
                )
                changes.append(f"stok {target}")
            if changes:
                print(f"  {p.id:>4} {p.name[:40]:<40} " + ", ".join(changes))

        if args.dry_run:
            db.rollback()
            print("dry-run: tidak ada yang disimpan")
        else:
            db.commit()
            print("selesai")
    finally:
        db.close()


if __name__ == "__main__":
    main()
