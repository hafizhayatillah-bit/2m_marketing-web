# Audit lengkap kiosk + admin POS (commit `30303f9`)

Tanggal: 22 November 2026 (H-1 pembukaan cabang Jatibening, Senin 23 Nov).
Cakupan: `app/routers/kiosk.py`, `app/routers/admin_pos.py`, `app/admin_session.py`, `app/services/{kiosk_orders,stock}.py`,
`app/payments/`, model & migrasi kiosk, `kiosk-web/`, `admin-pos-web/`, plus bagian app lama yang dipakai bersama
(`app/main.py`, `app/auth.py` + admin Jinja, `app/database.py`, `migrations/env.py`, `render.yaml`).

## Cara audit

- Semua kode di atas dibaca langsung. Nomor baris di tabel merujuk ke **`30303f9`** (sebelum fix).
- Reproduksi lokal di DB terpisah `sembako_audit` (Postgres lokal port 5433, **bukan** produksi), provider `mock`:
  - tes race lewat service layer dengan thread dan row lock Postgres sungguhan,
  - tes HTTP lewat FastAPI `TestClient`.
  - Script ada di scratchpad session (`race_tests.py`, `http_tests.py`, `verify_fixes.py`).
- Situs live hanya dicek dengan GET read-only ke halaman publik `https://2msembako.id`.
- `dist` kiosk dan admin-pos di-build ulang ke folder lain lalu di-`diff -r` dengan `dist` yang di-commit. Hasilnya **identik**, jadi tidak ada drift. Bundle live `index-DeN8XbaQ.js` juga sama dengan `dist`.
- `alembic upgrade head` **tidak** dijalankan (ditahan hook). Perubahan `migrations/env.py` diuji dengan menjalankan pola SQL yang sama langsung ke DB lokal.

## Status perubahan

Atas izin user di chat ("kalau nemu bug langsung fix"), sebagian temuan sudah **di-fix di working tree**.

- **Belum di-commit dan belum di-push.**
- Semua fix lolos tes ulang: `verify_fixes.py` dan `race_tests.py`. Tidak ada deadlock dan stok konsisten dengan jumlah movement.
- `admin-pos-web/dist` sudah di-build ulang karena ada fix opname di UI. **Commit `src` dan `dist` bersamaan.**
- `kiosk-web/dist` tidak berubah.

File yang berubah:
- `app/rate_limit.py` (baru)
- `app/auth.py`, `app/admin_session.py`, `app/main.py`, `app/payments/providers.py`
- `app/routers/{kiosk,admin_pos,admin_products,admin_branches}.py`
- `app/services/{kiosk_orders,stock}.py`
- `migrations/env.py`
- `admin-pos-web/src/features/stock/StockPage.tsx` + `admin-pos-web/dist/`
- `kiosk-web/README.md`

Tidak ada migrasi baru.

---

## A. Wajib sebelum buka Senin

| # | Sev | Lokasi | Skenario gagal (bukti) | Fix | Status |
|---|---|---|---|---|---|
| A1 | **critical** (ops) | `kiosk-web/public/` (tidak ada `qris-static.png`), `app/payments/providers.py:26` | **Live:** `GET https://2msembako.id/kiosk/qris-static.png` → `200 text/html 972B` (itu `index.html`, bukan gambar). Kalau `KIOSK_QRIS_IMAGE_URL` di Render belum diisi URL gambar asli, layar bayar cuma menampilkan "Gambar QRIS belum tersedia. Silakan minta QRIS ke petugas." Akibatnya alur self-service tidak jalan. | Upload QRIS asli ke Cloudinary lalu isi `KIOSK_QRIS_IMAGE_URL` di Render, **atau** taruh di `kiosk-web/public/qris-static.png` lalu `npm run build` dan commit `dist`. Tes dari tablet. | **BELUM** (butuh gambar QRIS dari pemilik) |
| A2 | **high** | `app/routers/kiosk.py:44-62` | **Repro H3:** 5 PIN salah, lalu PIN **benar** ditolak `429 PIN_LOCKED` selama 5 menit (counter global). Pelanggan iseng tinggal tap logo 5× lalu ketik PIN asal 5×. Akibatnya staf tidak bisa "Tandai lunas" 5 menit dan antrean bayar macet. | Pakai `FailureLimiter` baru (`app/rate_limit.py`): 5 salah dalam 60 detik → kunci **60 detik**. `compare_digest` pakai bytes, jadi PIN atau token non-ASCII tidak lagi bikin 500. README: PIN minimal 6 digit, dengan cadangan tandai lunas lewat `/admin-pos`. Catatan: endpoint ini juga butuh device token, jadi penebakan hanya bisa dari layar kiosk, kira-kira 7.200 tebakan/hari. Dengan PIN 6 digit, perlu ±70 hari rata-rata. | **FIXED** (V4) |
| A3 | **high** | `app/admin_session.py:67-83`, `app/auth.py:10-24` | **Repro H4:** login `/api/v1/admin/auth/login` itu publik. 5 percobaan gagal dari siapa pun di internet membuat login **benar** pemilik ikut kena `429` selama 5 menit, dan bisa diulang terus (DoS). **Repro H5:** admin Jinja lama `/admin/*` (Basic Auth, **password yang sama**) **tanpa batas sama sekali**. 30 tebakan semuanya cuma `401` tanpa lockout, jadi lockout admin-pos bisa dilewati begitu saja. | Limiter per IP (entri terakhir `X-Forwarded-For`, yang tidak bisa dipalsukan klien): 5/5 menit. Ditambah cadangan global 100/15 menit. Limiter ini **dipakai bersama** login admin-pos dan Basic Auth `/admin`. Repro V5: IP penyerang terkunci, IP pemilik tetap bisa login. 5 tebakan Basic Auth juga ikut mengunci login admin-pos dari IP itu. | **FIXED** (V5) |
| A4 | **high** | `app/routers/admin_products.py:97-102`, `app/routers/admin_branches.py:117-122`, FK `ondelete=CASCADE` di `app/models/kiosk.py:37-38,59-60`, `app/models/expense.py:15` | Tombol "Hapus" di admin Jinja lama: menghapus **cabang** Jatibening sebelum ada order akan ikut menghapus semua `branch_stock`, `stock_movements`, dan `expenses` (CASCADE) tanpa jejak. Kalau sudah ada order → 500. Menghapus **produk** yang sudah ada stoknya juga menghapus kartu stoknya. Ditambah **CSRF**: browser otomatis mengirim kredensial Basic Auth, jadi form dari situs lain bisa POST `/admin/branches/{id}/delete`. | Hapus ditolak `409` ("nonaktifkan saja") kalau masih ada order, movement, stok, atau biaya. `verify_admin` menolak POST lintas situs (`Sec-Fetch-Site: cross-site` atau `Origin`/`Referer` beda host). Repro V6: 403 untuk cross-site, 409 untuk cabang/produk berdata, GET list tetap 200. | **FIXED** (V6) |
| A5 | **high** (config) | `app/payments/providers.py:125-134`, `:45-88` | Kalau `PAYMENT_PROVIDER=mock` tidak sengaja terset di produksi: order **lunas otomatis** setelah 8 detik, dan **repro H10**: `POST /api/v1/kiosk/payments/webhook/mock` tanpa tanda tangan dari siapa pun langsung `{"status":"PAID"}`. Artinya barang gratis. | `get_provider()` menolak `mock` kalau env `RENDER` ada (Render selalu men-set env ini), kecuali `ALLOW_MOCK_PAYMENTS=1`. Fail-closed. Repro V10. | **FIXED** |
| A6 | **high** (ops) | `app/services/kiosk_orders.py:141-169`, `kiosk-web/src/lib/cart.ts:26` | Kiosk menolak barang yang stok sistemnya 0 (`INSUFFICIENT_STOCK`, kartu "Habis"). Di toko self-service barangnya ada fisik di rak, jadi kalau barang masuk belum dicatat di `/admin-pos`, pelanggan **tidak bisa membayar barang yang sudah dipegang**. Sebaliknya, **repro T1**: dua order untuk unit terakhir dua-duanya lolos dan lunas, jadi stok −1. Itu memang desain (stok boleh negatif, ketahuan saat opname). | Operasional: sebelum buka, **input stok awal semua produk** (Barang masuk / opname) dan cek tidak ada produk aktif `state=out` padahal ada di rak. Kode tidak diubah. Opsi nanti: flag per produk "boleh jual walau stok sistem 0". | **BELUM** (checklist) |
| A7 | **high** (proses) | `README` alur manual, `kiosk-web/src/screens/Staff.tsx:152` | Mode manual memakai QRIS statis. Pelanggan mengetik nominal sendiri, lalu staf menandai lunas berdasarkan bukti. Risiko: (1) **screenshot palsu atau diedit**, (2) nominal salah ketik, (3) dua order pending dengan total sama tidak bisa dibedakan dari mutasi. Kalau salah pilih order, satu order lunas dobel dan order lain lunas tanpa uang. | SOP: **wajib cek mutasi di aplikasi merchant** (bukan layar HP pelanggan), cocokkan nominal dan jam, satu pelanggan satu order. Tidak ada perubahan kode. | **BELUM** (SOP) |
| A8 | **medium** | `kiosk-web/README.md` setup tablet | (1) Windows 11: **gestur 3/4 jari** (Task View, pindah aplikasi) tidak ikut mati oleh kebijakan *edge swipe*. (2) Chrome yang crash atau ditutup **tidak hidup lagi** karena shortcut Startup hanya jalan saat login, jadi desktop Windows terbuka untuk pelanggan. (3) URL ber-token tercatat di log akses Render dan riwayat Chrome. | README ditambah tiga hal: matikan gestur 3/4 jari, watchdog Task Scheduler (atau Assigned Access / Shell Launcher), dan ganti `KIOSK_DEVICE_TOKEN` setelah tablet selesai di-setup. Langkahnya tetap harus **dikerjakan di tablet**. | **FIXED** (doc), perlu dikerjakan |
| A9 | **medium** | `app/services/stock.py:196-235` (baris 222), `admin-pos-web/src/features/stock/StockPage.tsx:390,415` | Admin melihat stok 10, menghitung 10 di rak. Sebelum disimpan, kiosk menjual 3 (barang keluar dari rak). Opname lama mengganti stok jadi **10**, padahal fisik tinggal 7. Lock baris tidak menolong, karena hitungannya diambil sebelum transaksi. Teks UI "penjualan di tengah hitungan tetap aman" salah. | UI mencatat `system_qty` saat angka hitung diisi. Server menerapkan selisih `counted − system_qty` ke stok terkini. Tanpa `system_qty` perilakunya tetap seperti dulu (kompatibel). Repro V7: hasil 7 (benar). Movement mencatat "ada transaksi di tengah opname". | **FIXED** (perlu commit `admin-pos-web/dist`) |
| A10 | **medium** | `app/main.py:52-69` | **Repro H11 + live:** `/kiosk/assets/index-TIDAKADA.js` → `200 text/html`. Kalau tablet masih memegang `index.html` lama (offline fallback) yang merujuk aset hash lama, server membalas HTML sebagai JS. Service worker lalu **menyimpannya ke cache** sebagai aset (`sw.js` `store()` hanya cek `res.ok`), dan tablet bisa layar putih sampai cache dibersihkan. | Path `assets/` yang tidak ada → `404`, sama seperti `/admin-pos`. Repro V9. | **FIXED** |
| A11 | **medium** | `render.yaml:6`, `migrations/env.py:55-75` | `alembic upgrade head` jalan di build saat versi lama masih melayani kiosk. `ALTER TABLE` butuh ACCESS EXCLUSIVE lock. Kalau tertahan transaksi lain, semua query berikutnya ke tabel itu ikut antre, jadi kiosk dan admin **macet** selama migrasi menunggu. | `SET lock_timeout = '10s'` sebelum migrasi (bisa diatur lewat `MIGRATION_LOCK_TIMEOUT`, `0` = mati). Kalau tertahan, migrasi gagal cepat dan build gagal, jadi versi lama tetap jalan. Pola diuji ke Postgres lokal dengan SQLAlchemy 2.0. | **FIXED** (alembic tidak dijalankan) |

## B. Wajib sebelum memasang payment gateway (Prismalink / lainnya)

| # | Sev | Lokasi | Skenario gagal (bukti) | Fix | Status |
|---|---|---|---|---|---|
| B1 | **critical** | `app/services/kiosk_orders.py:267-272`, dipanggil dari `refresh_from_provider` `:238-251` ← `GET /orders/{id}` `app/routers/kiosk.py:169-177` | **Potong stok ganda.** Kiosk polling `GET /orders/{id}` tiap 2,5 detik. Dengan gateway (atau mock), `check_status` → `mark_paid`. Order sudah dimuat di session (`get_order`), lalu `SELECT … FOR UPDATE` menunggu lock dan DB sudah `PAID`. Tapi SQLAlchemy mengembalikan objek **lama** dari identity map (`with_for_update` tidak me-refresh). **Repro T3b:** 4 poll bersamaan → **1 order, 4 movement `sale`, stok 10→2**. **Repro H9 (HTTP):** 6 GET bersamaan → 2× potong. Bukti akar masalah: di thread yang menunggu, `SELECT status` mentah = `PAID`, `orm.status` = `PENDING_PAYMENT`. Mode manual Senin **tidak** kena (`check_status` → `None`, staf/admin memakai session baru). | `execution_options(populate_existing=True)` di semua `FOR UPDATE` order/payment di `mark_paid` dan `cancel_order` (payment pending di cancel juga dikunci). Repro V1 (5 ronde) dan V2: tepat 1 `sale`. | **FIXED** |
| B2 | **high** | `app/services/kiosk_orders.py:275-280,293,325`, `app/routers/kiosk.py:208-218` | (1) Cek nominal dilakukan **sebelum** cek "sudah PAID". **Repro T6:** webhook ulang dengan nominal salah untuk order PAID **menimpa** `raw_callback` asli, jadi bukti rekonsiliasi hilang. (2) `raw_callback` selalu ditimpa (callback PAID_LATE kedua menimpa yang pertama). (3) Kalau provider tidak mengirim `amount`, cek nominal **dilewati**, jadi order bisa lunas dengan nominal berapa pun. (4) Nominal tidak cocok dibalas 400, sehingga gateway mengulang terus. | Urutan cek dibalik. `raw_callback` jadi riwayat `{"events":[…]}` (maks 20, append-only). Webhook `PAID` tanpa nominal ditolak untuk provider selain mock. Nominal tidak cocok dicatat lalu dibalas `200 {"flagged":"AMOUNT_MISMATCH"}`. Repro V3. | **FIXED** |
| B3 | **medium** | `app/routers/kiosk.py:159-166`, `kiosk-web/src/app/App.tsx:116-134` | Tidak ada idempotency key. **Repro H7:** dua submit identik menghasilkan dua order (`K…-0001`, `K…-0002`). Skenario nyata: `createOrder` timeout 12 detik padahal server sudah membuat order, pelanggan tap "Bayar" lagi, dan muncul dua order pending dengan total sama di panel staf (lihat A7). Double-tap di UI sudah dicegah (`disabled={paying}`). | Header `Idempotency-Key` dari kiosk (dibuat per isi keranjang, dipakai ulang saat retry), kolom `orders.client_ref` + unique index (migrasi additive), dan kembalikan order yang sama. | **BELUM** (butuh migrasi + build kiosk) |
| B4 | **medium** | `app/services/kiosk_orders.py:94-110,211` | Order kedaluwarsa memakai `order.expires_at` (10 menit). Kalau QR gateway berlaku lebih lama, pelanggan bisa membayar QR yang masih valid setelah order kita `EXPIRED`. Hasilnya `PAID_LATE` (uang masuk, barang tidak tercatat terjual). | Saat `create_qris`, set expiry QR di gateway ≤ `expires_at` order (lebih baik 30 detik lebih pendek). Dukung `cancel()` di provider. | **BELUM** |
| B5 | info | `app/payments/` | Hal yang **sudah benar**: harga dan total dihitung server (repro H8: field `price` dari klien diabaikan, qty −1 / 10⁹ → 422); `UNIQUE(provider, provider_ref)`; webhook ref tidak dikenal → 200 ignored; status PAID tidak bisa kembali (`cancel` order PAID → 409); bayar setelah CANCELLED/EXPIRED → `PAID_LATE` dan tidak menyentuh stok (repro T5); cancel vs mark-paid vs expire bersamaan 20 ronde tanpa state tidak konsisten (repro T4). | — | OK |

**Checklist integrasi Prismalink QRIS (server-to-server + webhook)**, mengisi `GatewayQrisProviderStub`:

1. **Kredensial di env Render saja.** Merchant ID, key, dan secret tidak boleh ada di `kiosk-web`.
2. **`create_qris`:**
   - Kirim `order_number` sebagai merchant reference unik dan nominal integer rupiah.
   - Expiry QR ≤ order (B4).
   - Simpan transaction ID Prismalink sebagai `provider_ref`.
   - Timeout pendek, jangan retry buta. Kalau gagal, endpoint sudah membalas 503 `PAYMENT_UNAVAILABLE`.
3. **`verify_webhook`:**
   - Verifikasi signature/HMAC sesuai dokumentasi Prismalink dengan `hmac.compare_digest`, atas body mentah (`await request.body()`), bukan JSON yang sudah di-parse ulang.
   - Tolak timestamp di luar ±5 menit (anti-replay).
   - Wajib isi `amount`. Kalau ada field currency, wajib `IDR`.
   - Petakan status mereka ke `PAID`/`EXPIRED`/`FAILED`/`PENDING`.
   - Kalau Prismalink menyediakan IP allowlist, pakai juga.
4. **`check_status`:** inquiry status sebagai cadangan webhook. Aman dipanggil dari polling setelah B1.
5. **Rekonsiliasi harian:**
   - Tarik laporan settlement Prismalink, cocokkan dengan `payments` (status, nominal, `paid_at`).
   - Tampilkan selisih dan `PAID_LATE` di `/admin-pos` (sudah ada hitungan `paid_late` di list order). Admin memutuskan refund.
6. **Uji di sandbox:** webhook ganda, webhook PAID sesudah EXPIRED, nominal salah, signature salah, webhook sebelum response `create_qris` selesai (race insert payment vs webhook: ref belum ada → `ignored`, dan gateway harus retry atau polling menangkapnya).

## C. Keamanan lain

| # | Sev | Lokasi | Temuan | Rekomendasi | Status |
|---|---|---|---|---|---|
| C1 | low | `app/main.py:121-128` | `/health/db` publik mengembalikan teks exception DB ke klien (bisa memuat host pooler atau user DB). | Pesan generik, detail ke log server. | **FIXED** |
| C2 | low | `app/routers/admin_pos.py:984-994` | CSV export: nama produk, catatan, atau kategori yang diawali `= + - @` dijalankan Excel sebagai formula. | Awalan `'` untuk sel teks seperti itu. Angka tidak disentuh. Repro V8. | **FIXED** |
| C3 | low | `app/main.py:25` (`FastAPI()`) | **Live:** `/docs` dan `/openapi.json` (61 KB) publik, memetakan semua endpoint admin dan kiosk. Endpoint tetap terlindungi auth (repro H1/H2: semua 401 tanpa token/sesi). | `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` di produksi (lewat env). | BELUM |
| C4 | low | `app/admin_session.py:103-104` | Token sesi stateless. **Repro H6:** logout hanya menghapus cookie, token lama tetap valid sampai 12 jam. | Kalau laptop admin hilang: ganti `ADMIN_SESSION_SECRET` di Render (semua sesi keluar). Opsi: kolom `session_version`. | BELUM |
| C5 | medium (dev) | `app/database.py:7`, `migrations/env.py:12`, `.env` lokal | `load_dotenv(".env", override=True)`, dan `.env` lokal berisi `DATABASE_URL` **Supabase produksi**. Menjalankan `alembic`, `scripts/seed_kiosk.py`, atau `scripts/cleanup_test_data.py` tanpa `ENV_FILE=.env.local` langsung mengenai produksi, dan env shell **tidak bisa** menimpanya. | Pindahkan URL produksi keluar dari `.env` (misalnya `.env.production`), jadikan `.env` = lokal. Atau script menolak jalan ke host `supabase` tanpa flag `--prod`. | BELUM |
| C6 | info | — | Hal yang **sudah benar**: semua endpoint kiosk butuh token (fail-closed 503 kalau env kosong). Semua endpoint `/api/v1/admin/*` kecuali login/logout butuh sesi (repro H1/H2). Cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/admin` dan header CSRF `X-Admin-Request` (repro H6: 403 tanpa header). Tidak ada CORS middleware (preflight 405, same-origin saja). Semua query lewat ORM yang terparameter. Tidak ada `dangerouslySetInnerHTML`; nama produk di struk dan admin di-escape React. Token/PIN tidak ada di bundle (`grep` dist: hanya nama header). Tidak ada rahasia di git history (dicek: `.env*`, log uvicorn lama di history tidak memuat token atau URL DB). Path traversal `/kiosk/../` → 404 atau index. Upload Cloudinary: auth admin, maks 8 MB, `image/*`, dan admin-pos mengompres ke ≤400 KB. | — | OK |

## D. Race condition & lock

- **Lock ordering konsisten:** order → payment → `branch_stock` (urut `product_id`). Admin `stock_in`/`opname`/`adjust` hanya mengunci `branch_stock` dengan urutan yang sama.
  - **Repro T7:** 30 ronde × (2 `mark_paid` multi-produk dengan urutan baris dibalik + `stock_in` urutan terbalik + opname) berjalan bersamaan → **0 deadlock**.
  - **T8:** `qty` = stok awal + Σ movement untuk semua produk.
- Isolation READ COMMITTED + `FOR UPDATE` sudah cukup setelah fix B1.
- `INSERT … ON CONFLICT DO NOTHING` untuk baris stok baru aman.
- **Stok negatif** memang diizinkan (lihat A6). Laporan `low_stock` sudah menampilkannya.

## E. Idempotency

| Kasus | Hasil |
|---|---|
| Double tap "Bayar" | Dicegah UI (`paying`). Retry setelah timeout → order ganda (B3, belum). |
| Mark-paid dobel (staf + admin + webhook) | Aman. Repro T2: 5 bersamaan → 1 `sale`. Setelah B1, jalur polling juga aman. |
| Webhook dikirim ulang | Aman (PAID → no-op). Riwayat callback sekarang disimpan (B2). |
| Struk dobel | Auto-print sekali per `order.id` (`Done.tsx:13-20`). Tombol "Cetak ulang" bisa dipakai pelanggan tanpa batas (low: boros kertas). |
| Tablet reboot saat layar bayar | Order tetap `PENDING`. Staf masih bisa "Tandai lunas", lalu "Cetak struk" dari panel staf. Kalau tidak, order kedaluwarsa sendiri dalam 10 menit. |

## F. Performa & beban

| Item | Temuan | Sev |
|---|---|---|
| Polling | `/products` tiap 12 detik (1 query join), `/config` tiap 60 detik, layar bayar `GET /orders/{id}` tiap 2,5 detik (UPDATE expire + commit, lalu 4 SELECT), panel staf tiap 4 detik. Untuk 1–2 tablet, sekitar <2 query/detik, jadi aman untuk Render starter dan Supabase. | info |
| Index | Ada index untuk `orders(branch_id,status)`, `orders(created_at)`, `order_items(order_id/product_id)`, `stock_movements(branch_id,product_id / created_at / type)`, `expenses(branch_id,spent_on)`. `expire_stale_orders` memfilter `status + expires_at` tanpa index yang pas, jadi seq scan. Murah sampai puluhan ribu order. Nanti tambah partial index `WHERE status='PENDING_PAYMENT'`. Laporan (`/reports/summary`, kira-kira 10 query agregat) dibatasi 400 hari dan memakai index yang ada. | low |
| N+1 | Tidak ada. Semua list memakai `selectinload`. | OK |
| Koneksi Supabase | `pool_size=5, max_overflow=2` (`app/database.py:18-19`). Saat deploy, instance lama dan baru hidup bersamaan sehingga bisa sampai 14 koneksi, ditambah 1 koneksi alembic. Cek batas *Session pooler* di plan Supabase (default tier kecil ±15). Kalau mepet, pakai Transaction pooler (port 6543) untuk app. | medium |
| Gambar | Foto dari `/admin-pos` dikompres ≤400 KB. Foto dari admin Jinja lama di-upload apa adanya (bisa beberapa MB) dan kiosk memakai URL mentah. Sisipkan transformasi Cloudinary `f_auto,q_auto,w_400` di URL saat ditampilkan di kiosk. | low |
| Service worker | Navigasi network-first (deploy baru langsung terpakai), aset hash cache-first, `/api` tidak pernah di-cache. Jadi **tidak ada harga atau stok basi** dari SW. Cache aset tidak pernah dipangkas (tumbuh tiap deploy, kecil). Reload otomatis jam 04:00 kalau idle. | OK / low |
| Cold start | Render paid starter tidak tidur. `/health` tanpa DB. | OK |

## G. Alur end-to-end

**Pelanggan**
- Browse dengan kategori: OK. Stok turun saat keranjang terbuka → keranjang disesuaikan dan muncul toast (`App.tsx:93-99`).
- Bayar → layar QR + hitung mundur dari sisa detik server (tidak bergantung jam tablet).
- Lunas → layar sukses → print otomatis → kembali ke awal dalam 10 detik.
- Batal atau habis waktu → layar "Kalau sudah terlanjur bayar, hubungi petugas".
- Offline: katalog tampil dengan tombol bayar dikunci. Tanpa data → layar offline yang mencoba lagi sendiri.
- Idle 60 detik + 15 detik → reset.
- Habis di tengah alur → 409 `INSUFFICIENT_STOCK` → katalog di-refresh.
- Struk: waktu dalam **WIB** (`Asia/Jakarta` eksplisit di `format.ts`), nomor order `K<yymmdd WIB>-id`.

**Staf**
- Logo 5× / tahan → PIN → pending (Tandai lunas / Batalkan) dan 12 jam terakhir (Cetak struk / "Ternyata sudah bayar").
- Catatan: "Ternyata sudah bayar" untuk order yang sudah ditutup layar kiosk **tidak** mencetak otomatis; staf perlu tap "Cetak struk" sesudahnya (low, UX).

**Admin**
- Login, produk per cabang dan katalog, barang masuk, keluar/koreksi, opname (A9 sudah di-fix), transaksi + tandai lunas/batal, biaya, laporan + CSV.

**Angka laporan** (`admin_pos.py:803-935`):
- Omzet = Σ subtotal item order PAID per `paid_at` (WIB, `timezone('Asia/Jakarta', …)`). HPP = Σ `cost_price` snapshot × qty. Laba kotor = omzet − HPP. Laba bersih = laba kotor − biaya.
- Semua integer rupiah. Pembulatan hanya di persentase dan rata-rata. Konsisten antara ringkasan, harian, per produk, dan CSV.

Catatan akurasi (low/medium, BELUM):
1. HPP memakai **modal terakhir**, bukan rata-rata. Kalau harga beli naik turun, laba per periode jadi bias. Nanti pakai moving average saat `stock_in`.
2. **Stok awal** yang diinput lewat "tambah produk ke cabang" (`admin_pos.py:270-274`) tercatat sebagai `in` dengan modal, sehingga dihitung **pembelian / kas keluar** hari itu. Hari pertama akan menunjukkan kas bersih sangat negatif. Pisahkan tipe "saldo awal" atau jangan isi `unit_cost` untuk stok awal.
3. Penyusutan dari opname (`adjust` negatif) tidak mengurangi laba.
4. MDR QRIS tidak otomatis dipotong. Catat sebagai biaya "Biaya QRIS".
5. Item tanpa modal dihitung HPP 0 (sudah ditandai `missing_cost_lines`).

## H. Pipeline, deploy & rollback

- **Drift `dist`:** dicek dengan build ulang + `diff -r`, hasilnya identik. Tidak ada deteksi otomatis. Rekomendasi CI minimum (GitHub Actions, sekitar 20 baris):
  1. `npm ci && npm run build` di `kiosk-web` dan `admin-pos-web`, lalu `git diff --exit-code -- '*/dist'` (gagal kalau `dist` basi).
  2. `pip install -r requirements.txt`, lalu Postgres service, lalu `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`.
  3. `pytest` dengan tes race di laporan ini: potong stok sekali, idempotent mark-paid, PIN lockout, opname dengan `system_qty`.
- **`render.yaml`:** env kiosk dan admin lengkap. `ADMIN_SESSION_SECRET: generateValue` hanya terisi kalau service dikelola Blueprint. Kalau service dibuat manual, cek env ini ada (kalau tidak, secret diturunkan dari password; masih aman, tapi ganti password = semua sesi keluar). Yang perlu ditambah: `MIGRATION_LOCK_TIMEOUT` (opsional), dan pastikan **tidak ada** `ALLOW_MOCK_PAYMENTS` di produksi.
- **`alembic upgrade head` di build:** kalau gagal, deploy gagal dan versi lama tetap jalan (bagus). Kalau migrasi sukses tapi app baru crash, DB sudah maju. Ketiga migrasi kiosk **additive** (tabel atau kolom baru dengan default), jadi kode lama tetap jalan di skema baru.
  - **Rollback = Render "Rollback" ke deploy sebelumnya tanpa `downgrade`.**
  - `downgrade` menghapus tabel `orders`/`payments`/`stock_movements`/`expenses` beserta isinya. Jangan dijalankan di produksi setelah ada transaksi.
- **Deploy saat transaksi berjalan:** Render menunggu instance baru sehat lalu menghentikan yang lama. Request yang sedang jalan di instance lama bisa terputus. Semua perubahan stok dan order ada dalam satu transaksi DB, jadi yang terputus akan rollback utuh dan kiosk me-retry polling. Hindari deploy di jam ramai.
- **Backup:** pastikan plan Supabase punya backup harian atau PITR. Kalau tidak, jalankan `pg_dump` sebelum setiap deploy yang ada migrasinya.
- **Gitignore & rahasia:** `.env`, `.env.*` (kecuali example), `*.log`, `node_modules` sudah di-ignore. Log uvicorn lama sudah di-untrack di `c17f35e` (isinya dicek, tanpa rahasia). Limiter dan cache in-memory hanya benar untuk **satu instance**. Kalau nanti scale out, pindahkan ke Redis atau DB.

## I. Yang perlu dilakukan sekarang

1. **Review lalu commit** perubahan di working tree, termasuk `app/rate_limit.py` (file baru) dan `admin-pos-web/dist` (bundle baru `index-BSsNj8Da.js`, yang lama `index-B1IOZFsJ.js` dihapus). Setelah itu push; Render akan auto-deploy. Tidak ada migrasi baru.
2. **A1:** isi gambar QRIS asli.
3. **A6:** input stok awal semua produk.
4. **A7:** SOP cek mutasi.
5. **A8:** setup tablet (gestur, watchdog, rotasi token).
6. Tes akhir di tablet sesuai README langkah 8.
7. Sesudah pembukaan: B3, B4, C3 sampai C5, catatan akurasi laporan, dan CI minimum.
