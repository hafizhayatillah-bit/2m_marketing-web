# Konteks Backend & Database — Untuk Dipakai AI Lain Saat Mendesain Frontend

**Tanggal:** 2026-09-10
**Proyek:** 2M Sembako — API publik untuk menampilkan info cabang, promo, produk, dan berita/event toko sembako.

> Dokumen ini adalah "single source of truth" tentang backend & database saat ini, dibuat khusus supaya AI/developer lain yang mengerjakan frontend **tidak perlu menebak** bentuk data, endpoint, atau aturan bisnis. Kalau ada sesuatu yang tidak disebutkan di sini, anggap itu **belum ada di backend** — jangan asumsikan.

---

## 1. Gambaran Umum Arsitektur

- **Backend:** FastAPI (Python), SQLAlchemy 2.0 (style `select()`), Alembic untuk migrasi.
- **Database:** PostgreSQL, production di **Supabase** (Session Pooler), lokal via `docker-compose.yml` (Postgres 15, hanya untuk dev).
- **Admin panel:** Ada, tapi berbasis **server-side Jinja2 templates** (bukan API), lihat `app/routers/admin_promo.py` + `app/templates/admin/`. Ini bukan bagian dari "API untuk frontend" — anggap terpisah.
- **Frontend yang mau dibangun:** akan konsumsi endpoint publik JSON di bawah prefix `/api/v1/public/...`.
- **Base URL saat ini:** belum di-deploy (deploy ke Render masih pending verifikasi kartu kredit — lihat `laporan/2026-09-10_skeleton-app-dan-persiapan-deploy-render.md`). Untuk dev lokal: `http://localhost:8000`.
- **Autentikasi:** **BELUM ADA sama sekali.** Tabel `users` sudah ada di database (`id`, `username`, `password_hash`, `created_at`) tapi tidak ada endpoint login/register/JWT yang di-expose. Semua endpoint publik saat ini **tanpa auth**, admin panel Jinja2 juga tanpa auth/session check.
- **CORS:** **BELUM dikonfigurasi** di `app/main.py` (tidak ada `CORSMiddleware`). Kalau frontend jalan di origin/port berbeda, request akan diblokir browser sampai ini ditambahkan di backend.
- **Pagination:** **Tidak ada** di endpoint manapun saat ini — semua `GET` list mengembalikan seluruh baris yang match filter (`is_active=True`, dst).
- **Error handling custom:** **Belum ada** — masih default FastAPI (mis. validasi query param salah tipe akan return 422 otomatis dari Pydantic/FastAPI, tanpa format error custom).

---

## 2. Skema Database (5 Tabel, Tidak Ada Foreign Key Antar Tabel)

Semua tabel **independen**, tidak ada relasi/join. Field `is_active` ada di semua tabel kecuali `users`, dipakai sebagai soft-toggle admin (bukan soft-delete beneran).

### `branches` (cabang toko)
| Kolom | Tipe | Nullable | Catatan |
|---|---|---|---|
| id | Integer PK | no | |
| name | String | no | |
| address | Text | no | |
| city | String | no | filter publik: case-insensitive |
| latitude | Float | no | |
| longitude | Float | no | untuk pin di peta |
| google_maps_url | String | **yes** | bisa null |
| google_drive_url | String | **yes** | bisa null (kemungkinan link foto/dokumen cabang) |
| whatsapp_number | String | no | format string bebas, belum ada validasi format |
| operating_hours | String | no | free text, mis. `"08:00 - 20:00"`, **bukan** struktur per-hari |
| category_tags | **Array of String** (Postgres native array) | no, default `[]` | mis. `["grosir", "sembako"]` |
| is_active | Boolean | no, default true | **tidak** di-expose di response API |

### `promos`
| Kolom | Tipe | Nullable | Catatan |
|---|---|---|---|
| id | Integer PK | no | |
| title | String | no | |
| description | Text | **yes** | |
| normal_price | Numeric(12,2) | no | di-serialize sebagai JSON number (float), bukan string |
| promo_price | Numeric(12,2) | no | idem |
| image_url | String | **yes** | |
| start_date | Date | no | format `YYYY-MM-DD` |
| end_date | Date | no | format `YYYY-MM-DD` |
| is_active | Boolean | no, default true | tidak di-expose |

### `products`
| Kolom | Tipe | Nullable | Catatan |
|---|---|---|---|
| id | Integer PK | no | |
| name | String | no | |
| description | Text | **yes** | |
| image_url | String | **yes** | |
| category | String | no | free text di kolom DB, tapi diisi lewat **dropdown terbatas di admin** → filter di API pakai exact match, case-sensitive |
| is_active | Boolean | no, default true | tidak di-expose |

> ⚠️ **Penting:** `products` **TIDAK PUNYA kolom harga sama sekali** (sengaja, sudah divalidasi eksplisit). Kalau desain frontend butuh menampilkan harga produk, itu perlu diklarifikasi ulang ke pemilik proyek — bukan asumsi bug.

### `news` (berita/event)
| Kolom | Tipe | Nullable | Catatan |
|---|---|---|---|
| id | Integer PK | no | |
| title | String | no | |
| content | Text | no | |
| image_url | String | **yes** | |
| event_date | Date | no | format `YYYY-MM-DD` |
| is_active | Boolean | no, default true | tidak di-expose |

### `users` (belum dipakai oleh endpoint manapun)
| Kolom | Tipe | Nullable | Catatan |
|---|---|---|---|
| id | Integer PK | no | |
| username | String | no, unique | |
| password_hash | String(255) | no | |
| created_at | DateTime(timezone) | yes, server default `now()` | |

---

## 3. Endpoint Publik yang Sudah Ada

Semua di-prefix `/api/v1/public` (didaftarkan di `app/main.py`). Semua **read-only** (`GET` saja), tanpa auth, tanpa pagination.

### `GET /api/v1/public/branches`
- Query param opsional: `city` (string, **case-insensitive** exact match, mis. `?city=Bekasi` sama hasilnya dengan `?city=bekasi`).
- Filter otomatis: `is_active = true`.
- Response: `List[BranchOut]`.

Contoh response:
```json
[
  {
    "id": 1,
    "name": "2M Sembako Cabang Bekasi",
    "address": "Jl. Contoh No. 123, Bekasi",
    "city": "Bekasi",
    "latitude": -6.2383,
    "longitude": 106.9756,
    "google_maps_url": "https://maps.google.com/?q=-6.2383,106.9756",
    "google_drive_url": null,
    "whatsapp_number": "6281234567890",
    "operating_hours": "08:00 - 20:00",
    "category_tags": ["grosir", "sembako"]
  }
]
```

### `GET /api/v1/public/promos`
- Tanpa query param.
- Filter otomatis: `is_active = true` **AND** `start_date <= hari_ini AND end_date >= hari_ini`, di mana `hari_ini` dihitung eksplisit di timezone **Asia/Jakarta** (bukan UTC server), pakai `zoneinfo`.
- Jadi endpoint ini **hanya menampilkan promo yang sedang berjalan** (bukan semua promo di database).
- Response: `List[PromoOut]`.

Contoh response:
```json
[
  {
    "id": 4,
    "title": "Promo Minyak Goreng",
    "description": "Diskon spesial minyak goreng 2L",
    "normal_price": 25000.0,
    "promo_price": 20000.0,
    "image_url": "https://example.com/promo-minyak.jpg",
    "start_date": "2026-09-09",
    "end_date": "2026-09-11"
  }
]
```
> `normal_price`/`promo_price` dijamin ter-serialize sebagai **JSON number** (float), bukan string — ada `field_serializer` eksplisit untuk itu karena default Pydantic v2 men-serialize `Decimal` sebagai string.

### `GET /api/v1/public/products`
- Query param opsional: `category` (string, **exact match, case-sensitive** — karena nilai diisi lewat dropdown terbatas di admin, bukan free text user).
- Filter otomatis: `is_active = true`.
- Response: `List[ProductOut]` — **tidak ada field harga**.

Contoh response:
```json
[
  {
    "id": 2,
    "name": "Beras Premium 5kg",
    "description": "Beras kualitas premium",
    "image_url": "https://example.com/beras.jpg",
    "category": "sembako"
  }
]
```

### `GET /api/v1/public/news`
- Tanpa query param.
- Filter otomatis: `is_active = true`.
- Sort: `event_date` **ascending** (tanggal paling dekat/lama duluan).
- ⚠️ **Belum final:** ada `TODO` eksplisit di kode — saat ini **tidak** ada filter `event_date >= hari ini`, jadi event yang sudah lewat tapi masih `is_active=True` tetap ikut tampil di urutan paling atas. Ini keputusan bisnis yang masih pending dari sisi backend, bukan sesuatu yang bisa diasumsikan frontend.
- Response: `List[NewsOut]`.

Contoh response:
```json
[
  {
    "id": 1,
    "title": "Bazar Sembako September",
    "content": "Ayo kunjungi bazar sembako murah tanggal 15 September...",
    "image_url": "https://example.com/event-bazar.jpg",
    "event_date": "2026-09-15"
  }
]
```

### Endpoint lain (non-publik, bukan untuk frontend baru)
- `GET /` — health check sederhana (`{"status": "ok", ...}`).
- `GET /health` — health check tanpa DB.
- `GET /health/db` — health check + cek koneksi DB.
- `/admin/promos/...` — CRUD promo via **server-rendered HTML form** (Jinja2), bukan JSON API, tidak ada auth. Jangan dijadikan referensi pola API untuk frontend baru.

---

## 4. Field yang SENGAJA Tidak Di-expose ke Publik

Untuk semua 4 entity publik (`branches`, `promos`, `products`, `news`), field `is_active` **selalu dikecualikan** dari response — dipakai murni sebagai toggle internal admin. Jangan asumsikan field ini ada di response API, meskipun ada di DB.

---

## 5. Hal yang BELUM Ada di Backend (Penting Supaya Frontend Tidak Salah Asumsi)

Supaya frontend tidak dibangun dengan asumsi fitur yang sebenarnya belum ada:

- ❌ Tidak ada endpoint create/update/delete untuk `branches`, `products`, `news` (hanya `promos` yang punya form admin, itupun HTML bukan JSON API).
- ❌ Tidak ada autentikasi/login/JWT untuk publik maupun admin.
- ❌ Tidak ada pagination, sorting custom, atau search full-text di endpoint manapun (selain sort default `news` by `event_date`).
- ❌ Tidak ada CORS middleware — **wajib ditambahkan di backend** sebelum frontend di domain/port lain bisa fetch API ini.
- ❌ Tidak ada upload gambar — semua `image_url`/`google_maps_url`/`google_drive_url` adalah string URL yang di-input manual admin, bukan file upload.
- ❌ Tidak ada endpoint detail per-item (`GET /branches/{id}`, dst.) — hanya list endpoint.
- ❌ `products.category` tidak punya endpoint untuk ambil daftar kategori yang valid — nilai dropdown-nya hanya diketahui di sisi admin, belum ada cara publik untuk tahu kategori apa saja yang ada tanpa fetch semua produk dulu.
- ❌ Belum ada rate limiting, error response format standar, atau versioning selain prefix `/api/v1/`.

---

## 6. Rencana Deploy (Konteks Tambahan)

- Backend rencana deploy ke **Render** (`render.yaml` sudah ada, `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT`), tapi **masih pending** (butuh verifikasi kartu kredit di Render).
- Database production di **Supabase** (Postgres, Session Pooler, `sslmode=require`).
- Untuk dev lokal, Postgres bisa dijalankan via `docker-compose.yml` (`localhost:5432`, db `sembako_db`, user/pass `postgres`/`postgres`) — tapi konfigurasi `.env` bisa mengarah ke Supabase juga tergantung `DATABASE_URL`.

---

## 7. Rekomendasi untuk AI/Developer yang Mendesain Frontend

1. Desain UI untuk 4 entity: **daftar cabang (dengan peta/lat-long)**, **promo aktif (dengan harga normal vs promo, tanggal berlaku)**, **katalog produk (tanpa harga)**, **berita/event (urut tanggal)**.
2. Karena tidak ada endpoint detail per-item, semua data yang dibutuhkan untuk kartu/list item **harus sudah cukup dari response list** di atas — jangan desain halaman detail yang butuh field tambahan yang tidak ada di schema ini.
3. Karena tidak ada auth, jangan desain login/registrasi user publik dulu — kalau dibutuhkan, itu perlu dikonfirmasi & dibangun dulu di backend.
4. Karena tidak ada pagination, untuk data yang berpotensi banyak (terutama `products`), pertimbangkan infinite scroll/pagination **di sisi frontend saja** (client-side), atau minta backend menambahkan pagination sebelum data production membesar.
5. Tanyakan ke pemilik proyek dulu kalau butuh: filter kategori produk yang dinamis, halaman detail per-item, upload gambar, atau auth — semua ini **belum ada** dan butuh perubahan backend, bukan cuma frontend.
