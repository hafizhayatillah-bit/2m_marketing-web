import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "../lib/api";
import { maxQty, useCart } from "../lib/cart";
import { formatIDR } from "../lib/format";
import { useToast } from "../lib/toast";
import { cn } from "../lib/utils";
import { highlightParts, searchProducts } from "../lib/search";
import { CategoryIcon, categoryTint } from "../components/category";
import { IconClose, IconGrid, IconPlus, IconSearch } from "../components/Icons";
import { SearchKeyboard } from "../components/SearchKeyboard";
import { Stepper } from "../components/Stepper";
import { EmptyState, rise } from "../components/States";

// Sisa stok ditampilkan sebagai angka hanya kalau sudah sedikit.
const STOCK_NOTICE_AT = 10;
// Pencarian dibiarkan tanpa sentuhan selama ini: dikosongkan supaya pelanggan berikutnya mulai dari katalog penuh.
const SEARCH_IDLE_MS = 45_000;

function ProductName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  return (
    <>
      {highlightParts(name, query).map(([text, hit], i) =>
        hit ? (
          <mark key={i} className="search-mark">
            {text}
          </mark>
        ) : (
          <span key={i}>{text}</span>
        ),
      )}
    </>
  );
}

/** Status stok + aksi tambah/ubah jumlah, dipakai kartu grid dan baris hasil cari. */
function useProductActions(p: Product) {
  const toast = useToast();
  const qty = useCart((s) => s.lines[p.id]?.qty ?? 0);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const max = maxQty(p);
  const out = max <= 0;
  const atLimit = !out && qty >= max;
  const low = !out && p.stock <= STOCK_NOTICE_AT;
  const limitToast = () => toast("error", `Stok ${p.name} tinggal ${p.stock}.`);
  const onAdd = () => {
    if (out) return;
    if (!add(p)) limitToast();
  };
  return { qty, max, out, atLimit, low, limitToast, onAdd, setQty: (n: number) => setQty(p.id, n) };
}

/** Baris ringkas hasil cari, dipakai selama keyboard layar terbuka supaya beberapa hasil muat di atas keyboard. */
function ResultRow({ product: p, query }: { product: Product; query: string }) {
  const { qty, max, out, atLimit, low, limitToast, onAdd, setQty } = useProductActions(p);
  return (
    <li className={cn("flex items-center gap-4 px-4 py-2.5", out && "opacity-60")}>
      <button type="button" onClick={onAdd} disabled={out} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-label={`Tambah ${p.name}`}>
        <span
          className={cn(
            "flex aspect-[4/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md text-3xl",
            p.image_url ? "bg-white" : categoryTint(p.category),
          )}
        >
          {p.image_url ? <img src={p.image_url} alt="" className="size-full object-contain" /> : <CategoryIcon category={p.category} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">
            <ProductName name={p.name} query={query} />
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="text-lg font-extrabold tabular-nums">{formatIDR(p.price)}</span>
            {(out || atLimit || low) && (
              <span className={cn("pill text-xs", out ? "pill-danger" : atLimit ? "pill-info" : "pill-warning")}>
                {out ? "Habis" : atLimit ? "Stok maksimal" : `Sisa ${p.stock}`}
              </span>
            )}
          </span>
        </span>
      </button>
      {qty > 0 ? (
        <Stepper className="w-44 shrink-0" name={p.name} qty={qty} max={max} onChange={setQty} onLimit={limitToast} />
      ) : (
        <button type="button" disabled={out} onClick={onAdd} className="btn btn-secondary w-44 shrink-0">
          {out ? (
            "Stok habis"
          ) : (
            <>
              <IconPlus /> Tambah
            </>
          )}
        </button>
      )}
    </li>
  );
}

function ProductCard({ product: p, index, query = "" }: { product: Product; index: number; query?: string }) {
  const { qty, max, out, atLimit, low, limitToast, onAdd, setQty } = useProductActions(p);

  return (
    <li className={cn("product-card animate-rise", out && "opacity-60")} style={rise(index)}>
      {/* Foto + nama bisa disentuh untuk menambah, sama seperti tombol Tambah. */}
      <button type="button" onClick={onAdd} disabled={out} className="product-card-link text-left" aria-label={`Tambah ${p.name}`}>
        <div className={cn("product-card-photo text-6xl", p.image_url ? "bg-white" : categoryTint(p.category))}>
          {p.image_url ? <img src={p.image_url} alt="" loading="lazy" decoding="async" /> : <CategoryIcon category={p.category} />}
          {(out || atLimit || low) && (
            <span className={cn("pill absolute left-2 top-2 text-sm", out ? "pill-danger" : atLimit ? "pill-info" : "pill-warning")}>
              {out ? "Habis" : atLimit ? "Stok maksimal" : `Sisa ${p.stock}`}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-1 flex-col px-0.5">
          <p className="line-clamp-2 text-base font-bold leading-snug">
            <ProductName name={p.name} query={query} />
          </p>
          <p className="mt-auto pt-2 text-xl font-extrabold tabular-nums tracking-tight">{formatIDR(p.price)}</p>
        </div>
      </button>
      {qty > 0 ? (
        <Stepper className="mt-3" name={p.name} qty={qty} max={max} onChange={setQty} onLimit={limitToast} />
      ) : (
        <button type="button" disabled={out} onClick={onAdd} className="btn btn-secondary btn-block mt-3">
          {out ? (
            "Stok habis"
          ) : (
            <>
              <IconPlus /> Tambah
            </>
          )}
        </button>
      )}
    </li>
  );
}

export function Catalog({
  products,
  categories,
  stale,
}: {
  products: Product[];
  categories: string[];
  stale: boolean;
}) {
  const [category, setCategory] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0;

  // Saat mencari, kategori diabaikan: hasil dari semua produk.
  const sorted = useMemo(() => {
    if (searching) return searchProducts(products, query);
    const shown = category ? products.filter((p) => p.category === category) : products;
    // Yang masih ada stok tampil duluan.
    return [...shown].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
  }, [products, category, query, searching]);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [category, query]);

  // Pencarian ditinggal tanpa sentuhan: kosongkan (useIdle di App hanya aktif kalau keranjang terisi).
  useEffect(() => {
    if (!searching && !typing) return;
    let timer = window.setTimeout(clearSearch, SEARCH_IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(clearSearch, SEARCH_IDLE_MS);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [searching, typing]);

  function clearSearch() {
    setQuery("");
    setTyping(false);
  }

  function pickCategory(c: string | undefined) {
    clearSearch();
    setCategory(c);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="kiosk-scroll flex w-60 shrink-0 flex-col gap-1.5 border-r border-border p-4 xl:w-64">
        <p className="t-label px-1 pb-1">Kategori</p>
        {[undefined, ...categories].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => pickCategory(c)}
            aria-pressed={!searching && category === c}
            className="chip w-full justify-start text-base capitalize"
          >
            <span className="text-xl">{c ? <CategoryIcon category={c} /> : <IconGrid />}</span>
            <span className="truncate">{c ?? "Semua"}</span>
          </button>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kolom cari. Bukan <input>: kiosk memakai keyboard layar sendiri (SearchKeyboard). */}
        <div className="border-b border-border px-5 py-4">
          <div className="search-field" data-active={typing}>
            <button
              type="button"
              onClick={() => setTyping(true)}
              // Fokus ditandai oleh .search-field[data-active], jadi outline bawaan tombol tidak perlu.
              className="flex h-full min-w-0 flex-1 items-center gap-3 text-left outline-none"
              aria-label={searching ? `Pencarian: ${query}. Ketuk untuk ubah` : "Cari produk"}
            >
              <IconSearch className={cn("shrink-0 text-2xl", typing ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 truncate">
                {query ? <span className="font-semibold">{query}</span> : !typing && <span className="text-muted-foreground">Cari produk… mis. beras, minyak, gula</span>}
                {typing && <span className="search-caret" aria-hidden="true" />}
              </span>
            </button>
            {searching ? (
              <button type="button" onClick={clearSearch} className="btn btn-secondary shrink-0 gap-2" aria-label="Hapus pencarian">
                <IconClose className="text-lg" /> Hapus
              </button>
            ) : (
              !typing && (
                <span className="pill pill-primary mr-1 shrink-0 text-sm" aria-hidden="true">
                  Ketuk untuk cari
                </span>
              )
            )}
          </div>
        </div>

        {/* pb besar supaya baris terakhir tidak tertutup tombol keranjang / keyboard di bawah. */}
        <div ref={gridRef} className={cn("kiosk-scroll flex-1 p-5", typing ? "pb-[19rem]" : "pb-36")}>
          <div className="section-head mb-5">
            <h1 className={cn("t-title", !searching && category && "capitalize")}>
              {searching ? (
                <>
                  Hasil untuk “<span className="text-primary">{query.trim()}</span>”
                </>
              ) : (
                (category ?? "Semua produk")
              )}
            </h1>
            <span className="t-label tabular-nums">{sorted.length} produk</span>
          </div>
          {stale && (
            <p className="notice mb-4" role="status">
              Koneksi sedang terputus. Stok mungkin belum terbaru, sedang mencoba lagi…
            </p>
          )}
          {sorted.length === 0 ? (
            searching ? (
              <EmptyState icon={<IconSearch />} title={`Tidak ada produk “${query.trim()}”.`}>
                <p className="text-muted-foreground">Coba kata lain, misalnya jenis barang atau merek.</p>
                <button type="button" onClick={clearSearch} className="btn btn-secondary btn-lg mt-2">
                  Lihat semua produk
                </button>
              </EmptyState>
            ) : (
              <EmptyState icon={<IconGrid />} title="Belum ada produk di kategori ini." />
            )
          ) : typing && searching ? (
            <ul className="list">
              {sorted.map((p) => (
                <ResultRow key={p.id} product={p} query={query} />
              ))}
            </ul>
          ) : (
            <ul className="kiosk-grid">
              {sorted.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} query={searching ? query : ""} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {typing && <SearchKeyboard value={query} onChange={setQuery} onDone={() => setTyping(false)} resultCount={sorted.length} />}
    </div>
  );
}
