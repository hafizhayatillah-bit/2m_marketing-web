# 2M Sembako — Trello Board Template (Revisi Final)

Cara pakai: bikin 1 List per Day di Trello, tiap bullet di bawah = 1 Card.
Checklist dalam card = checklist item di Trello. "Master Prompt" = paste ke AI/Claude (sertakan `2M-Sembako-Project-Brief.md` di awal chat sebagai konteks) buat eksekusi hari itu.

Lists tambahan yang disaranin:
- **Blocked / Waiting** → taruh card "DNS custom domain — nunggu company" di sini dari Day 1.
- **Icebox (Post-MVP)** → ide yang sengaja ditunda.

---

## Day 1 — Foundation + Deploy Pipeline + Design Kickoff

### Card 1: Setup repo + struktur folder
**Deskripsi:** Init git repo, buat struktur folder standar FastAPI project: `app/models`, `app/schemas`, `app/routers`, `app/templates`, `app/static`, `migrations/`, `tests/`, `.env.example`, `requirements.txt`. Struktur jelas dari awal penting karena Day 6-8 bakal nambah 4 entity CRUD pakai pola yang sama — folder acak-acakan bikin scaffold pattern susah konsisten.
**Definition of Done:** Repo ke-push ke GitHub, `.gitignore` exclude `.env`/`__pycache__`/`venv`, struktur folder committed.

### Card 2: Buat akun Railway/Render + Postgres managed
**Deskripsi:** Daftar akun, buat project baru, provision Postgres addon, catat connection string ke `.env` (jangan commit ke repo).
**Definition of Done:** Postgres instance jalan, connection string tersimpan sebagai env var, bisa connect via `psql` atau client lokal buat tes.

### Card 3: Deploy skeleton FastAPI ke production
**Deskripsi:** Deploy FastAPI minimal (cuma endpoint `/health` return `{"status": "ok"}`) ke Railway/Render, connect ke env vars yang udah disiapin. Ini yang paling krusial hari ini — validasi pipeline deploy SEBELUM ada 1 fitur pun, biar Day 2-10 tinggal push kode tanpa surprise infra.
**Definition of Done:** URL production bisa diakses publik, `/health` return 200, `git push` trigger auto-deploy berhasil.

### Card 4: Finalisasi skema DB + Alembic
**Deskripsi:** Define semua SQLAlchemy models sesuai skema final di brief — `users`, `branches` (+`latitude`, `longitude`, `google_drive_url`, `category_tags`), `promos`, `products` (tanpa field harga), `news`. Setup Alembic, generate migration pertama, jalankan ke Postgres production.
**Definition of Done:** Semua 5 tabel ke-create di Postgres, migration file ke-commit ke repo, `alembic upgrade head` jalan tanpa error.

### Card 5: Seed 11 cabang via script
**Deskripsi:** Buat script (`seed.py`) buat insert 11 data cabang riil: nama, alamat, kota, **latitude/longitude** (geocode manual — klik kanan lokasi di Google Maps → copy koordinat), `google_drive_url` per cabang, `whatsapp_number`, `operating_hours`, `category_tags` (kategori umum yang dijual cabang tsb, misal "Sembako, Minuman, Snack"). Data ini fix/jarang berubah, jadi langsung insert manual — gak perlu CRUD buat input pertama kali.
**Catatan:** Data alamat, koordinat, dan link G-Drive tiap cabang harus lu dapetin dari atasan/stakeholder duluan kalau belum ada di tangan lu — jangan nunggu sampai kepepet.
**Definition of Done:** 11 baris data lengkap (semua field terisi) ke-insert ke Postgres production.

### Card 6: Design system quick decisions
**Deskripsi:** Tentuin palet warna (based on brand/logo 2M Sembako kalau ada), font pairing (Google Fonts), spacing/layout grid dasar, breakpoint mobile-first. Cukup keputusan + dokumentasi singkat (misal di `design-tokens.md` atau langsung di Tailwind config) — bukan bikin mockup detail per halaman.
**Kenapa:** Biar Day 3-5 (frontend build 5 halaman) gak ada keputusan visual di tengah jalan yang bikin lambat & gak konsisten antar halaman.
**Definition of Done:** Ada catatan warna (hex code) + font family yang bakal dipakai konsisten di semua halaman.

### Card 7: Ajukan custom domain + akses DNS ke company
**Deskripsi:** Hubungi atasan/IT company buat minta akses DNS management domain company, atau minta mereka nambahin CNAME/A record sesuai instruksi Railway/Render nanti.
**Kenapa:** DNS propagation bisa makan waktu 24-48 jam, dan ini satu-satunya dependency di project ini yang di luar kendali teknis lu — kalau ditunda, bisa jadi alasan sah kenapa Day 10 telat.
**Definition of Done:** Udah dapat konfirmasi siapa pemegang akses DNS di company, dan request record record udah diajukan (walau belum selesai).

**Master Prompt (Day 1):**
> Konteks: [paste Project Brief]. Bantu gua setup FastAPI project structure + SQLAlchemy models (users, branches, promos, products, news) + Alembic migration sesuai skema di brief, lalu deploy skeleton app ke Railway/Render. Target: hari ini app kosong sudah live di production URL.

---

## Day 2 — Public API

### Card 1: Pydantic schemas — branches, promos, products, news
**Deskripsi:** Buat response models (`BranchOut`, `PromoOut`, `ProductOut`, `NewsOut`) pakai Pydantic, sesuai field di SQLAlchemy models. Pastikan `ProductOut` **tidak** punya field harga sama sekali (bukan disembunyiin di frontend doang — exclude dari schema-nya langsung).
**Definition of Done:** 4 schema ke-define, siap dipakai di endpoint, gak ada field sensitif/gak perlu yang ke-expose.

### Card 2: `GET /api/v1/public/branches`
**Deskripsi:** Return semua cabang dengan `is_active=True`, termasuk `latitude`/`longitude` (dipakai buat map di Day 5). Optional query param filter by `city`.
**Definition of Done:** Endpoint return 200 dengan list branches lengkap, tested manual via `/docs`.

### Card 3: `GET /api/v1/public/promos` (filter is_active)
**Deskripsi:** Return promo dengan `is_active=True` DAN dalam rentang `start_date`–`end_date`.
**Catatan:** Putuskan sekarang — promo yang udah lewat `end_date` otomatis ke-exclude oleh query, atau tetap butuh admin manual toggle `is_active`? Rekomendasi: auto-exclude by date di query, `is_active` cuma buat admin yang mau nonaktifin promo lebih cepat dari jadwal.
**Definition of Done:** Endpoint cuma return promo yang valid ditampilkan ke publik.

### Card 4: `GET /api/v1/public/products` (filter category, no price)
**Deskripsi:** Return produk `is_active=True`, optional query param `?category=`. Double-check response beneran gak ada field harga.
**Definition of Done:** Response bersih dari field harga, filter category berfungsi.

### Card 5: `GET /api/v1/public/news`
**Deskripsi:** Return news/event `is_active=True`, urutin by `event_date` (ascending — event yang akan datang duluan, bukan yang paling baru dibuat).
**Definition of Done:** List news terurut sesuai `event_date`.

### Card 6: Deploy + verifikasi via `/docs`
**Deskripsi:** Push kode, trigger auto-deploy, cek keempat endpoint via Swagger UI (`/docs`) yang otomatis di-generate FastAPI — gratis dari framework, gak nambah kerjaan tapi berguna banget buat demo cepat ke atasan.
**Definition of Done:** Semua 4 endpoint bisa dicoba langsung dari `/docs` di production URL.

### Card 7: Seed data dummy (promo, product, news)
**Deskripsi:** Insert beberapa data dummy realistis (3-5 promo, 5-10 produk lintas kategori, 2-3 news) — bukan lorem ipsum kosong.
**Kenapa:** Day 3-5 (build UI) jauh lebih akurat kalau ada data nyata buat direfer pas nentuin layout, bukan nebak-nebak dari data kosong.
**Definition of Done:** Data dummy ke-insert, kelihatan waktu hit endpoint public.

**Master Prompt (Day 2):**
> Konteks: [paste Project Brief]. Buatkan 4 endpoint public FastAPI (branches, promos, products, news) sesuai API contract di brief — semua read-only, sertakan Pydantic response models. Deploy dan verifikasi via /docs.

---

## Day 3 — Public Frontend: Home & Contact

### Card 1: Terapkan design system ke base layout + navigasi 5 halaman
**Deskripsi:** Implementasikan design tokens (warna, font) yang udah diputusin di Day 1 ke base layout HTML (header, footer, nav bar) yang dipakai bersama di semua 5 halaman. Bangun navigasi antar halaman (Home/Product/About Us/Contact/News) — termasuk hamburger menu buat mobile.
**Definition of Done:** Base layout ke-reuse di semua halaman publik, nav bar berfungsi di desktop & mobile, warna/font konsisten sesuai design tokens Day 1.

### Card 2: Home — hero section + highlight Promo aktif
**Deskripsi:** Bangun hero section (headline + CTA, misal "Beli via WA") dan section highlight promo yang fetch dari `/api/v1/public/promos`. Tiap card promo tampilkan `normal_price` (dicoret) vs `promo_price` + label diskon.
**Definition of Done:** Halaman Home live, promo aktif tampil otomatis dari API (bukan hardcoded di HTML), responsive di semua breakpoint.

### Card 3: Contact — info statis
**Deskripsi:** Halaman Contact menampilkan nomor WA pusat, email, dan link sosial media 2M Sembako. Sesuai asumsi di brief: **statis** (hardcoded di frontend), bukan form kirim email — hindari dependency SMTP/email service yang gak dibudgetin.
**Definition of Done:** Info kontak tampil jelas, tombol WA langsung buka chat (pakai `wa.me` link), link sosmed valid & buka di tab baru.

**Master Prompt (Day 3):**
> Konteks: [paste Project Brief]. Build halaman Home (hero + highlight promo aktif dari /api/v1/public/promos) dan Contact (info kontak statis). Sertakan base layout + navigasi ke 5 halaman (Home/Product/About Us/Contact/News). Styling Tailwind CDN, mobile-first.

---

## Day 4 — Public Frontend: Product & News

### Card 1: Product — katalog dari `/api/v1/public/products`, grouped by category, tanpa harga
**Deskripsi:** Fetch data produk dari endpoint, render grid produk yang dikelompokkan berdasarkan `category` (section per kategori). Card produk cuma nampilin nama, gambar, dan deskripsi singkat — **tanpa elemen harga sama sekali** di UI (sejalan dengan `ProductOut` yang emang gak punya field harga dari Day 2).
**Definition of Done:** Semua produk aktif tampil terkelompok per kategori, tidak ada elemen harga di mana pun di halaman ini.

### Card 2: Filter/tab by category
**Deskripsi:** Tambahkan UI filter (tab atau dropdown) yang biarin pengunjung pilih 1 kategori tertentu buat mempersempit tampilan produk. Bisa pakai query param `?category=` ke endpoint, atau filter client-side kalau volume data produk masih kecil di MVP ini.
**Definition of Done:** Pengunjung bisa switch antar kategori dan lihat produk yang sesuai; default tampilan menunjukkan semua kategori.

### Card 3: News — list event dari `/api/v1/public/news`
**Deskripsi:** Fetch data news, render list/grid card berita: judul, gambar (kalau ada), tanggal event, dan cuplikan konten. Urutkan sesuai `event_date` ascending (event terdekat tampil duluan, sesuai keputusan di Day 2 Card 5).
**Definition of Done:** Halaman News tampil, urutan sesuai tanggal event, responsive.

**Master Prompt (Day 4):**
> Konteks: [paste Project Brief]. Build halaman Product (katalog produk tanpa harga, dikelompokkan per kategori, dari endpoint /api/v1/public/products) dan halaman News (list event dari /api/v1/public/news).

---

## Day 5 — Public Frontend: About Us (Map) + Responsive Polish

### Card 1: Jam buka & alamat tiap cabang
**Deskripsi:** Fetch data dari `/api/v1/public/branches`, render list/table jam operasional dan alamat 11 cabang di halaman About Us. Opsional: kelompokkan per kota biar lebih rapi kalau jumlah cabang per kota bervariasi.
**Definition of Done:** Semua 11 cabang tampil dengan jam buka & alamat lengkap, data diambil dari API — bukan hardcoded di HTML.

### Card 2: Integrasi Leaflet.js + OpenStreetMap tiles
**Deskripsi:** Include Leaflet.js via CDN, inisialisasi map container dengan tile layer dari OpenStreetMap. Set default center & zoom yang mencakup sebaran 11 cabang (misal centroid dari semua koordinat, atau kota dengan jumlah cabang terbanyak).
**Catatan teknis:** Container map Leaflet **wajib punya height eksplisit** (misal `height: 400px` via CSS) — kalau cuma diatur lewat class Tailwind yang relatif, map sering collapse jadi 0px tinggi, terutama di mobile.
**Definition of Done:** Map ter-render dengan benar di halaman About Us, tile OSM ke-load tanpa error, terlihat proporsional di semua breakpoint.

### Card 3: Plot 11 pin sesuai latitude/longitude tiap cabang
**Deskripsi:** Loop data branches dari API, pasang Leaflet marker di tiap koordinat. Ini sekaligus jadi validasi akhir data koordinat yang di-seed Day 1 — kalau ada yang kosong/salah (misal `0,0`), akan ketahuan di sini sebelum go live, bukan pas user complain di production.
**Definition of Done:** 11 pin muncul di map sesuai lokasi masing-masing cabang, tidak ada pin yang salah posisi atau hilang.

### Card 4: Klik pin → popup link Google Drive + nomor admin
**Deskripsi:** Bind popup ke tiap marker: nama cabang, alamat singkat, link ke `google_drive_url` (buka tab baru), dan nomor WA admin cabang (pakai `wa.me` link biar bisa langsung chat, bukan cuma teks angka).
**Definition of Done:** Klik pin manapun munculin popup dengan info yang sesuai cabang tersebut; link Google Drive dan WA berfungsi dan mengarah ke tujuan yang benar.

### Card 5: Responsive polish lintas breakpoint (semua halaman)
**Deskripsi:** Review ulang seluruh 5 halaman publik (Home, Contact, Product, News, About Us) di 3 breakpoint utama: mobile (~375px), tablet (~768px), desktop (~1280px+). Perhatikan khusus: grid produk/promo harus reflow ke 1-2 kolom di layar kecil, dan map Leaflet (lihat Card 2) rawan collapse kalau belum di-handle.
**Definition of Done:** Semua 5 halaman tampil rapi tanpa elemen overflow/terpotong di 3 breakpoint yang diuji.

**Master Prompt (Day 5):**
> Konteks: [paste Project Brief]. Build halaman About Us: tampilkan jam buka & alamat 11 cabang, plus integrasi Leaflet.js + OpenStreetMap dengan pin per cabang (pakai latitude/longitude dari data branches). Klik pin harus munculin popup berisi link Google Drive dan nomor admin cabang tsb. Setelah itu, review responsive semua halaman publik yang sudah jadi.

---

## Day 6 — Auth + Admin Base + CRUD Scaffold (via Promo)
**Cards:**
- [ ] Session-based auth (passlib bcrypt untuk hash password)
- [ ] Halaman login admin + middleware protect route admin
- [ ] Base layout admin (utility-first, minim desain)
- [ ] **Bangun reusable CRUD scaffold** (generic form macro Jinja2 + generic router pattern FastAPI)
- [ ] Implementasi Promo CRUD sebagai entity pertama pakai scaffold ini

**Master Prompt:**
> Konteks: [paste Project Brief]. Implementasikan session-based auth (bukan JWT), base layout admin yang simpel. Lalu bangun 1 pola CRUD generic (reusable form component + reusable router logic di FastAPI) yang bisa dipakai ulang untuk beberapa entity. Implementasikan Promo CRUD pertama kali pakai pola ini (create/edit/delete/toggle active, validasi harga & tanggal, upload gambar ke storage).

---

## Day 7 — Branch CRUD + Product CRUD (pakai Scaffold)
**Cards:**
- [ ] Branch CRUD: form termasuk category_tags (multi-select), latitude/longitude, google_drive_url
- [ ] Product CRUD: form termasuk kategori (dari hardcoded list), tanpa field harga
- [ ] Pastikan keduanya reuse scaffold dari Day 6 (harus lebih cepat dari Promo)

**Master Prompt:**
> Konteks: [paste Project Brief]. Pakai CRUD scaffold yang udah dibangun di Day 6, implementasikan Branch CRUD (termasuk field category_tags, latitude, longitude, google_drive_url) dan Product CRUD (kategori dari hardcoded list, tanpa harga).

---

## Day 8 — News CRUD + Sync Check + Image Upload Wiring
**Cards:**
- [ ] News CRUD pakai scaffold (title, content, image, event_date)
- [ ] Wiring image upload ke Cloudflare R2/Supabase Storage buat Promo, Product, News
- [ ] Test end-to-end: edit tiap entity di admin → cek muncul benar di halaman publik terkait

**Master Prompt:**
> Konteks: [paste Project Brief]. Implementasikan News CRUD pakai scaffold. Pastikan upload gambar (Promo, Product, News) tersimpan ke [R2/Supabase Storage], bukan local disk. Test end-to-end tiap entity: perubahan di admin harus langsung kelihatan di halaman publik yang relevan.

---

## Day 9 — Hardening + Testing Minimal + Dokumentasi
**Cards:**
- [ ] Error page 404/500 yang rapi
- [ ] Logging dasar
- [ ] Edge case validation (form kosong, format salah) di semua entity
- [ ] pytest: login sukses/gagal
- [ ] pytest: create 1 entity (misal promo) via scaffold
- [ ] pytest: public endpoint filter is_active dengan benar
- [ ] README (setup lokal, env vars, cara tambah data per entity)

**Master Prompt:**
> Konteks: [paste Project Brief]. Bantu gua hardening (error pages, logging dasar, validasi edge case) dan buatkan pytest untuk critical path saja (login, create 1 entity via scaffold, filter is_active di public endpoint) — bukan full coverage, waktu terbatas. Lalu buatkan README setup lokal + env vars + cara tambah data baru per entity.

---

## Day 10 — Final Deploy + Custom Domain + Buffer
**Cards:**
- [ ] Connect custom domain company (DNS harusnya udah propagate dari request Day 1)
- [ ] Final smoke test end-to-end: 5 halaman publik + 4 module admin CRUD
- [ ] Fix bug kritis kalau ada — **JANGAN nambah fitur baru**
- [ ] Handoff notes singkat buat atasan (apa yang live, apa yang belum, apa yang di-skip sengaja)

**Master Prompt:**
> Konteks: [paste Project Brief]. Bantu gua connect custom domain ke deployment, lalu jalanin smoke test checklist end-to-end (5 halaman publik + 4 module admin) sebelum deadline. Fokus cuma fix bug kritis, tidak ada fitur baru hari ini.

---

## Blocked / Waiting
- [ ] DNS custom domain — menunggu akses dari company (mulai dari Day 1)

## Icebox (Post-MVP — jangan dikerjain sekarang)
- [ ] Multi-admin per cabang
- [ ] Produk per-item per-cabang (bukan cuma kategori tag)
- [ ] Contact form fungsional dengan email backend
- [ ] Real-time update (WebSocket/SSE)
- [ ] Analytics dashboard
- [ ] Multi-bahasa
- [ ] Kategori produk jadi admin-manageable (bukan hardcoded)
