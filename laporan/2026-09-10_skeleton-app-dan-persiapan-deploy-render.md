# Laporan Eksekusi: Skeleton App & Persiapan Deploy Backend (Render)

**Tanggal:** 2026-09-10
**Proyek:** 2M Sembako (FastAPI + PostgreSQL/Supabase + SQLAlchemy + Alembic)

## Ringkasan Tugas

Menyiapkan skeleton app FastAPI beserta konfigurasi deploy ke Render (primary), dengan Koyeb sebagai fallback, lalu memvalidasi hasil deploy di production.

## Status: Deploy Ditunda

Proses deploy ke **Render dihentikan sementara** karena Render meminta verifikasi kartu kredit untuk melanjutkan pembuatan web service, meskipun plan yang dipilih adalah **Free ($0/month)**. Karena akses kartu kredit belum tersedia saat ini, langkah deploy production akan **dilanjutkan nanti** setelah akses tersedia.

Semua persiapan kode dan konfigurasi sudah selesai dan sudah di-commit + push ke repository, sehingga saat akses kartu kredit sudah ada, proses deploy tinggal melanjutkan dari checklist manual Render (atau beralih ke fallback Koyeb bila diperlukan).

## Yang Sudah Selesai

1. **Skeleton app** — [`app/main.py`](../app/main.py):
   - `GET /health` — cek app process hidup, tanpa dependency ke database.
   - `GET /health/db` — jalankan `SELECT 1` via SQLAlchemy session, return 503 kalau koneksi database gagal.
   - Sudah dites lokal, keduanya mengembalikan `200 OK` dengan response sesuai spek.
2. **Dependency pinning** — [`requirements.txt`](../requirements.txt) di-pin ke versi stabil terbaru (fastapi 0.141.1, uvicorn 0.52.4, sqlalchemy 2.0.52, psycopg2-binary 2.9.13, alembic 1.19.2, python-dotenv 1.2.3, jinja2 3.1.6, python-multipart 0.0.32, passlib 1.7.4).
3. **Koneksi database ke Supabase** — [`app/database.py`](../app/database.py):
   - Menggunakan **Session Pooler (Supavisor)** Supabase (`aws-0-ap-northeast-2.pooler.supabase.com:5432`), bukan direct connection (yang IPv6-only dan tidak bisa diakses dari hosting gratis berbasis IPv4).
   - `pool_size=5`, `max_overflow=2` (menyesuaikan limit koneksi Supabase free tier).
   - `pool_pre_ping=True` dan `connect_args={"sslmode": "require"}`.
4. **[.env.example](../.env.example)** — placeholder format Session Pooler tanpa credential asli. `.env` asli tetap di `.gitignore`.
5. **[render.yaml](../render.yaml)** — Blueprint web service Python: build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `DATABASE_URL` sebagai env var yang harus diisi manual (`sync: false`).
6. Semua perubahan di atas sudah di-commit (`23e988f`) dan ter-push ke `origin/main`.

## Yang Tertunda

- Pembuatan web service di Render dashboard (butuh verifikasi kartu kredit).
- Pengisian environment variable `DATABASE_URL` di Render dengan connection string Session Pooler.
- Validasi Definition of Done di production:
  - `GET {PRODUCTION_URL}/health` → 200 `{"status":"ok"}`
  - `GET {PRODUCTION_URL}/health/db` → 200 `{"status":"ok","db":"connected"}`
  - Cek auto-deploy dari `git push` dan build logs.
- Setup testing pipeline (belum dikerjakan, direncanakan setelah backend berhasil deploy).
- Fallback ke Koyeb (Dockerfile minimal) — **belum disiapkan**, baru akan dikerjakan jika Render benar-benar tidak bisa diakses tanpa kartu kredit.

## Langkah Lanjutan (Setelah Akses Kartu Kredit Tersedia)

1. Lanjutkan pembuatan Web Service di Render dashboard mengikuti checklist yang sudah diberikan sebelumnya (connect repo, isi Start Command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, region Singapore/terdekat, isi `DATABASE_URL`).
2. Setelah deploy sukses, jalankan validasi DoD (`/health`, `/health/db`, cek build logs, cold start note untuk free tier).
3. Setup testing pipeline (unit test + kemungkinan CI seperti GitHub Actions) untuk backend.
