# Laporan Eksekusi: Setup SQLAlchemy Models & Migrasi Alembic Awal

**Tanggal:** 2026-09-10
**Proyek:** 2M Sembako (FastAPI + PostgreSQL + SQLAlchemy + Alembic)

## Ringkasan Tugas

Mendefinisikan model SQLAlchemy untuk 5 entity (`users`, `branches`, `promos`, `products`, `news`), menyiapkan Alembic, membuat migrasi awal, dan memverifikasi hasilnya di database.

## Temuan Awal

Sebelum eksekusi dimulai, ditemukan bahwa `migrations/` **tidak kosong** — sudah ada hasil kerja sebelumnya yang tidak sesuai spesifikasi:

- Semua model didefinisikan dalam satu file `app/models/__init__.py` (bukan file terpisah per entity).
- `category_tags` pada `branches` bertipe `String` (comma-separated), padahal spesifikasi mewajibkan `ARRAY(String)` native Postgres.
- `normal_price` dan `promo_price` pada `promos` bertipe `Float`, padahal spesifikasi mewajibkan `Numeric(12, 2)`.
- Ada index eksplisit (`index=True`) di beberapa kolom yang tidak diminta.
- Migrasi lama (`66e8c566e71f_initial_schema_setup.py`) hasil dari model yang salah tersebut **sudah ter-apply** ke database (`alembic current` menunjukkan revisi ini sebagai head).

## Tindakan yang Dilakukan

1. **Refactor model** — memecah model ke file terpisah sesuai struktur yang diminta:
   - `app/models/base.py` — re-export `Base` dari `app.database`.
   - `app/models/user.py`, `branch.py`, `promo.py`, `product.py`, `news.py` — satu model per file.
   - `app/models/__init__.py` — import semua model agar metadata lengkap terdaftar untuk Alembic.
   - Perbaikan tipe data: `category_tags` → `postgresql.ARRAY(String)`, `normal_price`/`promo_price` → `Numeric(12, 2)`, `password_hash` → `String(255)`, hapus index eksplisit yang tidak diminta.
2. **Downgrade database** — `alembic downgrade base` untuk drop 5 tabel dengan skema lama yang salah (dikonfirmasi ke user sebelum eksekusi karena bersifat destruktif).
3. **Hapus migrasi lama** — file `migrations/versions/66e8c566e71f_initial_schema_setup.py` dihapus.
4. **Generate migrasi baru** — `alembic revision --autogenerate -m "initial schema"` menghasilkan `migrations/versions/5735558e902a_initial_schema.py`.
5. **Review migrasi** — isi file migrasi ditampilkan ke user untuk verifikasi sebelum di-apply (lihat tabel checklist di bawah).
6. **Apply migrasi** — setelah dikonfirmasi user, `alembic upgrade head` dijalankan terhadap database.
7. **Validasi Definition of Done** — lihat bagian Validasi.

## Checklist Review Migrasi (`5735558e902a_initial_schema.py`)

| Cek | Status |
|---|---|
| 5 tabel (`branches`, `news`, `products`, `promos`, `users`) dibuat | ✅ |
| `category_tags` → `postgresql.ARRAY(String)` | ✅ |
| `normal_price` / `promo_price` → `Numeric(12, 2)` | ✅ |
| `password_hash` → `String(255)` | ✅ |
| `username` unik via `UniqueConstraint`, tanpa index eksplisit tambahan | ✅ |
| Tidak ada foreign key / relationship antar tabel | ✅ |
| Tidak ada kolom tambahan di luar spesifikasi | ✅ |
| `products` tanpa kolom harga | ✅ |
| Hanya operasi `create_table` (tidak ada drop/alter di luar rencana) | ✅ |

## Validasi Definition of Done

| Item | Command | Hasil |
|---|---|---|
| Revisi ter-apply | `alembic current` | `5735558e902a (head)` |
| Tabel ter-create di Postgres | Query `information_schema.tables` | `alembic_version`, `branches`, `news`, `products`, `promos`, `users` |
| Idempotensi | `alembic upgrade head` (dijalankan ulang) | No-op, tanpa error |
| File migrasi siap commit | — | `migrations/versions/5735558e902a_initial_schema.py` |

## File yang Diubah/Dibuat

- `app/models/base.py` (baru)
- `app/models/user.py` (baru)
- `app/models/branch.py` (baru)
- `app/models/promo.py` (baru)
- `app/models/product.py` (baru)
- `app/models/news.py` (baru)
- `app/models/__init__.py` (diubah — hanya import, tidak lagi mendefinisikan model langsung)
- `migrations/versions/66e8c566e71f_initial_schema_setup.py` (dihapus)
- `migrations/versions/5735558e902a_initial_schema.py` (baru)

## Catatan Lanjutan

- Pastikan seluruh file di atas ikut di-commit, termasuk migrasi baru dan penghapusan migrasi lama.
- Validasi allowed-values untuk `products.category` direncanakan di layer Pydantic schema (belum dikerjakan pada tahap ini).
