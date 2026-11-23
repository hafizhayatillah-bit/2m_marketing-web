import { useDeferredValue, useState, type ReactNode } from "react";
import { addDays, startOfMonth, todayWIB } from "../lib/format";
import type { BranchProduct, OrderStatus } from "../lib/types";
import { IconImage, IconSearch } from "./Icons";
import { cn } from "../lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="t-headline">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 3, className = "h-14" }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("skeleton", className)} />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <p className="alert-box" role="alert">
      {error instanceof Error ? error.message : "Terjadi kesalahan"}
    </p>
  );
}

export function ProductThumb({ src, size = "size-11" }: { src: string | null; size?: string }) {
  return (
    <span className={cn("photo-tile flex shrink-0 items-center justify-center text-lg text-muted-foreground", src && "photo-tile-product", size)} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <IconImage />}
    </span>
  );
}

export function SearchField({ value, onChange, label, placeholder = "Cari nama atau SKU…", className, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="field pl-10"
        autoFocus={autoFocus}
      />
    </div>
  );
}

// ---------------------------------------------------------------- rentang tanggal

export interface DayRange {
  from: string;
  to: string;
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "month";

const PRESETS: { id: Preset; label: string; range: (today: string) => DayRange }[] = [
  { id: "today", label: "Hari ini", range: (t) => ({ from: t, to: t }) },
  { id: "yesterday", label: "Kemarin", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { id: "7d", label: "7 hari", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { id: "30d", label: "30 hari", range: (t) => ({ from: addDays(t, -29), to: t }) },
  { id: "month", label: "Bulan ini", range: (t) => ({ from: startOfMonth(t), to: t }) },
];

export const rangeOf = (id: Preset): DayRange => PRESETS.find((p) => p.id === id)!.range(todayWIB());

// Chip cepat + dua kolom tanggal. Tanggal = WIB, inklusif.
export function DateRangeFilter({ value, onChange, allowAll }: { value: DayRange | null; onChange: (r: DayRange | null) => void; allowAll?: boolean }) {
  const today = todayWIB();
  const active = value ? PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === value.from && r.to === value.to;
  })?.id : undefined;
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Rentang tanggal">
        {allowAll && (
          <button type="button" className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>
            Semua
          </button>
        )}
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={active === p.id} onClick={() => onChange(p.range(today))}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="field w-auto min-w-0 flex-1 tabular-nums xl:flex-none"
          aria-label="Dari tanggal"
          max={today}
          value={value?.from ?? ""}
          onChange={(e) => e.target.value && onChange({ from: e.target.value, to: value && value.to >= e.target.value ? value.to : e.target.value })}
        />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <input
          type="date"
          className="field w-auto min-w-0 flex-1 tabular-nums xl:flex-none"
          aria-label="Sampai tanggal"
          max={today}
          value={value?.to ?? ""}
          onChange={(e) => e.target.value && onChange({ from: value && value.from <= e.target.value ? value.from : e.target.value, to: e.target.value })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- status order

export const ORDER_STATUS: Record<OrderStatus, { label: string; pill: string }> = {
  PENDING_PAYMENT: { label: "Menunggu bayar", pill: "pill-warning" },
  PAID: { label: "Lunas", pill: "pill-success" },
  CANCELLED: { label: "Dibatalkan", pill: "pill-danger" },
  EXPIRED: { label: "Kedaluwarsa", pill: "" },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <span className={cn("pill pill-dot", s.pill)}>{s.label}</span>;
}

// ---------------------------------------------------------------- pilih produk cabang

// Daftar produk cabang yang bisa dicari, untuk form stok.
export function ProductPicker({ products, onPick, exclude = [] }: { products: BranchProduct[]; onPick: (p: BranchProduct) => void; exclude?: number[] }) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const rows = products
    .filter((p) => !exclude.includes(p.product_id))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
    .slice(0, 60);
  return (
    <div className="flex flex-col gap-3">
      <SearchField value={search} onChange={setSearch} label="Cari produk" autoFocus />
      {rows.length === 0 ? (
        <div className="empty-state">
          <p>{q ? `Tidak ada produk yang cocok dengan “${search.trim()}”.` : "Semua produk sudah ada di daftar."}</p>
        </div>
      ) : (
        <ul className="list max-h-[50dvh] overflow-y-auto">
          {rows.map((p) => (
            <li key={p.product_id}>
              <button type="button" className="list-row" onClick={() => onPick(p)}>
                <ProductThumb src={p.image_url} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p.name}</span>
                  <span className="t-label mt-0.5 block tabular-nums">
                    {p.sku ?? "tanpa SKU"} · stok {p.stock}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
