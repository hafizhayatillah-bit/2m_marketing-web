import { useEffect, useRef, useState } from "react";
import { config } from "../config";
import type { Order } from "../lib/api";
import { formatIDR } from "../lib/format";
import { IconAlert, IconCheck } from "../components/Icons";
import { Receipt } from "../components/Receipt";

/** Lunas: render struk, print otomatis sekali, lalu kembali ke awal. */
export function Success({ order, storeName, onDone }: { order: Order; storeName: string; onDone: () => void }) {
  const [left, setLeft] = useState(config.successReturnSeconds);
  const printed = useRef<number | null>(null);

  useEffect(() => {
    if (printed.current === order.id) return;
    printed.current = order.id;
    // Beri waktu struk ter-render ke #receipt-root sebelum print. Dengan Chrome --kiosk-printing
    // tidak ada dialog; struk langsung ke printer default (thermal).
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [order.id]);

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);

  return (
    <div data-busy-screen className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <Receipt order={order} storeName={storeName} />
      <span className="flex size-28 animate-rise items-center justify-center rounded-full bg-success-surface text-6xl text-success">
        <IconCheck />
      </span>
      <h1 className="t-display">Pembayaran berhasil</h1>
      <p className="text-xl">
        No. order <b className="tabular-nums">{order.order_number}</b> · {formatIDR(order.total)}
      </p>
      <p className="text-lg text-muted-foreground">Struk sedang dicetak. Silakan ambil barang dan struk Anda. Terima kasih!</p>
      <div className="mt-4 flex gap-4">
        <button type="button" onClick={() => window.print()} className="btn btn-secondary btn-lg">
          Cetak ulang struk
        </button>
        <button type="button" onClick={onDone} className="btn btn-primary btn-lg min-w-[14rem]">
          Selesai ({Math.max(0, left)})
        </button>
      </div>
    </div>
  );
}

export function Closed({ reason, onDone }: { reason: "cancelled" | "expired"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="flex size-24 items-center justify-center rounded-full bg-warning-surface text-5xl text-warning">
        <IconAlert />
      </span>
      <h1 className="t-headline">{reason === "expired" ? "Waktu pembayaran habis" : "Pesanan dibatalkan"}</h1>
      <p className="text-lg text-muted-foreground">
        Kalau Anda sudah terlanjur membayar, silakan hubungi petugas toko dengan menunjukkan bukti bayar.
      </p>
      <button type="button" onClick={onDone} className="btn btn-primary btn-lg mt-2 min-w-[14rem]">
        Kembali ke awal
      </button>
    </div>
  );
}
