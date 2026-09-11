# Laporan Eksekusi: Fix UI Frontend Tidak Tampil (Ketimpa Health Check & Crash Template)

**Tanggal:** 2026-09-11
**Proyek:** 2M Sembako (FastAPI + Jinja2 + Tailwind CDN)

## Ringkasan Masalah

Halaman frontend (`app/templates/*.html` — sudah berisi markup Tailwind + vanilla JS fetch ke endpoint publik) tidak bisa tampil saat dibuka. Mengunjungi `/` malah menampilkan JSON health check database, bukan halaman HTML.

## Status: Selesai

Ditemukan **2 bug independen** yang keduanya harus diperbaiki sebelum frontend bisa jalan. Sudah diverifikasi dengan menjalankan server dan curl ke tiap route.

## Root Cause #1 — Konflik Routing (`/` Ketimpa Health Check)

- `app/main.py` punya `@app.get("/")` yang mengembalikan `{"status": "ok", "message": "..."}` (JSON).
- Di saat yang sama, `app/routers/pages.py` (berisi route `/`, `/products`, `/news`, `/contact` yang render HTML) di-mount dengan `app.include_router(pages.router, prefix="/ui")`.
- Karena FastAPI/Starlette mencocokkan route berdasarkan urutan registrasi, dan `@app.get("/")` didaftarkan duluan, request ke `/` selalu ditangkap oleh handler JSON. Halaman HTML sebenarnya cuma bisa diakses lewat `/ui/`, sementara semua link `<a href="/">`, `<a href="/products">` dst di `base.html` menunjuk ke path tanpa prefix `/ui`.

**Fix:** ([app/main.py](../app/main.py))
- Hapus handler `@app.get("/")` (JSON health check) yang duplikat — `/health` sudah cukup untuk keperluan cek app hidup.
- Ubah `app.include_router(pages.router, prefix="/ui")` → `app.include_router(pages.router)` (tanpa prefix), supaya `pages.router` yang memegang route `/`, `/products`, `/news`, `/contact` sesuai link di template.

## Root Cause #2 — Crash 500 di Semua Halaman HTML (`TemplateResponse` Signature Lama)

Setelah bug #1 diperbaiki, semua halaman HTML (`/`, `/products`, `/news`, `/contact`) masih crash dengan:

```
TypeError: cannot use 'tuple' as a dict key (unhashable type: 'dict')
```

**Investigasi:**
- Environment Python proyek ini ternyata **tidak punya virtualenv** — semua paket terinstall di Python 3.14 global, dan versinya **tidak sinkron** dengan `requirements.txt` (mis. `fastapi` terinstall 0.136.1, padahal `requirements.txt` minta `0.141.1`).
- Setelah `pip install -r requirements.txt` dijalankan untuk menyamakan versi, FastAPI 0.141.1 menarik **Starlette 1.0.0** sebagai dependency.
- Starlette 1.0.0 mengubah signature `Jinja2Templates.TemplateResponse()` secara breaking: dari gaya lama `TemplateResponse(name, {"request": request})` menjadi wajib `TemplateResponse(request, name, context=None)`.
- `app/routers/pages.py` masih menulis dengan gaya lama di ke-4 handler-nya. Akibatnya, string `"index.html"` ketuker posisi jadi parameter `request`, dan dict `{"request": request}` ketuker jadi parameter `name` — lalu Jinja2 mencoba pakai dict itu sebagai bagian dari cache key template, yang unhashable → crash.
- `app/routers/admin_promo.py` ternyata **sudah lebih dulu diperbaiki** ke gaya baru (`templates.TemplateResponse(request=request, name=..., context=...)`) di task sebelumnya, jadi tidak kena bug ini — hanya `pages.py` yang tertinggal.

**Fix:** ([app/routers/pages.py](../app/routers/pages.py)) — semua 4 handler diubah ke signature baru:

```python
# sebelum
return templates.TemplateResponse("index.html", {"request": request})

# sesudah
return templates.TemplateResponse(request, "index.html")
```

## Validasi

Server dijalankan lokal (`python -m uvicorn app.main:app`) dan tiap route dicek langsung:

| Route | Sebelum Fix | Sesudah Fix |
|---|---|---|
| `GET /` | JSON health check (bug #1) → lalu 500 (bug #2) | 200 OK, render `index.html` |
| `GET /products` | 500 Internal Server Error | 200 OK, render `products.html` |
| `GET /news` | 500 Internal Server Error | 200 OK, render `news.html` |
| `GET /contact` | 500 Internal Server Error | 200 OK, render `contact.html` |
| `GET /health` | 200 OK (tidak terpengaruh) | 200 OK |
| `GET /api/v1/public/{branches,promos,products,news}` | Tidak terpengaruh, tetap 200 OK | 200 OK |

Fetch JS di dalam template (`/api/v1/public/promos`, `/products`, `/news`) juga dikonfirmasi ter-panggil sukses dari browser (terlihat di access log uvicorn) setelah halaman berhasil ter-render.

## Temuan Lain (Belum Diperbaiki, Sekadar Dicatat)

- **Link navigasi `/about` (menu "Lokasi Cabang") belum ada route & template-nya** — masih 404. `pages.py` cuma punya `/`, `/products`, `/news`, `/contact`. Perlu dibuatkan halaman baru (mengikuti pola fetch ke `/api/v1/public/branches`) kalau mau menu ini berfungsi.
- **Tidak ada virtualenv khusus proyek** — semua dependency terinstall di Python 3.14 global. Ini beresiko drift versi lagi ke depannya (seperti yang terjadi pada `fastapi`/`starlette` di atas) dan menyulitkan reproduksi environment di komputer lain. Disarankan buat `.venv` khusus proyek ini dan install `requirements.txt` di dalamnya.
- `app.mount("/static", ...)` masih di-comment di `main.py` dan folder `app/static/` masih kosong — saat ini tidak masalah karena semua asset (Tailwind, font) dipakai lewat CDN di `base.html`, tapi kalau nanti butuh asset lokal (logo, favicon, dll.), mount ini perlu diaktifkan.

## File yang Diubah

- `app/main.py` — hapus route `/` JSON duplikat, hapus prefix `/ui` dari `pages.router`.
- `app/routers/pages.py` — ubah 4 pemanggilan `TemplateResponse` ke signature baru Starlette 1.0.
