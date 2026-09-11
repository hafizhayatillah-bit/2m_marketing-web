# Laporan Eksekusi: Pydantic Response Schemas (BranchOut, PromoOut, ProductOut, NewsOut)

**Tanggal:** 2026-09-10
**Proyek:** 2M Sembako (FastAPI + SQLAlchemy + Supabase Postgres)

## Ringkasan Tugas

Membuat Pydantic response schema untuk 4 entity publik (`branches`, `promos`, `products`, `news`), memastikan `ProductOut` tidak memiliki field harga sama sekali, dan memvalidasi hasilnya terhadap data asli di database.

## Status: Selesai

Semua Definition of Done terpenuhi — 4 schema ter-define, tervalidasi terhadap objek SQLAlchemy asli, siap dipakai di endpoint, dan tidak ada field sensitif/tidak perlu yang ter-expose.

## Yang Dikerjakan

1. **Cek versi Pydantic** — versi terinstall `2.13.3` (v2), sehingga semua schema baru pakai `model_config = ConfigDict(from_attributes=True)`, bukan `class Config: orm_mode = True` (syntax v1 yang deprecated).
2. **File schema per entity:**
   - [`app/schemas/branch.py`](../app/schemas/branch.py) — `BranchOut`: `id, name, address, city, latitude, longitude, google_maps_url, google_drive_url, whatsapp_number, operating_hours, category_tags: List[str]`. Tidak termasuk `is_active`.
   - [`app/schemas/promo.py`](../app/schemas/promo.py) — `PromoOut`: `id, title, description, normal_price: Decimal, promo_price: Decimal, image_url, start_date, end_date`. Ditambahkan di file yang sama tempat schema admin (`PromoBase`/`PromoCreate`/`PromoResponse`) sudah ada sebelumnya, tanpa mengubah yang lama.
   - [`app/schemas/product.py`](../app/schemas/product.py) — `ProductOut`: `id, name, description, image_url, category`. **Tidak ada field harga dalam bentuk apapun.**
   - [`app/schemas/news.py`](../app/schemas/news.py) — `NewsOut`: `id, title, content, image_url, event_date`.
   - [`app/schemas/__init__.py`](../app/schemas/__init__.py) — export semua 4 schema.
3. **Bug ditemukan & diperbaiki saat validasi:** Pydantic v2 secara default men-serialize field `Decimal` sebagai **string** di mode JSON (`"15000.00"`), bukan number. Ditambahkan `@field_serializer("normal_price", "promo_price")` di `PromoOut` supaya konsisten ter-serialize sebagai JSON number (`15000.0`).
4. **Bug tidak terkait yang ditemukan & diperbaiki saat proses validasi:** environment variable `DATABASE_URL` basi di sesi shell (sisa dari setup Postgres lokal) membuat koneksi diam-diam nyasar ke database lokal, bukan Supabase, karena `python-dotenv`'s `load_dotenv()` tidak override env var yang sudah ada. Diperbaiki dengan `load_dotenv(override=True)` di [`app/database.py`](../app/database.py) dan [`migrations/env.py`](../migrations/env.py), lalu migrasi dijalankan ulang dan dikonfirmasi benar-benar ter-apply ke Supabase.

## Validasi yang Dilakukan

- Insert 1 dummy row per tabel (`branches`, `promos`, `products`, `news`) ke Supabase asli, lalu instantiate tiap schema dari objek SQLAlchemy hasil query (bukan dict manual) via `Model.model_validate(orm_object)`.
- `ProductOut.model_fields.keys()` → `['id', 'name', 'description', 'image_url', 'category']` — dikonfirmasi tidak ada kata "price" dalam bentuk apapun.
- `PromoOut.model_json_schema()` dan `model_dump(mode="json")` dicek — `normal_price`/`promo_price` ter-serialize sebagai number (`15000.0`), bukan string.
- Dummy row yang dipakai untuk validasi sudah dihapus lagi dari Supabase setelah pengecekan selesai (database production tetap bersih).

## Definition of Done — Checklist

| Item | Status |
|---|---|
| 4 schema (`BranchOut`, `PromoOut`, `ProductOut`, `NewsOut`) ter-define | ✅ |
| Pakai syntax Pydantic v2 (`ConfigDict(from_attributes=True)`) | ✅ |
| `ProductOut` tanpa field harga sama sekali | ✅ |
| Instantiate dari objek SQLAlchemy asli (bukan dict manual) | ✅ |
| `normal_price`/`promo_price` ter-serialize sebagai number | ✅ (setelah fix `field_serializer`) |
| Tidak ada field sensitif/tidak perlu ter-expose (`is_active` di-exclude dari semua Out schema) | ✅ |
| Siap dipakai di endpoint (belum dibuat router-nya, sesuai scope) | ✅ |

## Catatan Lanjutan

- Endpoint/router untuk 4 entity ini belum dibuat — di luar scope task ini, jadi jadi task terpisah selanjutnya.
- Deploy backend ke Render masih tertunda (butuh verifikasi kartu kredit), lihat laporan sebelumnya: [2026-09-10_skeleton-app-dan-persiapan-deploy-render.md](2026-09-10_skeleton-app-dan-persiapan-deploy-render.md).
