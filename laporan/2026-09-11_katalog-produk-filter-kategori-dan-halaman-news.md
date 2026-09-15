# Laporan Eksekusi: Katalog Produk (Grouping + Filter Kategori) & Halaman News/Event

**Tanggal:** 2026-09-11
**Proyek:** 2M Sembako (frontend publik, konsumsi API read-only yang sudah ada)

## Ringkasan

Tiga eksekusi berurutan yang mengisi konten dinamis `product.html` dan `news.html` (sebelumnya baru placeholder heading), murni frontend — **tidak ada perubahan backend/API** sama sekali di ketiga eksekusi ini. Referensi visual `generated-page.html` dipakai **hanya untuk bentuk komponen** (rounded shape, shadow, hover-lift, image aspect treatment), warna/font/teks tetap mengikuti [docs/design-system.md](../docs/design-system.md) — sesuai batasan eksplisit dari brief tiap card.

## Status: Selesai untuk ketiga scope

1. Card — Katalog Produk: grouping per kategori dari satu fetch.
2. Card — Filter tab kategori, client-side, tanpa refetch.
3. Card — News/Event: grid + safeguard tanggal sementara.

## 1. Klarifikasi Reference File Sebelum Eksekusi (Card 1)

Brief menyebut `/reference/generated-page.html`, tapi path itu tidak ada di repo. Yang ada hanya `generated-page.html` di root, isinya template generik "Brunish Grocery" dengan warna (`#C8102E`/`#101820`) dan font (Oswald/Open Sans) berbeda dari design system, dan mengandung elemen yang eksplisit dilarang (tombol cart/"Start Order", "Sign In") oleh `LARANGAN GLOBAL` di `docs/design-system.md`.

Dikonfirmasi ke user sebelum eksekusi lanjut — keputusan: pakai file itu, tapi **hanya ambil pola shape/spacing/hover/card-treatment**, abaikan warna/font/teks/fitur yang sudah ditolak.

## 2. Card — product.html: Grouping per Kategori

**File:** [product.html](../product.html), [assets/js/product.js](../assets/js/product.js) (baru).

- Fetch `GET /api/v1/public/products` **sekali** saat `DOMContentLoaded`; grouping per `category` dilakukan in-memory pakai `Map` (bukan multi-request per kategori).
- Urutan section kategori mengikuti urutan kemunculan pertama di response API (bukan alfabetis).
- Kategori tanpa produk aktif otomatis tidak muncul (hasil filter `is_active` sudah dilakukan backend, grouping cuma menyusun apa yang datang).
- Card produk: `image_url` fallback ke ikon placeholder (`lucide:image`) kalau `null`, `loading="lazy"`, `name`, `description` (kalau `null` elemen disembunyikan total — tidak ada string `"null"` atau paragraf kosong). **Tidak ada** harga/tombol beli/keranjang/badge diskon di manapun pada card ini.
- State handling: `#product-loading` / `#product-empty` / `#product-error` / `#product-categories` — pola sama seperti `home.js` (Card promo Day 3), tidak pernah blank page atau spinner macet.
- Shape-language card dipinjam dari `generated-page.html` (departments grid): `rounded-2xl`, `border border-ink/10`, `shadow-sm hover:shadow-md hover:-translate-y-1`, image `group-hover:scale-105 transition-transform duration-500` — warna & font tetap token proyek (`bg-surface`, `text-ink`, `font-display`, dst).

**Verifikasi:** di-seed 1 produk test (prefix `TEST -`) via script Python inline, dicek render grid via browser (screenshot + accessibility snapshot), lalu dibersihkan via [scripts/cleanup_test_data.py](../scripts/cleanup_test_data.py). Juga divalidasi kondisi `[]` (API kosong) menampilkan pesan statis, bukan halaman blank.

## 3. Card — Filter Kategori (Tab Pill, Client-Side)

**File:** [product.html](../product.html) (tambah container filter), [assets/js/product.js](../assets/js/product.js) (diperluas), [src/input.css](../src/input.css) (tambah utility).

- **Tidak ada endpoint `/categories`** di backend — daftar kategori diambil dari hasil fetch produk yang sama (Card 1), bukan fetch tambahan: `extractCategoryOrder()` mengambil kategori unik urut kemunculan pertama.
- Tab `"Semua"` (default aktif) + satu tab per kategori, di-render sebagai pill `rounded-full` horizontal-scroll (`overflow-x-auto no-scrollbar`).
- Klik tab → filter `allProducts` di memori (tidak fetch ulang), toggle 1 tab aktif dalam satu waktu via `updateTabStyles()`.
- Styling token dari `design-system.md`, bukan warna reference file: aktif `bg-primary text-white`, nonaktif `bg-surface text-ink-muted border border-canvas hover:text-primary`.
- `.no-scrollbar` (murni utility CSS penyembunyi scrollbar, tanpa konten/brand apa pun) ditambahkan ke `src/input.css` via `@layer utilities` — satu-satunya bagian yang benar-benar disalin dari `generated-page.html`, sesuai izin eksplisit di brief.
- **Tidak mengubah URL/query param** (`?category=`) — murni in-memory, sesuai scope MVP.

**Verifikasi:** di-seed 3 produk test (2 kategori) via script Python, dicek via `read_page`/`run_playwright_code`: tab render otomatis sesuai data (bukan hardcoded), klik tab kategori spesifik memfilter grid dengan benar (hanya section kategori itu yang tampil), class aktif/nonaktif berpindah sesuai tab yang diklik, tidak ada request fetch tambahan. Dibersihkan setelahnya via cleanup script.

*Catatan teknis:* klik native (`click_element`) sempat timeout karena isu actionability di lingkungan browser-tool ini (bukan bug di kode) — diverifikasi ulang via `run_playwright_code` (`element.click()`/`form.requestSubmit()` langsung lewat `page.evaluate`), hasil konsisten dengan interaksi manual.

## 4. Card — news.html: Grid Event + Safeguard Tanggal

**File:** [news.html](../news.html), [assets/js/news.js](../assets/js/news.js) (baru).

- Fetch `GET /api/v1/public/news` sekali saat `DOMContentLoaded`.
- ⚠️ **Safeguard sementara** (ditandai `TODO-REWRITE-PENDING-STAKEHOLDER` di kode): backend sort `event_date` ascending **tanpa filter tanggal**, jadi event yang sudah lewat tapi `is_active=true` bisa nongol paling atas. Sambil menunggu keputusan final stakeholder, di-filter client-side: `data.filter(n => n.event_date >= today)`. Baris ini satu baris, gampang dicabut/diubah kalau keputusan akhirnya "tampilkan juga event lama sebagai arsip".
- Format tanggal ke Bahasa Indonesia: `Intl.DateTimeFormat('id-ID', {day, month: 'long', year})`, parsing pakai suffix `T00:00:00` supaya tidak kena geser timezone saat parse string date-only.
- `content` dipotong ~120 karakter + `"..."`, potong di spasi terdekat sebelum limit (bukan tengah kata).
- `image_url` null → placeholder ikon (`lucide:image`), bukan broken-image icon browser default.
- **Tidak ada** tombol/link ke halaman detail per-item (tidak ada endpoint `GET /news/{id}`).
- Empty state: array kosong dari API **dan** semua event ke-filter oleh safeguard menghasilkan tampilan yang identik ke user ("Belum ada event/berita terbaru saat ini") — tidak ada beda UX antara dua penyebab itu.

**Verifikasi:** di-seed 3 berita test (1 event lewat, 1 konten panjang, 1 tanpa gambar) via script Python, dicek via `read_page`: event lewat berhasil ke-filter (tidak muncul), tanggal ter-format Indonesia, konten panjang terpotong rapi di batas kata, placeholder ikon tampil untuk item tanpa gambar. Dibersihkan via cleanup script.

## 5. Validasi Keseluruhan

| Item | Hasil |
|---|---|
| `GET /product`, `/news` | 200 OK, render dinamis dari API |
| `python build_css.py` (setiap perubahan class Tailwind baru) | Sukses, `assets/css/output.css` ter-rebuild |
| Empty state (`[]` dari API) | Pesan statis tampil, bukan blank |
| Error state (simulasi fetch gagal) | Pesan singkat, bukan spinner tak berhenti |
| Data test (`TEST -` prefix) | Selalu dibersihkan via `cleanup_test_data.py` setelah tiap sesi verifikasi |

## 6. Open Items

- Backend TODO `event_date` sort ascending tanpa filter tanggal — keputusan final stakeholder masih pending (lihat komentar TODO di [app/routers/news.py](../app/routers/news.py) dan safeguard sementara di `assets/js/news.js`).
- Kategori produk masih kolom `String` bebas (bukan enum) — potensi typo bikin kategori "kepisah" secara tidak sengaja di halaman publik; sudah dimitigasi sebagian lewat `<datalist>` saran kategori di form admin (lihat laporan admin CMS terpisah).

## File yang Diubah/Dibuat

**Baru:**
- `assets/js/product.js`
- `assets/js/news.js`

**Diubah:**
- `product.html` — state loading/empty/error + container kategori dinamis + container filter tab.
- `news.html` — state loading/empty/error + grid berita.
- `src/input.css` — tambah utility `.no-scrollbar`.
- `assets/css/output.css` — hasil rebuild (`python build_css.py`).
