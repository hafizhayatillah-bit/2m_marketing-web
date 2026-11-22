-- Cek kesiapan DB produksi (Supabase) untuk kiosk + admin POS. SEMUA READ-ONLY (hanya SELECT).
-- Supabase SQL Editor hanya menampilkan hasil statement TERAKHIR: blok satu query, lalu Run (Ctrl+Enter), satu per satu.
-- Catatan: KIOSK_DEVICE_TOKEN / KIOSK_STAFF_PIN / KIOSK_QRIS_IMAGE_URL itu env Render, bukan isi database;
-- tidak bisa dicek atau diperbaiki dari SQL.


-- 1) Skema: versi migrasi, tabel & kolom kiosk. Semua baris harus ok = true.
select 'alembic_version' as cek,
       (select string_agg(version_num, ',') from alembic_version) as hasil,
       coalesce((select string_agg(version_num, ',') from alembic_version) = 'f6a8c0e2b347', false) as ok
union all
select 'tabel ' || t,
       case when to_regclass('public.' || t) is null then 'TIDAK ADA' else 'ada' end,
       to_regclass('public.' || t) is not null
from unnest(array['branch_stock', 'stock_movements', 'orders', 'order_items', 'payments', 'expenses']) as t
union all
select 'kolom ' || tc,
       case when c.column_name is null then 'TIDAK ADA' else 'ada' end,
       c.column_name is not null
from unnest(array['products.price', 'products.cost_price', 'products.sku', 'branch_stock.is_active', 'branch_stock.min_qty']) as tc
left join information_schema.columns c
       on c.table_schema = 'public'
      and c.table_name = split_part(tc, '.', 1)
      and c.column_name = split_part(tc, '.', 2);


-- 2) Kesiapan cabang Jatibening (jalankan setelah query 1 semuanya ok).
--    Kiosk memilih cabang aktif pertama yang namanya mengandung "jatibening" (KIOSK_DEFAULT_BRANCH).
with b as (
    select id, name, is_active
    from branches
    where name ilike '%jatibening%'
    order by is_active desc, id
    limit 1
), s as (
    select bs.qty, bs.min_qty, bs.is_active as dijual, p.price, p.cost_price, p.is_active as p_aktif
    from branch_stock bs
    join products p on p.id = bs.product_id
    where bs.branch_id = (select id from b)
)
select 'cabang jatibening' as cek,
       coalesce((select name || ' (id ' || id || ', aktif=' || is_active || ')' from b), 'TIDAK ADA') as hasil,
       coalesce((select is_active from b), false) as ok
union all
select 'produk tampil di kiosk', count(*)::text, count(*) > 0
from s where dijual and p_aktif and coalesce(price, 0) > 0
union all
select 'tampil tapi stok <= 0 (kiosk: Habis, tidak bisa dibayar)', count(*)::text, count(*) = 0
from s where dijual and p_aktif and coalesce(price, 0) > 0 and qty <= 0
union all
select 'terdaftar di cabang tapi tanpa harga (tidak tampil)', count(*)::text, count(*) = 0
from s where dijual and p_aktif and coalesce(price, 0) <= 0
union all
select 'dijual tanpa harga modal (laba terhitung terlalu tinggi)', count(*)::text, count(*) = 0
from s where dijual and coalesce(price, 0) > 0 and cost_price is null
union all
select 'stok negatif', count(*)::text, count(*) = 0
from s where qty < 0
union all
select 'order menunggu bayar (cabang ini)', count(*)::text, true
from orders where branch_id = (select id from b) and status = 'PENDING_PAYMENT'
union all
select 'order sudah ada (semua status, cabang ini)', count(*)::text, true
from orders where branch_id = (select id from b)
union all
select 'pembayaran PAID_LATE (perlu dicek/refund)', count(*)::text, count(*) = 0
from payments where status = 'PAID_LATE';


-- 3) Daftar produk cabang Jatibening untuk dicek satu-satu (harga, modal, stok). Urutan: HABIS dulu.
--    Harga dari scripts/seed_kiosk.py itu DUMMY: pastikan semua harga & modal sudah harga asli.
select p.id,
       p.sku,
       p.name,
       p.category,
       p.price,
       p.cost_price,
       bs.qty as stok,
       bs.min_qty,
       bs.is_active as dijual_di_kiosk,
       p.is_active as aktif_katalog,
       case
           when not bs.is_active or not p.is_active then '4 disembunyikan'
           when coalesce(p.price, 0) <= 0 then '3 tanpa harga'
           when bs.qty <= 0 then '0 HABIS'
           when bs.qty <= bs.min_qty then '1 menipis'
           else '2 tersedia'
       end as status
from branch_stock bs
join products p on p.id = bs.product_id
join branches b on b.id = bs.branch_id
where b.name ilike '%jatibening%'
order by status, p.category, p.name;


-- 4) (Opsional) Koneksi yang sedang terbuka ke DB ini: cek tidak mepet batas pooler Supabase.
--    App memakai maksimal 7 koneksi per instance; saat deploy bisa 2 instance sekaligus.
select usename, application_name, state, count(*) as koneksi
from pg_stat_activity
where datname = current_database()
group by usename, application_name, state
order by koneksi desc;
