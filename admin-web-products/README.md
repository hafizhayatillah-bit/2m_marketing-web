# admin-web-products

Bagian produk dari `apps/admin-web` (monorepo 2M), tanpa login, akun, dan role. Design sama persis: semuanya dari `tailwind-preset.js` + font Plus Jakarta Sans.

## Jalankan

```
pnpm install
pnpm dev        # http://localhost:5173, /api diproxy ke http://localhost:3000 (ubah di vite.config.ts)
pnpm build
```

## Isi

- **Produk** (`ProductsSection.tsx`): daftar produk satu cabang. Ubah harga, stok, aktif/nonaktif, dan tambah produk dari katalog ke cabang.
- **Katalog** (`CatalogSection.tsx` + `ProductContentFields.tsx`): master SKU semua cabang. Buat/ubah SKU, foto (dikompres di browser lewat `lib/image.ts`), deskripsi, dan spesifikasi.
- `ProductsPage.tsx`: halaman dengan segmented Produk | Katalog (pengganti ConfigPage).
- `BranchProvider.tsx`: cabang yang sedang diedit. Daftar cabang diambil dari `GET /admin/branches`.
- `src/app/App.tsx`: shell admin (rail kiri + header dengan pemilih cabang), hanya satu menu: Produk.
- `src/components`: Dialog, Select, Popover, Segmented, ErrorBoundary, ikon.
- `src/packages/shared`: salinan `@2m/shared` (tipe kontrak + api client), di-alias di `vite.config.ts` dan `tsconfig.json`.
- `DESIGN_SYSTEM.md`: aturan desain.

## Yang dibuang

Login, logout, avatar, cek role `super_admin`/`branch_admin`, serta menu lain: Tracking, Kurir, Saldo, Refund, Pesan, Lokasi, Cabang.

## Titik sambung ke project induk

- **Token login:** panggil `setAccessToken(token)` dari `src/lib/api.ts`. Endpoint `/admin/*` tetap butuh token admin.
- **Admin satu cabang:** render `<BranchProvider branchId={id}>` supaya cabangnya terkunci. Tanpa prop itu, user bisa memilih dari semua cabang.
- **Katalog** mengubah data untuk semua cabang. Kalau di project induk hanya super admin yang boleh, sembunyikan tab Katalog di `ProductsPage.tsx` berdasarkan role dari project induk.
- **Endpoint** yang dipanggil (base `/api/v1`): `GET /admin/branches`, `GET|POST /admin/products`, `PATCH /admin/products/:id`, `GET /admin/products/available`, `GET|POST /admin/catalog`, `PATCH /admin/catalog/:id`, `POST /admin/catalog/image-upload-url` (presigned upload foto).
