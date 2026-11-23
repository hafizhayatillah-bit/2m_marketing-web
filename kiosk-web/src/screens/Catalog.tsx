import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "../lib/api";
import { maxQty, useCart } from "../lib/cart";
import { formatIDR } from "../lib/format";
import { useToast } from "../lib/toast";
import { cn } from "../lib/utils";
import { CategoryIcon, categoryTint } from "../components/category";
import { IconGrid, IconPlus } from "../components/Icons";
import { Stepper } from "../components/Stepper";
import { EmptyState, rise } from "../components/States";

// Sisa stok ditampilkan sebagai angka hanya kalau sudah sedikit.
const STOCK_NOTICE_AT = 10;

function ProductCard({ product: p, index }: { product: Product; index: number }) {
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
          <p className="line-clamp-2 text-base font-bold leading-snug">{p.name}</p>
          <p className="mt-auto pt-2 text-xl font-extrabold tabular-nums tracking-tight">{formatIDR(p.price)}</p>
        </div>
      </button>
      {qty > 0 ? (
        <Stepper className="mt-3" name={p.name} qty={qty} max={max} onChange={(n) => setQty(p.id, n)} onLimit={limitToast} />
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
  const gridRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => (category ? products.filter((p) => p.category === category) : products), [products, category]);
  // Yang masih ada stok tampil duluan.
  const sorted = useMemo(() => [...shown].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0)), [shown]);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [category]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="kiosk-scroll flex w-60 shrink-0 flex-col gap-1.5 border-r border-border p-4 xl:w-64">
        <p className="t-label px-1 pb-1">Kategori</p>
        {[undefined, ...categories].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className="chip w-full justify-start text-base capitalize"
          >
            <span className="text-xl">{c ? <CategoryIcon category={c} /> : <IconGrid />}</span>
            <span className="truncate">{c ?? "Semua"}</span>
          </button>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* pb besar supaya baris terakhir tidak tertutup tombol keranjang di kanan bawah. */}
        <div ref={gridRef} className="kiosk-scroll flex-1 p-5 pb-36">
          <div className="section-head mb-5">
            <h1 className={cn("t-title", category && "capitalize")}>{category ?? "Semua produk"}</h1>
            <span className="t-label tabular-nums">{sorted.length} produk</span>
          </div>
          {stale && (
            <p className="notice mb-4" role="status">
              Koneksi sedang terputus. Stok mungkin belum terbaru, sedang mencoba lagi…
            </p>
          )}
          {sorted.length === 0 ? (
            <EmptyState icon={<IconGrid />} title="Belum ada produk di kategori ini." />
          ) : (
            <ul className="kiosk-grid">
              {sorted.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
