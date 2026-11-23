import { useState } from "react";
import { formatIDR } from "../lib/format";
import { cn } from "../lib/utils";
import { IconClose } from "./Icons";

interface Props {
  name: string;
  price: number;
  qty: number;
  max: number;
  /** Stok asli. Kalau lebih besar dari max, batasnya dari aturan per barang (config.maxQtyPerItem), bukan stok. */
  stock: number;
  onSubmit: (qty: number) => void;
  onClose: () => void;
}

/**
 * Keypad angka di layar untuk mengetik jumlah barang. Kiosk tidak punya kolom ketik
 * (keyboard sentuh Windows tidak bisa dibuka di Chrome kiosk), jadi angka diketik di sini.
 * Ketukan pertama mengganti angka lama; angka di atas stok langsung dipotong ke stok maksimal.
 */
export function QtyPad({ name, price, qty, max, stock, onSubmit, onClose }: Props) {
  const byStock = stock <= max;
  const limitText = byStock ? `Stok hanya ${max}` : `Maksimal ${max} per transaksi`;
  const [value, setValue] = useState(String(qty));
  const [fresh, setFresh] = useState(true);
  const [capped, setCapped] = useState(false);
  const n = Number(value) || 0;

  const press = (k: string) => {
    if (k === "del") {
      setFresh(false);
      setCapped(false);
      return setValue((v) => v.slice(0, -1));
    }
    if (k === "ok") {
      if (n > 0) onSubmit(n);
      return;
    }
    const raw = (fresh ? "" : value) + k;
    const next = Math.min(Number(raw), max);
    setFresh(false);
    setCapped(Number(raw) > max);
    setValue(next === 0 ? "" : String(next));
  };

  return (
    <div
      className="fixed inset-0 z-[900] flex animate-[fade-in_120ms_ease-out] items-center justify-center bg-rail/60"
      role="dialog"
      aria-modal="true"
      aria-label={`Jumlah ${name}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog-panel flex w-[28rem] max-w-[92vw] animate-pop flex-col gap-4 rounded-xl bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="t-title leading-snug">{name}</h2>
            <p className="t-label mt-1 tabular-nums">
              {formatIDR(price)} / barang · {byStock ? `stok ${max}` : `maks. ${max}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="icon-btn shrink-0">
            <IconClose />
          </button>
        </div>

        <div
          className={cn(
            "flex h-20 items-center justify-center rounded-lg border-2 text-5xl font-extrabold tabular-nums",
            fresh ? "border-input text-muted-foreground" : "border-primary",
          )}
          aria-live="polite"
        >
          {value || <span className="text-lg font-semibold text-muted-foreground">Ketik jumlah</span>}
        </div>
        <p className={cn("-mt-2 text-center text-lg tabular-nums", capped ? "font-semibold text-warning" : "text-muted-foreground")}>
          {capped
            ? `${limitText}, jumlah diatur ke ${max}.`
            : n >= max
              ? `${byStock ? "Stok maksimal" : "Jumlah maksimal"} · subtotal ${formatIDR(price * n)}`
              : n > 0
                ? `Subtotal ${formatIDR(price * n)}`
                : " "}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={k === "ok" && n <= 0}
              className={cn(
                "pin-key disabled:opacity-40",
                k === "ok" && "border-primary bg-primary text-primary-foreground",
                k === "del" && "text-xl",
              )}
            >
              {k === "del" ? "Hapus" : k === "ok" ? "OK" : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
