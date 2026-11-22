# Kiosk 2M Sembako (belanja mandiri)

Aplikasi layar sentuh untuk toko self-service (pertama: **Jatibening**). Pelanggan pilih barang → keranjang →
**Bayar dengan QRIS** → layar QR + hitung mundur → lunas → struk tercetak otomatis → kembali ke awal.

- Frontend: folder ini (Vite + React + Tailwind, turunan desain `customer-web-standalone`).
- Backend: FastAPI di repo yang sama (`app/routers/kiosk.py`, `app/services/kiosk_orders.py`, `app/payments/`).
- Disajikan FastAPI di **`/kiosk`** (same origin dengan `/api`, tanpa CORS).

## Alur & aturan penting

| Hal | Perilaku |
|---|---|
| Stok | Katalog polling tiap 12 detik. Barang habis tidak bisa dipilih; jumlah di keranjang dibatasi stok (dan dikurangi otomatis kalau stok turun). |
| Harga | Server menghitung ulang semua harga & total dari database. Harga dari kiosk diabaikan. |
| Potong stok | Hanya saat order jadi **PAID**, dalam satu transaksi dengan `SELECT … FOR UPDATE`, plus catatan `stock_movements` tipe `sale`. Webhook yang dikirim berulang aman (idempotent). |
| Kedaluwarsa | Order belum dibayar kedaluwarsa setelah 10 menit (`KIOSK_ORDER_TTL_SECONDS`). |
| Tidak disentuh | Setelah 60 detik muncul "Masih belanja?" + hitung mundur 15 detik, lalu keranjang dikosongkan dan kembali ke awal. |
| Offline | Server tidak terjangkau → katalog tetap tampil dengan peringatan dan tombol bayar dikunci; kalau belum ada data sama sekali → layar "Kiosk sedang offline". Pulih sendiri saat koneksi kembali. Service worker menyimpan cangkang aplikasi, jadi reload/reboot saat internet mati tetap membuka kiosk (bukan halaman error Chrome). |
| Keranjang | Tombol keranjang mengambang di **kanan bawah layar** (badge jumlah barang + total). Disentuh → **popup overlay** keranjang di atas katalog, dengan ringkasan total pola customer-web (Subtotal, lalu **Total** + angka besar). Tambah/kurang barang murni di perangkat (tidak ada request API per tap); server baru dipanggil saat "Bayar dengan QRIS". |
| Ukuran layar | Seluruh UI ikut membesar sesuai sisi terpendek layar (root font ±17 px di 1280×800, ±21 px di 21" 1920×1080); jumlah kolom produk menyesuaikan lebar. Fullscreen lewat Chrome `--kiosk`, PWA `display: fullscreen`, atau otomatis minta fullscreen saat sentuhan pertama di browser biasa. |
| PWA | Ada `manifest.webmanifest` (fullscreen, landscape, ikon 2M) + service worker, jadi bisa di-install: buka `/kiosk/` di Chrome → ⋮ → **Install 2M Kiosk**. **Untuk tablet toko, tetap jalankan lewat shortcut Startup `chrome.exe --kiosk --kiosk-printing` (lihat bawah), bukan "Start app when you sign in" milik PWA**: opsi itu tidak membawa `--kiosk-printing`, jadi struk akan memunculkan dialog print, dan pelanggan bisa keluar dari jendela. Yang tetap terpakai dari PWA: service worker (kiosk tetap terbuka saat internet mati) dan ikon. |
| Layar sentuh | Target sentuh ≥ 56 px, tanpa hover, tanpa kolom ketik (PIN pakai keypad layar), tanpa seleksi teks, pinch-zoom, menu tekan-lama, atau swipe-back. |
| Staf | **Tap logo "2M" 5× cepat** (atau tekan-tahan 1,5 detik) → PIN → daftar order menunggu bayar: **Tandai lunas** / **Batalkan**, plus cetak ulang struk & "Ternyata sudah bayar" untuk order yang sudah kedaluwarsa. |

### Pembayaran hari Senin: provider `manual`

Belum ada akun gateway, jadi `PAYMENT_PROVIDER=manual`:

1. Kiosk menampilkan **gambar QRIS statis toko** + total yang harus dibayar.
2. Pelanggan scan, **mengetik nominal sendiri**, bayar, lalu menunjukkan bukti ke petugas.
3. Petugas cek mutasi di aplikasi merchant QRIS → di kiosk: tap logo 5× → PIN → **Tandai lunas**.
4. Kiosk otomatis pindah ke layar sukses dan mencetak struk.

> Risiko mode manual: pelanggan bisa salah ketik nominal. Petugas WAJIB mencocokkan nominal di aplikasi merchant sebelum tandai lunas.

**Gambar QRIS toko** (pilih satu):
- Simpan gambar QRIS asli sebagai `kiosk-web/public/qris-static.png`, lalu `npm run build` dan commit `dist/` (default `KIOSK_QRIS_IMAGE_URL=/kiosk/qris-static.png`), atau
- Upload ke Cloudinary lalu isi env `KIOSK_QRIS_IMAGE_URL=https://res.cloudinary.com/...`.

Kalau gambar belum ada, kiosk menampilkan "Gambar QRIS belum tersedia. Silakan minta QRIS ke petugas."

## Environment variables (server, di Render)

| Env | Wajib | Contoh | Keterangan |
|---|---|---|---|
| `KIOSK_DEVICE_TOKEN` | ya | string acak panjang | Header `X-Kiosk-Token`. Tanpa ini semua endpoint kiosk menolak (fail closed). Buat dengan `python -c "import secrets; print(secrets.token_urlsafe(32))"`. |
| `KIOSK_STAFF_PIN` | ya | `482916` | PIN panel staf. 5× salah → terkunci 5 menit. |
| `PAYMENT_PROVIDER` | ya | `manual` | `manual` (Senin), `mock` (tes lokal), `midtrans`/`xendit` (belum diimplementasi). |
| `KIOSK_QRIS_IMAGE_URL` | untuk manual | `/kiosk/qris-static.png` | Gambar QRIS statis toko. |
| `KIOSK_DEFAULT_BRANCH` | tidak | `jatibening` | Cabang kalau URL kiosk tidak menyebut `branch`. Bisa id angka atau kata dari nama cabang. |
| `KIOSK_ORDER_TTL_SECONDS` | tidak | `600` | Batas waktu bayar. |
| `MOCK_AUTO_PAY_SECONDS` | tidak | `8` | Khusus `mock`: order lunas otomatis setelah N detik (0 = mati). |
| `DB_SSLMODE` | tidak | `require` | Default `require` (Supabase). Lokal: `disable`. |
| `ENV_FILE` | tidak | `.env.local` | File env yang dibaca (default `.env`). |

Rahasia (token, PIN, nanti server key gateway) hanya ada di server. Bundle JS kiosk tidak berisi token apa pun.

## Konfigurasi di sisi kiosk (URL)

Buka sekali di tablet:

```
https://<domain>/kiosk/?branch=jatibening&token=<KIOSK_DEVICE_TOKEN>&paper=58
```

`token`, `branch`, `paper` disimpan di localStorage tablet; token langsung dihapus dari address bar.
`paper=80` untuk printer 80 mm (default 58 mm). Lebar kertas/area cetak ada di `src/components/Receipt.tsx` (`PAPER`).

## Deploy ke Render: `dist/` ikut di-commit

Pilihan: **commit `kiosk-web/dist`**, bukan build Node di Render. Alasannya:
- Service Render ini runtime **Python**; build Node di sana bergantung pada versi Node yang kebetulan ada di image build, dan kalau `npm install` gagal, deploy backend ikut gagal. Untuk toko yang buka Senin, itu risiko yang tidak perlu.
- `dist` kecil (±350 KB) dan deterministik: yang dites di lokal persis yang jalan di produksi.
- `buildCommand` Render tidak perlu diubah (`pip install … && alembic upgrade head`).

Setiap mengubah kiosk:

```powershell
cd kiosk-web
npm install
npm run build
cd ..
git add kiosk-web/dist kiosk-web/src
```

FastAPI menyajikan `kiosk-web/dist` di `/kiosk` (`app/main.py`): file di `assets/` di-cache 1 tahun (nama ber-hash), `index.html` dan `sw.js` `no-cache`, jadi deploy baru langsung terpakai setelah reload.

## Deploy sebagai Render Static Site (alternatif, di root domain "/")

Build yang sama bisa juga dihosting sebagai **Render Static Site** terpisah. Base path diatur env `VITE_BASE`:
tanpa env hasilnya tetap `/kiosk/` (versi FastAPI di atas, identik), dengan `VITE_BASE=/` semua aset,
manifest, ikon dan service worker ada di root.

Setting di Render (New → Static Site):

| Field | Isi |
|---|---|
| Root Directory | `kiosk-web` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| Environment | `VITE_BASE=/` |

**Redirects/Rewrites** (urutan penting, yang `/api` harus di atas):

| Source | Destination | Action |
|---|---|---|
| `/api/*` | `https://<nama-web-service>.onrender.com/api/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

- Karena `/api/*` di-*rewrite* (bukan redirect), dari sisi browser API tetap **same-origin** dengan halaman kiosk, jadi tidak perlu CORS di backend.
- URL tablet jadi: `https://<domain-static>/?branch=jatibening&token=<KIOSK_DEVICE_TOKEN>&paper=58` (shortcut Startup Chrome ikut diganti ke URL ini).
- **`KIOSK_QRIS_IMAGE_URL` wajib URL absolut** (mis. Cloudinary `https://res.cloudinary.com/...`). Default backend `/kiosk/qris-static.png` tidak ada di static site root, jadi QRIS manual akan tampil "Gambar QRIS belum tersedia".
- `/favicon.ico` di `index.html` mengarah ke root domain; di static site path itu tidak ada (ikon tab browser saja, tidak berpengaruh ke kiosk/PWA, karena PWA memakai `icons/` dari manifest).
- Build lokal untuk mengecek: `$env:VITE_BASE="/"; npm run build; npx vite preview` (lalu hapus env dan `npm run build` lagi kalau `dist/` mau dikembalikan ke versi FastAPI `/kiosk/`). Di Git Bash pakai `MSYS_NO_PATHCONV=1 VITE_BASE=/ npm run build`, karena Git Bash mengubah `/` jadi path Windows.

## Development lokal

```powershell
# Postgres lokal (contoh: scoop install postgresql; port 5433), lalu buat DB sembako_kiosk
$env:ENV_FILE=".env.local"
python -m alembic upgrade head
python -m scripts.seed_kiosk --create-branch --demo-products   # data TES: harga dummy
python -m uvicorn app.main:app --port 8766
# buka http://localhost:8766/kiosk/?branch=jatibening&token=dev-kiosk-token
```

Contoh `.env.local` (tidak di-commit):

```
DATABASE_URL=postgresql://postgres@localhost:5433/sembako_kiosk
DB_SSLMODE=disable
KIOSK_DEVICE_TOKEN=dev-kiosk-token
KIOSK_STAFF_PIN=2468
PAYMENT_PROVIDER=mock
MOCK_AUTO_PAY_SECONDS=8
```

Hot reload frontend: `npm run dev` di `kiosk-web` → `http://localhost:5172/kiosk/` (proxy `/api` ke `localhost:8000`; set `VITE_KIOSK_DEVICE_TOKEN` di `kiosk-web/.env.local` khusus dev).

Mock bayar manual: `POST /api/v1/kiosk/payments/webhook/mock` body `{"provider_ref": "mock-<no order>", "status": "PAID"}`.

**Seed produksi**: `scripts/seed_kiosk.py` mengisi harga **dummy**. Di produksi, isi harga/modal/stok asli (admin dashboard menyusul); seed hanya untuk tes. Produk tanpa harga atau tanpa baris `branch_stock` tidak tampil di kiosk.

## Setup tablet Windows (Chrome kiosk)

1. **Akun & auto-login**: buat akun lokal Windows khusus (mis. `kiosk`, bukan admin). Aktifkan auto-login: `netplwiz` → hapus centang "Users must enter a user name and password" (kalau opsi tidak muncul: Settings → Accounts → Sign-in options → matikan "Require Windows Hello sign-in"), atau pakai Sysinternals Autologon.
2. **Printer thermal**: install driver, jadikan **default printer** (Settings → Bluetooth & devices → Printers → matikan "Let Windows manage my default printer" → pilih printer → Set as default). Atur ukuran kertas di Printing preferences (58 mm / 80 mm, panjang roll/continuous). Tes print sekali dari Chrome biasa: pastikan margin "None" dan header/footer mati.
3. **Shortcut Startup**: Win+R → `shell:startup` → New → Shortcut, target:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI --disable-session-crashed-bubble --user-data-dir=C:\kiosk-chrome "https://<domain>/kiosk/?branch=jatibening&paper=58"
   ```

   Jalankan sekali URL yang berisi `&token=…` supaya token tersimpan (profil `C:\kiosk-chrome` menyimpannya). Setelah itu shortcut tanpa token sudah cukup.
   - `--kiosk-printing` = `window.print()` langsung ke printer default tanpa dialog.
   - Keluar dari kiosk mode: Alt+F4 (pakai keyboard), atau Ctrl+Alt+Del → Task Manager.
4. **Layar sentuh Windows**: matikan swipe dari tepi layar (supaya pelanggan tidak membuka Action Center / Task View): `gpedit.msc` → Computer Configuration → Administrative Templates → Windows Components → Edge UI → **Allow edge swipe = Disabled** (Windows Home: registry `HKLM\SOFTWARE\Policies\Microsoft\Windows\EdgeUI` DWORD `AllowEdgeSwipe = 0`). Matikan juga keyboard sentuh otomatis kalau mengganggu (kiosk tidak memakai kolom ketik).
5. **Jangan tidur**: Settings → System → Power → Screen & sleep: semua **Never**. (Kiosk juga meminta Wake Lock ke browser.) Matikan screen saver.
6. **Update di jam buka**: Settings → Windows Update → **Active hours** (mis. 06:00–22:00) dan "Pause updates" selama minggu pertama; matikan "Get the latest updates as soon as they're available". Chrome boleh update sendiri (restart malam hari).
7. **Notifikasi**: Settings → System → Notifications → off, Focus/Do not disturb on, supaya tidak ada pop-up di atas kiosk.
8. **Tes sebelum buka**: beli 1 barang murah → bayar → tandai lunas lewat panel staf → struk keluar → cek stok berkurang.

## Pasang gateway asli (Midtrans / Xendit) nanti

Semua logika order bicara lewat antarmuka `PaymentProvider` (`app/payments/base.py`):

- `create_qris(order) -> QrisCharge(provider_ref, qr_string | qr_image_url, expires_at)`
- `verify_webhook(request) -> WebhookEvent(provider_ref, status, amount)` (raise `WebhookRejected` kalau tanda tangan salah)
- `check_status(payment)` — cadangan kalau webhook telat (dipanggil saat kiosk polling)
- `cancel(payment)`

Langkah:
1. Implementasikan kelas di `app/payments/providers.py` (lihat blok `TODO(gateway)` — sudah ada catatan cara verifikasi tanda tangan Midtrans & Xendit).
2. Simpan server key / callback token di env Render (jangan pernah di `kiosk-web`).
3. `PAYMENT_PROVIDER=midtrans` (atau `xendit`), daftarkan webhook `https://<domain>/api/v1/kiosk/payments/webhook/midtrans` di dashboard gateway.
4. Kiosk tidak perlu diubah: kalau provider mengirim `qr_string`, kiosk merender QR dinamis (nominal sudah terkunci) dan layar pindah otomatis saat webhook masuk. Panel staf tetap bisa dipakai sebagai cadangan.

Webhook yang masuk setelah order dibatalkan/kedaluwarsa tidak mengubah order/stok; pembayarannya ditandai `PAID_LATE` untuk ditindaklanjuti admin (refund / proses manual).

## Data untuk laporan (admin dashboard menyusul)

- `order_items` menyimpan snapshot `product_name`, `unit_price`, **`cost_price`**, `qty`, `subtotal` → laba = Σ(subtotal − cost_price × qty).
- `stock_movements` mencatat semua perubahan stok (`in`, `out`, `adjust`, `sale`) dengan `qty` bertanda, `qty_after`, `ref`, `note`, `unit_cost` → dasar stock opname & kartu stok.
- `payments` menyimpan provider, ref, status, `raw_callback` (JSONB), `confirmed_by` (`webhook`/`poll`/`staff`).
- `branch_stock.qty` boleh negatif (penjualan tetap dicatat kalau stok sistem kurang); selisih muncul saat opname.
