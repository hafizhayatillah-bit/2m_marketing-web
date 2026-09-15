# Laporan Eksekusi: Rework Frontend Publik ke Static HTML + Tailwind Standalone CLI

**Tanggal:** 2026-09-11
**Proyek:** 2M Sembako (FastAPI backend read-only + frontend publik 5 halaman)

## Ringkasan

Frontend publik lama (`app/templates/*.html`, Jinja2 + Tailwind CDN, 1 font, warna generik biru/slate) di-rework total menjadi static HTML + Tailwind CSS standalone CLI (tanpa Node.js/npm) + vanilla JS, sesuai design token final di [docs/design-system.md](../docs/design-system.md). `app/templates/admin/` (CRUD promo) **tidak disentuh**. API publik (`/api/v1/public/...`) **tidak diubah** — hanya cara halaman disajikan (routing) yang menyesuaikan.

Dikerjakan bertahap dalam 3 "card":
1. Tooling + base layout (header/footer/nav) untuk 5 halaman.
2. Home — hero section + promo aktif (fetch API).
3. Contact — info kontak statis + single source of truth nomor WA.

Ditutup dengan sesi preview manual di browser yang menemukan 1 bug kecil (fallback gambar hero), langsung diperbaiki.

## Status: Selesai (untuk scope 3 card di atas)

Halaman `product.html`, `about.html`, `news.html` baru berisi placeholder heading — kontennya scope card berikutnya (Day 4 & Day 5 di Trello board), sesuai instruksi awal agar tidak mendahului keputusan/konten yang belum di-brief.

## 1. Setup Tooling Tailwind (Standalone, Tanpa Node.js)

- Download binary CLI resmi dari GitHub Releases `tailwindlabs/tailwindcss`, disimpan di `tools/tailwindcss.exe`, gitignored (± 107 MB, OS-specific). Cara fetch ulang didokumentasikan di [tools/README.md](../tools/README.md).
- **Catatan penting:** rilis terbaru saat ini adalah **v4.3.3**, tapi v4 defaultnya pakai CSS-first config (`@theme` di CSS), bukan `tailwind.config.js` + `theme.extend` seperti yang diminta. Supaya sesuai workflow yang diminta, dipakai **v3.4.17** (rilis v3 terakhir) — bukan versi terbaru, tapi ini pilihan yang disengaja.
- [tailwind.config.js](../tailwind.config.js) — token warna & font sesuai brand palette (`primary #0766AD`, `secondary #29ADB2`, `accent #C5E898`, `surface`, `canvas`, `ink`, `ink-muted`; `font-display` = Poppins, `font-body` = Inter).
- [src/input.css](../src/input.css) — 3 baris `@tailwind` standar.
- [build_css.py](../build_css.py) — wrapper `subprocess.run()`, pilih binary `.exe`/non-`.exe` otomatis berdasarkan `platform.system()`, dukung flag `--watch`.
- Output: [assets/css/output.css](../assets/css/output.css) — hasil build, **jangan diedit manual**, ukuran purged ~8–10 KB (bukan default Tailwind ~3MB+).

## 2. Struktur Frontend Baru

```
tailwind.config.js
build_css.py
src/input.css
assets/css/output.css      (hasil build)
assets/js/config.js        (single source of truth WA_NUMBER)
assets/js/partials.js      (inject header/footer, nav active state, mobile menu, WA link resolver)
assets/js/home.js          (fetch promo aktif, render card, hero image fallback)
partials/header.html
partials/footer.html
index.html / product.html / about.html / contact.html / news.html
```

Kelima halaman HTML sekarang **static file di root project**, bukan Jinja2 template lagi.

## 3. Penyesuaian Backend (Routing Saja, Bukan API)

- [app/routers/pages.py](../app/routers/pages.py) — diganti dari `Jinja2Templates.TemplateResponse` menjadi `FileResponse` yang menunjuk ke file HTML statis di root project. Ditambahkan route `/about` (sebelumnya belum ada). Route `/products` → `/product` (menyesuaikan nama file baru, singular, sesuai daftar file yang diminta).
- [app/main.py](../app/main.py) — tambah `app.mount("/assets", ...)` dan `app.mount("/partials", ...)` (`StaticFiles`) supaya browser bisa fetch CSS/JS/partial HTML. Router API publik (`branches`, `promos`, `products`, `news`) dan `admin_promo` **tidak diubah**.

## 4. Card 1 — Base Layout & Navigasi (header/footer, 5 halaman)

- **Header** ([partials/header.html](../partials/header.html)): sticky (`sticky top-0 z-50 bg-surface shadow-sm`), logo `font-display`, nav desktop `≥768px` (Home/Product/About Us/Contact/News), CTA "Chat via WA" (`bg-primary rounded-full`, icon `lucide:message-circle`), hamburger mobile (`lucide:menu` ↔ `lucide:x`).
- **Footer** ([partials/footer.html](../partials/footer.html)): `bg-ink`, `border-t-4 border-accent`, logo + copyright + nav ringkas. Sengaja tanpa detail kontak lengkap (scope Card 3).
- **Nav active state**: `<body data-page="...">` dicocokkan ke `[data-nav-link]` oleh [assets/js/partials.js](../assets/js/partials.js), bukan hardcode per halaman.
- Larangan global (cart, login, search bar, harga produk, order toggle) **tidak ada** di manapun — sesuai [docs/design-system.md](../docs/design-system.md).

## 5. Card 2 — Home: Hero & Promo Aktif

File: [index.html](../index.html), [assets/js/home.js](../assets/js/home.js).

- **Hero**: split-grid, mobile `order-2`/`order-1` (teks di bawah, gambar di atas), headline `text-4xl md:text-6xl` dengan 1 kata aksen `text-primary`, CTA WA bergaya sama seperti CTA nav.
- **Promo**: fetch `GET /api/v1/public/promos` saat `DOMContentLoaded`, grid `1/2/3` kolom responsif. Tiap card: `image_url` fallback ke ikon placeholder kalau `null`, harga normal dicoret + harga promo, badge diskon dihitung di client (`Math.round((1 - promo_price/normal_price) * 100)`) dengan guard `normal_price === 0` supaya tidak `NaN%`. `loading="lazy"` di semua `<img>`.
- **State handling wajib**: `#promo-loading` / `#promo-empty` / `#promo-error` / `#promo-grid` — tidak pernah section kosong tanpa keterangan, tidak ada spinner macet kalau fetch gagal.
- **Keamanan**: semua teks dari API (`title`, `description`, `image_url`) di-escape via `escapeHtml()` sebelum di-render lewat `innerHTML`, mencegah stored-XSS kalau data promo dari admin suatu saat mengandung markup.
- **Catatan CORS**: karena halaman & API disajikan dari FastAPI app yang sama (same-origin), fetch jalan tanpa perlu `CORSMiddleware` — bukan blocker seperti yang awalnya dikhawatirkan.

## 6. Card 3 — Contact: Single Source of Truth Nomor WA + Sosial Media

File: [assets/js/config.js](../assets/js/config.js) (baru), [contact.html](../contact.html), plus penyesuaian di [partials/header.html](../partials/header.html), [index.html](../index.html), `product.html`, `about.html`, `news.html`.

- `assets/js/config.js` berisi **satu baris**: `const WA_NUMBER = "62XXXXXXXXXX";` — satu-satunya tempat nomor WA di-hardcode di seluruh repo (diverifikasi via grep).
- Semua elemen link WA (CTA nav header, CTA hero home, CTA contact) memakai atribut `data-wa-link` dengan `href="https://wa.me/"` sebagai fallback aman (bukan `href="#"` kosong), lalu `applyWaLinks()` di `partials.js` mengisi nomor asli dari `WA_NUMBER` setelah partial ter-inject.
- `config.js` di-load di **semua 5 halaman** (bukan cuma index & contact) karena header (berisi CTA WA) tampil di semua halaman — kalau tidak, CTA di `product`/`about`/`news` akan rusak (nomor kosong).
- **Contact page**: heading "Hubungi Kami", CTA WA besar (`target="_blank" rel="noopener noreferrer"`), Instagram (`https://www.instagram.com/2msembako/`, query param tracking dibuang, `rel="noopener noreferrer"`), TikTok sebagai `<span class="opacity-50 pointer-events-none">` (bukan `href="#"`) karena link asli belum ada.
- **Sengaja tidak ada**: field email/mailto, `<form>`, dependency SMTP — dikonfirmasi via grep, tidak ada di manapun pada halaman ini.

## 7. Bug Ditemukan Saat Preview Manual & Fix

Saat preview di browser (`http://127.0.0.1:8000/`), gambar hero (`assets/img/hero-produk.jpg`, file belum ada — asset final belum tersedia) muncul sebagai **ikon broken-image**, bukan placeholder `bg-canvas` yang mulus.

**Root cause:** listener `error` di `setupHeroImageFallback()` (`assets/js/home.js`) baru dipasang saat `DOMContentLoaded`. Karena request gambar 404 di localhost sangat cepat, event `error` sudah keburu terjadi & "terlewat" sebelum listener sempat attach.

**Fix:** tambahkan pengecekan langsung setelah listener dipasang:

```js
heroImage.addEventListener("error", () => heroImage.classList.add("hidden"), { once: true });
// image mungkin sudah gagal load sebelum listener ini attach
if (heroImage.complete && heroImage.naturalWidth === 0) {
  heroImage.classList.add("hidden");
}
```

Diverifikasi ulang via browser preview — placeholder `bg-canvas` tampil bersih tanpa ikon broken-image.

## 8. Validasi

Dijalankan `python -m uvicorn app.main:app` lokal + curl/browser check untuk tiap perubahan:

| Endpoint / Halaman | Hasil |
|---|---|
| `GET /`, `/product`, `/about`, `/contact`, `/news` | 200 OK, HTML ter-render |
| `GET /partials/header.html`, `/partials/footer.html` | 200 OK |
| `GET /assets/css/output.css` | 200 OK, `text/css` |
| `GET /assets/js/{config,partials,home}.js` | 200 OK |
| `GET /api/v1/public/branches`, `/promos` | 200 OK, tidak terpengaruh (API asli) |
| `GET /health` | 200 OK |
| Grep repo untuk literal `62XXXXXXXXXX` | Hanya muncul di `assets/js/config.js` |
| Preview visual browser (Home, Contact) | Sesuai desain, bug hero image fallback ditemukan & diperbaiki |

## 9. Open Items (Belum Selesai, Sengaja Ditunda)

- **Nomor WA masih placeholder** (`62XXXXXXXXXX`) — nunggu keputusan "WA cabang mana" dari brief awal. Update cukup 1 baris di `assets/js/config.js`.
- **Link TikTok belum ada** — markup sudah siap ditukar jadi `<a href="...">` begitu link asli tersedia.
- **Asset foto hero belum ada** (`assets/img/hero-produk.jpg`) — saat ini fallback ke placeholder `bg-canvas`, tinggal taruh file asli di path tsb begitu tersedia.
- **Konten `product.html`, `about.html`, `news.html`** — masih placeholder heading, menyusul di card terpisah (Day 4 & Day 5: katalog produk tanpa harga, peta 11 cabang via Leaflet, list news).

## File yang Diubah/Dibuat

**Dihapus:** `app/templates/{base,index,products,news,contact}.html` (folder `app/templates/admin/` tetap ada).

**Baru:**
- `tools/tailwindcss.exe` (gitignored) + `tools/README.md`
- `tailwind.config.js`, `src/input.css`, `build_css.py`, `assets/css/output.css`
- `partials/header.html`, `partials/footer.html`
- `assets/js/partials.js`, `assets/js/home.js`, `assets/js/config.js`
- `index.html`, `product.html`, `about.html`, `contact.html`, `news.html`
- `.gitignore` — tambah entry `tools/tailwindcss` / `tools/tailwindcss.exe`

**Diubah:**
- `app/main.py` — mount `/assets` dan `/partials` sebagai `StaticFiles`.
- `app/routers/pages.py` — `Jinja2Templates` → `FileResponse` ke static HTML, tambah route `/about`, `/products` → `/product`.
