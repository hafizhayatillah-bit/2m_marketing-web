-- Harga jual & modal per cabang (sama dengan migrasi alembic a7c9e1f3b582).
-- Jalankan sekali di Supabase SQL editor. Aman dijalankan ulang (IF NOT EXISTS; salin nilai hanya kalau masih kosong).
BEGIN;

ALTER TABLE branch_stock ADD COLUMN IF NOT EXISTS price integer;
ALTER TABLE branch_stock ADD COLUMN IF NOT EXISTS cost_price integer;

-- Nilai awal: harga & modal yang selama ini berlaku di semua cabang.
UPDATE branch_stock bs
SET price = COALESCE(bs.price, p.price),
    cost_price = COALESCE(bs.cost_price, p.cost_price)
FROM products p
WHERE p.id = bs.product_id;

-- Catat versi alembic supaya `alembic upgrade head` nanti tidak menjalankan migrasi ini lagi.
DO $$
BEGIN
  IF to_regclass('public.alembic_version') IS NOT NULL THEN
    UPDATE alembic_version SET version_num = 'a7c9e1f3b582' WHERE version_num = 'f6a8c0e2b347';
  END IF;
END $$;

COMMIT;

-- Cek hasil (opsional):
-- SELECT b.name AS cabang, p.name AS produk, bs.qty, bs.price, bs.cost_price
-- FROM branch_stock bs JOIN branches b ON b.id = bs.branch_id JOIN products p ON p.id = bs.product_id
-- ORDER BY b.name, p.name;
