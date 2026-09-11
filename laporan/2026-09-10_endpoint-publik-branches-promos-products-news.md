# Laporan Eksekusi: Endpoint Publik Read-Only (Branches, Promos, Products, News)

**Tanggal:** 2026-09-10
**Proyek:** 2M Sembako (FastAPI + SQLAlchemy + Supabase Postgres)

## Ringkasan Tugas

Membuat 4 endpoint publik read-only (`GET /api/v1/public/branches`, `/promos`, `/products`, `/news`) memakai SQLAlchemy 2.0 style (`select()`), tanpa pagination dan tanpa error handling custom (scope Day 9), lalu memvalidasi tiap filter dengan data nyata di database.

## Status: Selesai

Semua Definition of Done Card 2–5 terpenuhi dan sudah divalidasi terhadap data asli, bukan cuma logic di kode.

## Yang Dikerjakan

1. **Router per entity** — dibuat di [`app/routers/`](../app/routers/):
   - [`branches.py`](../app/routers/branches.py) — `GET /branches`, filter `is_active=True` + optional `?city=` case-insensitive (`func.lower()`), karena data city diinput manual dan casing bisa gak konsisten.
   - [`promos.py`](../app/routers/promos.py) — `GET /promos`, filter `is_active=True` **AND** `start_date <= today AND end_date >= today`. `today` dihitung eksplisit pakai `zoneinfo.ZoneInfo("Asia/Jakarta")`, bukan `date.today()` polos, supaya gak salah tampil di jam-jam awal WIB akibat server jalan di UTC.
   - [`products.py`](../app/routers/products.py) — `GET /products`, filter `is_active=True` + optional `?category=` exact match (case-sensitive, karena category diisi lewat dropdown terbatas di admin). Print 1 contoh response ke terminal untuk verifikasi visual.
   - [`news.py`](../app/routers/news.py) — `GET /news`, filter `is_active=True`, `order_by(event_date.asc())`. Diberi komentar `TODO` eksplisit soal asumsi sort ascending tanpa filter tanggal (keputusan filter event lama masih pending).
2. **Registrasi di [`app/main.py`](../app/main.py)** — ke-4 router di-include dengan `prefix="/api/v1/public"`, masing-masing dengan tag sendiri (`branches`, `promos`, `products`, `news`) agar grouping di `/docs` rapi.
3. **`get_db` dependency** — sudah ada sebelumnya di [`app/database.py`](../app/database.py), langsung di-reuse di semua router (tidak perlu dibuat ulang).
4. **Keputusan promo (Card 3)** — mengikuti rekomendasi: filter tanggal (`start_date`/`end_date`) otomatis di query, `is_active` tetap dicek di query yang sama sebagai tombol manual admin untuk nonaktifkan promo lebih cepat dari jadwal. Kedua kondisi digabung dengan `AND`.

## Validasi yang Dilakukan

Karena tabel masih kosong di awal, dibuat script bantu (tidak untuk production):

- [`scripts/seed_test_data.py`](../scripts/seed_test_data.py) — insert data test dengan prefix `"TEST - "` (mudah diidentifikasi & dihapus), termasuk 4 variasi promo (aktif & mepet hari ini, kadaluarsa, belum mulai, dinonaktifkan admin) dan 2 news dengan `event_date` berbeda.
- [`scripts/cleanup_test_data.py`](../scripts/cleanup_test_data.py) — hapus semua row dengan prefix `"TEST - "` setelah validasi selesai.

Hasil test manual (uvicorn lokal + request langsung ke tiap endpoint):

| Endpoint | Hasil |
|---|---|
| `GET /branches?city=bekasi` vs `?city=Bekasi` | Mengembalikan hasil **identik** (1 row), membuktikan filter case-insensitive jalan benar |
| `GET /promos` | Dari 4 promo test, **hanya 1 yang muncul** ("TEST - Promo Aktif Hari Ini", start 2026-09-09, end 2026-09-11) — promo kadaluarsa, belum mulai, dan yang dinonaktifkan admin semuanya ke-exclude sesuai ekspektasi |
| `GET /products` & `?category=sembako-test` | Response `ProductOut` **tidak mengandung field harga** sama sekali; filter category bekerja |
| `GET /news` | 2 row muncul urut **ascending** by `event_date` (tanggal lebih dekat duluan) |
| `GET /docs` | Ke-4 endpoint tampil ter-grouping rapi sesuai tag masing-masing |

Data test (`"TEST - ..."`) dibersihkan lagi dari database setelah validasi via `scripts/cleanup_test_data.py`.

## Definition of Done — Checklist

| Item | Status |
|---|---|
| SQLAlchemy 2.0 style (`select()`), bukan `session.query()` | ✅ |
| DB session via `Depends(get_db)`, reuse di semua router | ✅ |
| `response_model` eksplisit `List[...Out]` di tiap endpoint | ✅ |
| Tanpa pagination, tanpa error handling custom | ✅ |
| Card 2: `is_active=True` + filter `city` case-insensitive, termasuk lat/long | ✅ |
| Card 3: `is_active=True` AND rentang tanggal, pakai timezone Asia/Jakarta | ✅ |
| Card 4: `is_active=True` + filter `category`, response bebas field harga | ✅ |
| Card 5: `is_active=True`, order by `event_date` ascending + komentar TODO | ✅ |
| Registrasi di `main.py` dengan prefix & tag per entity | ✅ |
| Tervalidasi manual via `/docs` dengan data nyata (bukan cuma tabel kosong) | ✅ |

## Catatan Lanjutan

- Error handling custom, retry, dan pytest untuk endpoint ini masih di luar scope — masuk Day 9.
- Keputusan final soal apakah `News` perlu filter `event_date >= hari ini` masih pending (lihat komentar `TODO` di [`app/routers/news.py`](../app/routers/news.py)), tergantung apakah entity ini juga menampung artikel lama yang sengaja ingin tetap tampil.
