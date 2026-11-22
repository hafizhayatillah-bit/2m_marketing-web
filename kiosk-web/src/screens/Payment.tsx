import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { config } from "../config";
import { kioskApi, NetworkError, type Order } from "../lib/api";
import { formatIDR, mmss } from "../lib/format";
import { QrCode } from "../components/QrCode";

interface Props {
  order: Order;
  onPaid: (order: Order) => void;
  /** Order batal/kedaluwarsa (oleh pelanggan, staf, atau waktu habis). */
  onClosed: (order: Order, reason: "cancelled" | "expired") => void;
}

export function Payment({ order: initial, onPaid, onClosed }: Props) {
  // Hitung mundur dari sisa detik yang dikirim server, bukan jam tablet (bisa tidak sinkron).
  const startedAt = useRef(Date.now());
  const ttl = initial.expires_in_seconds ?? 600;
  const [left, setLeft] = useState(ttl);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const done = useRef(false);

  const { data, isError, error } = useQuery({
    queryKey: ["order", initial.id],
    queryFn: () => kioskApi.order(initial.id),
    initialData: initial,
    refetchInterval: config.orderPollMs,
    refetchIntervalInBackground: true,
    retry: 2,
  });
  const order = data ?? initial;

  useEffect(() => {
    const t = setInterval(() => setLeft(ttl - (Date.now() - startedAt.current) / 1000), 500);
    return () => clearInterval(t);
  }, [ttl]);

  useEffect(() => {
    if (done.current) return;
    if (order.status === "PAID") {
      done.current = true;
      onPaid(order);
    } else if (order.status === "CANCELLED" || order.status === "EXPIRED") {
      done.current = true;
      onClosed(order, order.status === "EXPIRED" ? "expired" : "cancelled");
    }
  }, [order, onPaid, onClosed]);

  async function cancel() {
    setCancelling(true);
    try {
      const o = await kioskApi.cancelOrder(order.id);
      if (o.status === "PAID") {
        done.current = true;
        onPaid(o);
        return;
      }
      done.current = true;
      onClosed(o, "cancelled");
    } catch {
      // Kalau gagal (offline), order tetap kedaluwarsa sendiri di server; kembali ke awal saja.
      done.current = true;
      onClosed({ ...order, status: "CANCELLED" }, "cancelled");
    }
  }

  const p = order.payment;
  const manual = p?.needs_staff_confirmation ?? false;
  const offline = isError && error instanceof NetworkError;
  const timeUp = left <= 0;

  return (
    <div data-busy-screen className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28rem]">
      <section className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="rounded-xl border border-border bg-white p-5">
          <QrCode value={p?.qr_string} imageUrl={p?.qr_image_url} size={380} />
        </div>
        <p className="t-label text-base">Scan dengan aplikasi e-wallet atau m-banking yang mendukung QRIS</p>
      </section>

      <aside className="flex flex-col gap-5 border-l border-border bg-surface p-7">
        <div>
          <p className="t-label">No. order {order.order_number}</p>
          <p className="t-label mt-4">Total yang harus dibayar</p>
          <p className="t-display mt-1 tabular-nums">{formatIDR(order.total)}</p>
        </div>

        {manual ? (
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-lg">
            <li>Scan QRIS di layar.</li>
            <li>
              Masukkan nominal <b className="tabular-nums">{formatIDR(order.total)}</b> persis.
            </li>
            <li>Setelah berhasil, tunjukkan bukti bayar ke petugas.</li>
          </ol>
        ) : (
          <p className="text-lg">Layar akan berganti otomatis setelah pembayaran diterima.</p>
        )}

        <div className="panel-ink flex items-center justify-between rounded-lg p-4">
          <span className="t-label">{timeUp ? "Waktu habis" : "Sisa waktu"}</span>
          <span className="text-3xl font-extrabold tabular-nums">{mmss(left)}</span>
        </div>

        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <span className="live-dot" />
          {offline ? "Koneksi terputus, mencoba lagi…" : manual ? "Menunggu konfirmasi petugas…" : "Menunggu pembayaran…"}
        </p>

        <div className="mt-auto">
          {confirmCancel ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
              <p className="font-bold">Batalkan pesanan ini?</p>
              <p className="text-sm text-muted-foreground">Jangan batalkan kalau Anda sudah membayar.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmCancel(false)} className="btn btn-secondary btn-lg">
                  Tidak
                </button>
                <button type="button" disabled={cancelling} onClick={cancel} className="btn btn-danger btn-lg">
                  {cancelling ? "Membatalkan…" : "Ya, batalkan"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="btn btn-secondary btn-lg btn-block">
              Batalkan pesanan
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
