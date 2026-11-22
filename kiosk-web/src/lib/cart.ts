import { create } from "zustand";
import { config } from "../config";
import type { Product } from "./api";

export interface CartLine {
  product: Product;
  qty: number;
}

export interface Adjustment {
  name: string;
  from: number;
  to: number;
}

interface CartState {
  lines: Record<number, CartLine>;
  /** Tambah 1 (atau n). Mengembalikan false kalau sudah mentok stok. */
  add: (p: Product, n?: number) => boolean;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  /** Sesuaikan keranjang dengan stok terbaru. Mengembalikan daftar barang yang dikurangi/dihapus. */
  reconcile: (products: Product[]) => Adjustment[];
}

export const maxQty = (p: Product) => Math.max(0, Math.min(p.stock, config.maxQtyPerItem));

export const useCart = create<CartState>((set, get) => ({
  lines: {},
  add: (p, n = 1) => {
    const current = get().lines[p.id]?.qty ?? 0;
    const next = Math.min(current + n, maxQty(p));
    if (next <= current) return false;
    set((s) => ({ lines: { ...s.lines, [p.id]: { product: p, qty: next } } }));
    return true;
  },
  setQty: (productId, qty) =>
    set((s) => {
      const line = s.lines[productId];
      if (!line) return s;
      const lines = { ...s.lines };
      const capped = Math.min(qty, maxQty(line.product));
      if (capped <= 0) delete lines[productId];
      else lines[productId] = { ...line, qty: capped };
      return { lines };
    }),
  clear: () => set({ lines: {} }),
  reconcile: (products) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const adjustments: Adjustment[] = [];
    const lines: Record<number, CartLine> = {};
    let changed = false;
    for (const line of Object.values(get().lines)) {
      const fresh = byId.get(line.product.id);
      const cap = fresh ? maxQty(fresh) : 0;
      const qty = Math.min(line.qty, cap);
      if (qty !== line.qty) adjustments.push({ name: line.product.name, from: line.qty, to: qty });
      if (qty > 0 && fresh) {
        lines[fresh.id] = { product: fresh, qty };
        if (fresh !== line.product) changed = true;
      }
      if (qty !== line.qty) changed = true;
    }
    if (changed) set({ lines });
    return adjustments;
  },
}));

export function cartSummary(lines: Record<number, CartLine>) {
  const list = Object.values(lines);
  return {
    list,
    count: list.reduce((n, l) => n + l.qty, 0),
    total: list.reduce((n, l) => n + l.qty * l.product.price, 0),
  };
}
