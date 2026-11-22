# Admin toko kiosk 2M (`/admin-pos`)

Dashboard admin untuk toko self-service (kiosk, pertama: **Jatibening**): produk & harga, katalog, stok, transaksi, laporan laba.

- Frontend: folder ini (Vite + React 18 + TS + Tailwind preset 2M + react-query). Turunan `admin-web-products`
  (komponen `Dialog`, `Select`, `Segmented`, `Popover`, ikon, `tailwind-preset.js`, `DESIGN_SYSTEM.md` disalin dari sana).
- Backend: FastAPI di repo yang sama, `app/routers/admin_pos.py` (`/api/v1/admin/*`), login di `app/admin_session.py`.
- Disajikan FastAPI di **`/admin-pos`** (same origin dengan `/api`, tanpa CORS), sama seperti `/kiosk`.

## Menu

| Menu | Isi |
|---|---|
| **Laporan** | Panel hari ini (omzet, laba kotor, biaya, laba bersih, transaksi, order menunggu bayar). Rentang tanggal: omzet, laba kotor, biaya operasional, laba bersih, transaksi; kartu **Laba** (omzet − modal barang terjual = laba kotor − biaya per kategori = laba bersih) dan **Arus uang** (uang masuk penjualan − belanja barang − biaya = selisih uang); grafik harian bertumpuk (modal + laba = omzet, tombol **Tabel** dengan biaya, laba bersih, belanja barang per hari), penjualan per produk (Terlaris / Laba terbesar / Margin %), stok menipis, unduh CSV (keuangan harian, belanja barang, biaya, per produk, transaksi, item). |
| **Biaya** | Catat biaya operasional (listrik, air, internet, sewa, gaji staf, plastik, kebersihan, transport, biaya QRIS, lain-lain, atau kategori sendiri) per tanggal; ubah/hapus; total dan per kategori. Belanja barang dagangan **tidak** dicatat di sini, tapi di Stok → Barang masuk. |
| **Transaksi** | Order kiosk per status & tanggal, cari nomor order. Detail: item dengan harga, modal snapshot, laba. **Tandai lunas** / **Batalkan** untuk order menunggu bayar (cadangan selama QRIS manual), "Ternyata sudah bayar" untuk order kedaluwarsa, **Cetak ulang struk** (tata letak sama dengan struk kiosk, 58/80 mm). Daftar disegarkan tiap 15 detik. |
| **Produk** | Tab **Produk** (per cabang): harga jual & modal diubah langsung di tabel (klik angka, Enter), margin, stok, centang **Dijual** = tampil di kiosk cabang ini, **Atur** = batas stok menipis. **Tambah produk** dari katalog (harga, modal, stok awal). Tab **Katalog**: master produk (nama, SKU, kategori, foto ke Cloudinary, deskripsi, aktif). |
| **Stok** | **Barang masuk** (banyak produk sekaligus, no. nota, modal per unit; opsional jadi harga modal produk), **Penyesuaian** (barang keluar: rusak/kedaluwarsa/hilang; koreksi ±; alasan wajib), **Opname** (isi hitung fisik, sistem menulis selisih sebagai movement `adjust` dengan catatan "sistem X, hitung fisik Y"), **Riwayat** (filter jenis, produk, tanggal, cari). |

### Aturan data

- **Harga jual & modal** disimpan di `products.price` / `products.cost_price` (dipakai kiosk semua cabang). Saat order dibuat,
  kiosk menyalin `cost_price` ke `order_items.cost_price`; laporan memakai salinan itu, jadi ganti modal tidak mengubah laba masa lalu.
  Item tanpa modal dihitung modal 0 dan laporan menampilkan peringatan.
- **Dijual/sembunyi** per cabang ada di `branch_stock.is_active` (migrasi `e3b5c7d9f124`). `products.is_active` (Katalog → Aktif)
  tetap dipakai website marketing juga, jadi menonaktifkannya menyembunyikan produk di website **dan** kiosk.
- **Semua perubahan stok** lewat `app/services/stock.py`: kunci baris `branch_stock` (`SELECT … FOR UPDATE`, urut `product_id`),
  ubah qty, tulis `stock_movements` (`qty_after`, `ref`, `note`, `created_by`) dalam satu transaksi. Penjualan kiosk
  (`kiosk_orders.mark_paid`) memakai fungsi yang sama.
- **Laba bersih** = laba kotor − biaya operasional (tabel `expenses`, migrasi `f6a8c0e2b347`, dihitung menurut tanggal biaya).
- **Arus uang** (dasar kas): uang masuk = omzet lunas; uang keluar = belanja barang (Σ qty × modal per unit dari barang masuk,
  termasuk stok awal saat produk ditambahkan) + biaya. Bisa minus saat baru belanja stok; itu bukan rugi karena barangnya jadi
  nilai stok. Belum ada saldo kas/rekening berjalan dan belum ada pencatatan prive (uang yang diambil pemilik).
- Opname membaca qty sistem **setelah** baris dikunci, jadi penjualan yang masuk saat orang menghitung tidak hilang.
- Tanggal filter dan laporan = **WIB**. Laporan hanya menghitung order `PAID`, dikelompokkan menurut `paid_at`.
- CSV memakai pemisah `;` + BOM UTF-8 supaya langsung terbuka benar di Excel setelan Indonesia.

## Login

Kredensial sama dengan admin website: env `ADMIN_USERNAME` / `ADMIN_PASSWORD` (yang juga dipakai HTTP Basic di `/admin/*`).

- `POST /api/v1/admin/auth/login` memasang cookie `pos_admin`: HttpOnly, SameSite=Strict, path `/api/v1/admin`, Secure di HTTPS,
  berlaku 12 jam (`ADMIN_SESSION_HOURS`). Token ditandatangani HMAC; tidak ada tabel sesi.
- Request yang mengubah data wajib header `X-Admin-Request: 1` (pertahanan CSRF; frontend mengirimnya otomatis).
- 5× salah password → login dikunci 5 menit (per proses server).
- Ganti `ADMIN_PASSWORD` (atau `ADMIN_SESSION_SECRET`) = semua sesi lama otomatis keluar.

## Environment variables (server, Render)

| Env | Wajib | Keterangan |
|---|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | ya | Sudah ada untuk admin website. |
| `ADMIN_SESSION_SECRET` | disarankan | Kunci tanda tangan cookie. `render.yaml` memakai `generateValue: true`. Kalau kosong, diturunkan dari `ADMIN_PASSWORD`. |
| `ADMIN_SESSION_HOURS` | tidak | Lama sesi, default `12`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | untuk foto | Sudah ada. Foto dikecilkan di browser (JPEG ≤1600 px / 400 KB) lalu diunggah ke folder `products`. |
| `KIOSK_DEFAULT_BRANCH` | tidak | Cabang default yang dibuka admin (sama dengan kiosk, default `jatibening`). |

Env kiosk lain (`KIOSK_DEVICE_TOKEN`, `PAYMENT_PROVIDER`, …) ada di `kiosk-web/README.md`.

## Deploy ke Render: `dist/` ikut di-commit

Sama dengan kiosk: service Render ini runtime Python, jadi **`admin-pos-web/dist` di-commit** dan `buildCommand` tidak berubah
(`pip install … && alembic upgrade head` — migrasi `e3b5c7d9f124` dan `f6a8c0e2b347` jalan otomatis).

Setiap mengubah frontend:

```powershell
cd admin-pos-web
npm install
npm run build
cd ..
git add admin-pos-web/dist admin-pos-web/src
```

FastAPI (`app/main.py`) menyajikan `admin-pos-web/dist` di `/admin-pos`: `assets/` di-cache 1 tahun (nama ber-hash),
`index.html` `no-cache`, aset yang tidak ada → 404. Buka `https://<domain>/admin-pos/`.

## Deploy sebagai Render Static Site

Alternatif dari cara di atas: admin-pos-web jadi Static Site Render sendiri di root domain (`/`), API tetap di web service FastAPI.
`base` Vite dibaca dari `VITE_BASE` (`vite.config.ts`); tanpa env itu hasil build tetap `/admin-pos/` untuk FastAPI.

| Setelan | Nilai |
|---|---|
| Root Directory | `admin-pos-web` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| Environment | `VITE_BASE=/` |

**Redirects/Rewrites** (urutan penting, yang `/api` harus di atas):

| Source | Destination | Action |
|---|---|---|
| `/api/*` | `https://<nama-web-service>.onrender.com/api/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

- Cookie sesi `pos_admin` (SameSite=Strict, path `/api/v1/admin`) tetap jalan: dari sisi browser semua request ke `/api/...`
  same-origin dengan halaman, Render yang meneruskannya ke web service. Tidak perlu CORS.
- Routing aplikasi memakai hash (`/#/stok`), jadi refresh di halaman mana pun memuat `index.html` yang sama.
- Fetch API di frontend memakai path relatif `/api/v1/admin`, tidak perlu diubah.
- `index.html` merujuk `/favicon.ico` (disajikan FastAPI di domain web service); di Static Site file itu tidak ada, jadi
  ikon tab kosong (rewrite `/*` mengembalikan `index.html`). Tidak memengaruhi aplikasi; tidak diubah supaya build FastAPI tetap identik.
- Tes lokal: `VITE_BASE=/` perlu juga saat `npx vite preview`, karena preview membaca `base` yang sama
  (PowerShell: `$env:VITE_BASE="/"; npm run build; npx vite preview`). Preview meneruskan `/api` ke `localhost:8000`.
- Di Git Bash (Windows), `VITE_BASE=/` diubah otomatis jadi path Windows; pakai PowerShell atau `MSYS_NO_PATHCONV=1`.
  Di Render (Linux) tidak ada masalah ini.
- Setelah build untuk Static Site, jangan commit `dist` hasil `VITE_BASE=/`: `dist` di repo tetap versi `/admin-pos/` untuk FastAPI.

## Development lokal

```powershell
$env:ENV_FILE=".env.local"          # Postgres lokal, lihat kiosk-web/README.md
python -m alembic upgrade head
python -m scripts.seed_kiosk --create-branch --demo-products   # data TES
python -m uvicorn app.main:app --port 8000
# build sekali lalu buka http://localhost:8000/admin-pos/
```

Hot reload: `npm run dev` di folder ini → `http://localhost:5174/admin-pos/` (proxy `/api` ke `localhost:8000`, cookie tetap jalan
karena same-origin lewat proxy).

Tes cepat alur lengkap: Stok → Barang masuk → buka kiosk, cek stok naik → belanja di kiosk → Transaksi → **Tandai lunas**
(atau `PAYMENT_PROVIDER=mock` + `MOCK_AUTO_PAY_SECONDS`) → Laporan menunjukkan omzet, modal dan laba order itu.

## API (`/api/v1/admin`, semua butuh cookie kecuali login)

| Method | Path | Fungsi |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`; GET `/auth/me` | Sesi |
| GET | `/branches` | Cabang + `default_branch_id` |
| GET | `/products?branch_id=` | Produk cabang + ringkasan (`available/low/out/hidden/no_price`, nilai stok) |
| PATCH | `/products/{product_id}` | `branch_id` + `price` / `cost_price` / `is_active` / `min_qty` |
| GET | `/products/available?branch_id=&q=` | Produk katalog yang belum dijual di cabang |
| POST | `/products` | Tambah produk katalog ke cabang (harga, modal, stok awal → movement `in`) |
| GET/POST | `/catalog`; PATCH `/catalog/{id}`; POST `/catalog/upload-image` | Master produk, foto Cloudinary |
| POST | `/stock/in`, `/stock/adjust`, `/stock/opname` | Perubahan stok (lewat `app/services/stock.py`) |
| GET | `/stock/movements?branch_id=&type=&product_id=&date_from=&date_to=&q=&page=` | Riwayat |
| GET | `/orders?branch_id=&status=&date_from=&date_to=&q=&page=`; GET `/orders/{id}` | Transaksi |
| POST | `/orders/{id}/mark-paid`, `/orders/{id}/cancel` | Cadangan staf (memanggil `kiosk_orders.mark_paid` / `cancel_order`) |
| GET/POST | `/expenses?branch_id=&date_from=&date_to=`; PATCH/DELETE `/expenses/{id}` | Biaya operasional |
| GET | `/reports/summary?branch_id=&date_from=&date_to=` | Hari ini + rentang (penjualan, belanja barang, biaya, laba bersih, arus uang), harian, per produk, stok menipis |
| GET | `/reports/export?branch_id=&kind=daily\|purchases\|expenses\|products\|orders\|items&date_from=&date_to=` | CSV |

## Catatan

- Order yang ditandai lunas dari admin tercatat `confirmed_by = staff` (sama dengan panel PIN di kiosk) dan `raw_callback`
  berisi `{"confirmed_by": "admin_pos", "user": …}`.
- Harga masih satu untuk semua cabang (kolom di `products`). Kalau nanti cabang kedua butuh harga berbeda, tambahkan
  `branch_stock.price` dan ubah `kiosk_orders.list_products/create_order` untuk memakainya.
