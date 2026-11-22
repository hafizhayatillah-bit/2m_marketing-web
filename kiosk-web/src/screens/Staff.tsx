import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, errorText, kioskApi, type Order } from "../lib/api";
import { formatClock, formatIDR } from "../lib/format";
import { useToast } from "../lib/toast";
import { cn } from "../lib/utils";
import { IconClose } from "../components/Icons";
import { Receipt } from "../components/Receipt";

/** Pad PIN layar sentuh. PIN hanya disimpan di memori selama panel staf terbuka. */
export function PinPad({ onSuccess, onClose }: { onSuccess: (pin: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      await kioskApi.staffLogin(value);
      onSuccess(value);
    } catch (e) {
      setError(errorText(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const press = (k: string) => {
    if (busy) return;
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (k === "ok") return pin && submit(pin);
    setPin((p) => (p.length < 8 ? p + k : p));
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-rail/60" role="dialog" aria-modal="true" aria-label="PIN staf">
      <div className="dialog-panel flex w-[26rem] max-w-[92vw] flex-col gap-4 rounded-xl bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="t-title">PIN staf</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="icon-btn">
            <IconClose />
          </button>
        </div>
        <div className="flex h-16 items-center justify-center rounded-lg border border-input text-4xl tracking-[0.5em]">
          {pin.replace(/./g, "•") || <span className="text-base tracking-normal text-muted-foreground">Masukkan PIN</span>}
        </div>
        {error && <p className="font-semibold text-destructive">{error}</p>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className={cn("pin-key", k === "ok" && "border-primary bg-primary text-primary-foreground", k === "del" && "text-xl")}
            >
              {k === "del" ? "Hapus" : k === "ok" ? (busy ? "…" : "OK") : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  PENDING_PAYMENT: "pill-warning",
  PAID: "pill-info",
  CANCELLED: "pill-danger",
  EXPIRED: "pill-danger",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Menunggu bayar",
  PAID: "Lunas",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
};

function OrderRow({ order, actions }: { order: Order; actions: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-3 text-lg font-extrabold tabular-nums">
          {order.order_number}
          <span className={cn("pill", STATUS_PILL[order.status])}>{STATUS_LABEL[order.status] ?? order.status}</span>
        </p>
        <p className="t-label mt-1">
          {formatClock(order.created_at)} · {order.items.reduce((n, i) => n + i.qty, 0)} barang ·{" "}
          {order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
        </p>
      </div>
      <p className="text-xl font-extrabold tabular-nums">{formatIDR(order.total)}</p>
      <div className="flex gap-2">{actions}</div>
    </li>
  );
}

export function StaffPanel({ pin, storeName, onClose }: { pin: string; storeName: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{ order: Order; action: "paid" | "cancel" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reprint, setReprint] = useState<Order | null>(null);
  const { data, isError, refetch } = useQuery({
    queryKey: ["staff-orders"],
    queryFn: () => kioskApi.staffOrders(pin),
    refetchInterval: 4000,
  });

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      const o =
        confirm.action === "paid" ? await kioskApi.staffMarkPaid(pin, confirm.order.id) : await kioskApi.staffCancel(pin, confirm.order.id);
      toast("success", `${o.order_number}: ${STATUS_LABEL[o.status] ?? o.status}`);
      void qc.invalidateQueries({ queryKey: ["order", o.id] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : errorText(e));
    } finally {
      setBusy(false);
      setConfirm(null);
      void refetch();
    }
  }

  function printAgain(o: Order) {
    setReprint(o);
    setTimeout(() => window.print(), 300);
  }

  return (
    <div className="fixed inset-0 z-[800] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Panel staf">
      {reprint && <Receipt order={reprint} storeName={storeName} />}
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <span className="pill pill-primary">Mode staf</span>
        <h1 className="t-title">Konfirmasi pembayaran QRIS</h1>
        <button type="button" onClick={onClose} className="btn btn-secondary btn-lg ml-auto">
          <IconClose /> Tutup
        </button>
      </header>
      <div className="kiosk-scroll flex flex-1 flex-col gap-6 p-6">
        {isError && <p className="alert-box">Gagal memuat order. Cek koneksi.</p>}
        <section className="flex flex-col gap-3">
          <div className="section-head">
            <h2 className="t-title">Menunggu pembayaran</h2>
            <span className="t-label tabular-nums">{data?.pending.length ?? 0}</span>
          </div>
          <p className="text-muted-foreground">
            Cek mutasi masuk di aplikasi merchant QRIS. Tandai lunas hanya kalau nominal sudah benar-benar masuk.
          </p>
          {data && data.pending.length === 0 && <p className="card text-muted-foreground">Tidak ada order yang menunggu.</p>}
          {data && data.pending.length > 0 && (
            <ul className="list">
              {data.pending.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  actions={
                    <>
                      <button type="button" onClick={() => setConfirm({ order: o, action: "cancel" })} className="btn btn-danger-quiet btn-lg">
                        Batalkan
                      </button>
                      <button type="button" onClick={() => setConfirm({ order: o, action: "paid" })} className="btn btn-primary btn-lg">
                        Tandai lunas
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <div className="section-head">
            <h2 className="t-title">Terakhir (12 jam)</h2>
          </div>
          {data && data.recent.length > 0 ? (
            <ul className="list">
              {data.recent.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  actions={
                    o.status === "PAID" ? (
                      <button type="button" onClick={() => printAgain(o)} className="btn btn-secondary btn-lg">
                        Cetak struk
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirm({ order: o, action: "paid" })} className="btn btn-secondary btn-lg">
                        Ternyata sudah bayar
                      </button>
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="card text-muted-foreground">Belum ada.</p>
          )}
        </section>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[850] flex items-center justify-center bg-rail/60">
          <div className="dialog-panel flex w-[30rem] max-w-[92vw] flex-col gap-4 rounded-xl bg-surface p-6">
            <h2 className="t-title">{confirm.action === "paid" ? "Tandai lunas?" : "Batalkan order?"}</h2>
            <p className="text-lg">
              {confirm.order.order_number} · <b>{formatIDR(confirm.order.total)}</b>
            </p>
            {confirm.action === "paid" && (
              <p className="text-muted-foreground">Stok akan dipotong dan struk tercetak di kiosk. Tidak bisa dibatalkan.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirm(null)} className="btn btn-secondary btn-lg">
                Kembali
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className={cn("btn btn-lg", confirm.action === "paid" ? "btn-primary" : "btn-danger")}
              >
                {busy ? "Memproses…" : confirm.action === "paid" ? "Ya, lunas" : "Ya, batalkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
