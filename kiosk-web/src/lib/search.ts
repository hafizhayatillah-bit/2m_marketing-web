import type { Product } from "./api";

/** Huruf kecil, tanpa aksen, spasi dirapikan. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const tokens = (q: string) => normalize(q).split(" ").filter(Boolean);

/**
 * Cari produk: setiap kata yang diketik harus ada di nama atau kategori (urutan bebas,
 * jadi "5 kg beras" tetap ketemu "Beras Premium 5 kg"). Urutan hasil: nama diawali kata
 * yang diketik, lalu ada kata di nama yang diawali kata itu, lalu sisanya; yang ada stok duluan.
 */
export function searchProducts(products: Product[], query: string): Product[] {
  const qs = tokens(query);
  if (qs.length === 0) return products;
  const full = qs.join(" ");
  const first = qs[0] ?? "";
  const scored: { p: Product; rank: number }[] = [];
  for (const p of products) {
    const name = normalize(p.name);
    const hay = `${name} ${normalize(p.category)}`;
    if (!qs.every((t) => hay.includes(t))) continue;
    const words = name.split(" ");
    const rank = name.startsWith(full) ? 0 : words.some((w) => w.startsWith(first)) ? 1 : 2;
    scored.push({ p, rank });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || Number(b.p.stock > 0) - Number(a.p.stock > 0) || a.p.name.localeCompare(b.p.name, "id"))
    .map((s) => s.p);
}

/**
 * Pecah teks jadi potongan [teks, cocok?] untuk menebalkan kata yang dicari di nama produk.
 * Pencocokan per karakter setelah normalisasi, jadi panjang teks asli dan normalisasi harus sama:
 * aman untuk nama produk biasa (huruf, angka, spasi tunggal).
 */
export function highlightParts(text: string, query: string): [string, boolean][] {
  const qs = tokens(query);
  if (qs.length === 0) return [[text, false]];
  const lower = text.toLowerCase();
  const hit = new Array<boolean>(text.length).fill(false);
  for (const t of qs) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(t, from);
      if (i < 0) break;
      for (let k = i; k < i + t.length; k++) hit[k] = true;
      from = i + t.length;
    }
  }
  const parts: [string, boolean][] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    const on = hit[i] === true;
    const last = parts[parts.length - 1];
    if (last && last[1] === on) last[0] += ch;
    else parts.push([ch, on]);
  }
  return parts;
}
