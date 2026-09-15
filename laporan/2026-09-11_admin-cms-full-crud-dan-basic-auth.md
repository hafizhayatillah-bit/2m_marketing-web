# Laporan Eksekusi: Admin CMS — Full CRUD (Promo, Produk, News, Cabang) + HTTP Basic Auth

**Tanggal:** 2026-09-11
**Proyek:** 2M Sembako (backend admin, `app/routers/admin_*.py` + `app/templates/admin/`)

## Ringkasan

User bertanya cara memasukkan data produksi (produk/berita/cabang) ke database. Ditemukan bahwa hanya **Promo** yang punya admin UI ([app/routers/admin_promo.py](../app/routers/admin_promo.py)), dan itu pun cuma **list + create** (tanpa edit/delete/toggle-active), serta **tanpa autentikasi sama sekali** — siapa pun yang tahu URL bisa menulis data.

Sebelum eksekusi, diajukan 2 pertanyaan keputusan ke user (scope CRUD & auth), dikonfirmasi: bangun **full CRUD** (create/edit/delete/toggle-active) untuk keempat resource (Promo, Product, News, Branch, termasuk retrofit Promo), plus **HTTP Basic Auth** sederhana berbasis `.env`.

## Status: Selesai

## 1. HTTP Basic Auth

**File baru:** [app/auth.py](../app/auth.py).

- `verify_admin()` — dependency pakai `fastapi.security.HTTPBasic`, membandingkan `credentials.username`/`password` terhadap `ADMIN_USERNAME`/`ADMIN_PASSWORD` dari environment memakai `secrets.compare_digest` (constant-time, menghindari timing attack), raise `401` + header `WWW-Authenticate: Basic` kalau tidak cocok atau env belum di-set.
- Ditambahkan sebagai **router-level dependency** (`dependencies=[Depends(verify_admin)]`) di **keempat** admin router — bukan cuma yang baru, `admin_promo.py` yang lama juga ikut diproteksi.
- `.env` dan `.env.example` ditambah `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## 2. Retrofit `admin_promo.py`

**File:** [app/routers/admin_promo.py](../app/routers/admin_promo.py), [app/templates/admin/promo/list.html](../app/templates/admin/promo/list.html), [app/templates/admin/promo/form.html](../app/templates/admin/promo/form.html).

- Tambah route: `GET/POST /{id}/edit`, `POST /{id}/delete`, `POST /{id}/toggle-active` (sebelumnya cuma `GET /` dan `GET/POST /create`).
- Form create/edit digabung jadi satu template (`promo=None` untuk create, `promo=<obj>` untuk edit) — action URL & label tombol (`Simpan` vs `Update`) menyesuaikan otomatis.
- Field `description` (sudah ada di model `Promo`, sudah dipakai di API publik, tapi belum pernah bisa di-set dari form admin) ditambahkan ke form.
- Tabel list ditambah kolom Aksi: Edit / Aktifkan-Nonaktifkan / Hapus (konfirmasi `confirm()` sebelum hapus).

## 3. `admin_products.py` (baru)

**File:** [app/routers/admin_products.py](../app/routers/admin_products.py), [app/templates/admin/product/list.html](../app/templates/admin/product/list.html), [app/templates/admin/product/form.html](../app/templates/admin/product/form.html).

- CRUD lengkap: list, create, edit, delete, toggle-active.
- Field kategori (`Product.category`, kolom `String` bebas, bukan enum) dilengkapi `<datalist>` berisi kategori unik yang sudah ada di DB (`SELECT DISTINCT category`) — mengurangi risiko typo yang bisa bikin kategori "kepisah" tanpa sengaja di halaman publik `product.html`.

## 4. `admin_news.py` (baru)

**File:** [app/routers/admin_news.py](../app/routers/admin_news.py), [app/templates/admin/news/list.html](../app/templates/admin/news/list.html), [app/templates/admin/news/form.html](../app/templates/admin/news/form.html).

- CRUD lengkap, termasuk input `event_date` (`<input type="date">`).

## 5. `admin_branches.py` (baru)

**File:** [app/routers/admin_branches.py](../app/routers/admin_branches.py), [app/templates/admin/branch/list.html](../app/templates/admin/branch/list.html), [app/templates/admin/branch/form.html](../app/templates/admin/branch/form.html).

- CRUD lengkap untuk semua field model `Branch` (nama, alamat, kota, latitude/longitude, WA, jam operasional, url maps/drive).
- `category_tags` (kolom `ARRAY(String)` di Postgres) direpresentasikan sebagai input teks comma-separated di form; di-parse (`split(",")`, `strip()`, buang string kosong) jadi `list[str]` saat submit, dan di-`join(", ")` lagi saat prefill form edit.

## 6. Navigasi & Registrasi Router

- [app/templates/admin/base.html](../app/templates/admin/base.html) — nav ditambah link Products/News/Branches (sebelumnya cuma Promos).
- [app/main.py](../app/main.py) — registrasi `admin_products.router`, `admin_news.router`, `admin_branches.router`.

## 7. Bug Ditemukan & Diperbaiki Saat Verifikasi

Field nullable (`description`, `image_url`, `google_maps_url`, `google_drive_url`) di form **edit** sempat merender literal teks **`"None"`** di dalam input, bukan kosong — karena Jinja2 merender nilai Python `None` sebagai string `"None"` apa adanya.

**Fix:** pola `{{ (obj.field or '') if obj else '' }}` diterapkan di semua template form yang punya field nullable (product/form.html, news/form.html, promo/form.html, branch/form.html).

## 8. Verifikasi

- Login Basic Auth diuji: request tanpa kredensial → `401 {"detail":"Not authenticated"}`; kredensial salah → `401 {"detail":"Invalid admin credentials"}`; kredensial benar → halaman admin ter-render.
- Untuk **Product**, **News**, dan **Branch**: create → muncul di list, edit → field ter-update & ter-refleksi di list, toggle-active → status berpindah Aktif/Nonaktif beserta label tombol, delete (dengan `confirm()`) → dikonfirmasi dialog block-nya bekerja (klik programatic dicegat dialog, bukan langsung terhapus).
- Semua data uji memakai prefix `TEST -` dan dibersihkan lewat [scripts/cleanup_test_data.py](../scripts/cleanup_test_data.py) setelah setiap sesi verifikasi.

## 9. Catatan Keamanan

- `.env` menyimpan `ADMIN_PASSWORD` dalam bentuk plaintext (pola yang sama seperti `DATABASE_URL` yang sudah ada sebelumnya) — sudah ter-cover `.gitignore`, tapi **wajib di-set ulang sebagai env var terpisah** di platform hosting (Render/dst.) untuk production, jangan disalin langsung dari `.env` lokal ke tempat lain.
- Belum ada rate-limiting/lockout untuk percobaan Basic Auth berulang — di luar scope sesi ini, dicatat sebagai open item.
- Basic Auth cocok untuk kebutuhan sekarang (1 admin, akses internal), tapi tidak ada mekanisme "logout" (keterbatasan bawaan Basic Auth di browser) dan credential dikirim di setiap request (aman selama situs berjalan di atas HTTPS di production).

## 10. Open Items

- Belum ada pagination/search di tabel list admin — kalau jumlah data sudah banyak, halaman list bisa jadi panjang.
- Belum ada validasi format (nomor WA, URL gambar/maps/drive) di level form — mengandalkan `<input type="text">` polos.
- Session-based auth dengan `passlib`/bcrypt (`passlib[bcrypt]` sudah ada di `requirements.txt`, dicatat di Trello board sebagai item terpisah) belum digarap — Basic Auth saat ini adalah solusi sementara sesuai keputusan user, bukan pengganti permanen.

## File yang Diubah/Dibuat

**Baru:**
- `app/auth.py`
- `app/routers/admin_products.py`, `app/routers/admin_news.py`, `app/routers/admin_branches.py`
- `app/templates/admin/product/{list,form}.html`
- `app/templates/admin/news/{list,form}.html`
- `app/templates/admin/branch/{list,form}.html`

**Diubah:**
- `app/routers/admin_promo.py` — tambah edit/delete/toggle-active + auth dependency.
- `app/templates/admin/promo/list.html`, `app/templates/admin/promo/form.html` — tambah aksi & mode edit.
- `app/templates/admin/base.html` — tambah link nav.
- `app/main.py` — registrasi 3 router baru.
- `.env`, `.env.example` — tambah `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
