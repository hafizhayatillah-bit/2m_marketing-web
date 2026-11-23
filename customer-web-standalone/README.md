# customer-web standalone

Salinan `apps/customer-web` dari monorepo 2M, tanpa halaman/logic alamat dan akun. Design sama persis: semuanya dari `tailwind-preset.js` + font Plus Jakarta Sans.

## Jalankan

```
pnpm install
pnpm dev        # http://localhost:5171, /api diproxy ke http://localhost:3000 (ubah di vite.config.ts)
pnpm build
```

## Struktur

- `tailwind-preset.js` — design system (token warna, tipografi, kelas `btn`, `card`, `tab-bar`, dll.). Jangan diubah kalau mau tampilan sama.
- `src/app` — routing (`App.tsx`), shell header + tab bar (`Layout.tsx`), providers.
- `src/components` — ikon, state kosong/error/skeleton, stepper qty, bottom sheet, status pill.
- `src/features` — catalog, cart, checkout, orders, chat.
- `src/lib` — API client, query React Query, sinkron keranjang, stok live, store checkout, toast.
- `src/packages/shared` — salinan `@2m/shared` (tipe kontrak, `formatIDR`, label status, api client). Di-alias lewat `vite.config.ts` dan `tsconfig.json`.
- `src/packages/map` — salinan `@2m/map` (peta Leaflet), hanya dipakai `TrackingCard` di halaman pesanan.
- `DESIGN_SYSTEM.md` — aturan desain.

## Yang dibuang

Halaman login/daftar, akun, alamat (form + peta pilih pin), `lib/auth.tsx`, `RequireAuth`, query alamat.

## Titik sambung ke project induk

- **Token login:** panggil `setAccessToken(token)` dari `src/lib/api.ts` setelah user login di project induk. `setSessionLostHandler(fn)` dipanggil saat token ditolak (refresh gagal).
- **Alamat pengiriman:** panggil `useCheckout.getState().setAddressId(id)` (`src/lib/checkout.ts`) sebelum masuk `/b/:branchId/checkout`. Tanpa itu checkout menampilkan "Alamat pengiriman belum dipilih" dan tombol Bayar nonaktif.
- **Backend:** endpoint yang dipanggil ada di `src/lib/queries.ts`, `src/lib/cart.ts`, `src/lib/liveStock.ts`, dan `src/packages/shared/api-client` (base `/api/v1`, refresh token). Keranjang tersimpan di server per user, jadi backend tetap perlu mengenali user dari token.
- Kalau project induk sudah punya router/QueryClient sendiri, ambil isi `<Routes>` di `App.tsx` dan bungkus dengan `Layout` + `ToastProvider` saja.
