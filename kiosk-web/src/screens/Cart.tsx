import { useEffect } from "react";
import { cartSummary, maxQty, useCart } from "../lib/cart";
import { formatIDR } from "../lib/format";
import { useToast } from "../lib/toast";
import { cn } from "../lib/utils";
import { CategoryIcon, categoryTint } from "../components/category";
import { IconBack, IconCart, IconTrash } from "../components/Icons";
import { Stepper } from "../components/Stepper";
import { EmptyState, rise } from "../components/States";

/** Baris uang, sama seperti MoneyRow di customer-web. */
function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Tombol keranjang mengambang di kanan bawah layar: jumlah barang + total. */
export function CartButton({ onOpen }: { onOpen: () => void }) {
  const lines = useCart((s) => s.lines);
  const { count, total } = cartSummary(lines);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Keranjang, ${count} barang, total ${formatIDR(total)}`}
      // key = count: animasi "bump" setiap jumlah berubah, tanda barang masuk.
      key={count}
      className={cn(
        "fixed bottom-6 right-6 z-[700] flex min-h-[5.5rem] items-center gap-4 rounded-2xl py-3 pl-4 pr-7 text-left shadow-[0_12px_32px_hsl(var(--shadow-tint)/0.28)] transition-transform active:scale-[0.97]",
        count > 0 ? "cart-bump bg-primary text-primary-foreground" : "border border-border bg-surface text-foreground",
      )}
    >
      <span className="relative flex size-14 items-center justify-center rounded-xl bg-white/15 text-3xl">
        <IconCart />
        {count > 0 && (
          <span className="absolute -right-2.5 -top-2.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-promo px-2 text-base font-extrabold tabular-nums text-white ring-[3px] ring-primary">
            {count}
          </span>
        )}
      </span>
      <span className="flex flex-col leading-tight">
        <span className={cn("text-sm font-semibold", count > 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {count > 0 ? `Keranjang · ${count} barang` : "Keranjang kosong"}
        </span>
        <span className="text-2xl font-extrabold tabular-nums tracking-tight">{formatIDR(total)}</span>
      </span>
    </button>
  );
}

export function CartOverlay({
  onClose,
  onPay,
  paying,
  offline,
}: {
  onClose: () => void;
  onPay: () => void;
  paying: boolean;
  offline: boolean;
}) {
  const toast = useToast();
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const { list, count, total } = cartSummary(lines);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[750] flex animate-[fade-in_160ms_ease-out] items-center justify-center bg-rail/55 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-title"
      // Sentuh area gelap di luar panel = tutup.
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog-panel flex h-[min(88vh,60rem)] w-[min(78rem,94vw)] max-w-none animate-pop flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0 shadow-2xl">
        <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
          <h2 id="cart-title" className="t-headline">
            Keranjang
          </h2>
          <span className="t-label tabular-nums">{count} barang</span>
          <div className="ml-auto flex items-center gap-3">
            {list.length > 0 && (
              <button type="button" onClick={clear} className="btn btn-danger-quiet btn-lg gap-2.5">
                <IconTrash className="text-xl" /> Kosongkan
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-primary btn-lg gap-2.5">
              <IconBack className="text-xl" /> Lanjut belanja
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(22rem,30%)]">
          <div className="kiosk-scroll p-6">
            {list.length === 0 ? (
              <EmptyState icon={<IconCart />} title="Keranjang kosong.">
                <button type="button" onClick={onClose} className="btn btn-secondary btn-lg mt-2">
                  Mulai belanja
                </button>
              </EmptyState>
            ) : (
              <ul className="list">
                {list.map(({ product: p, qty }, idx) => (
                  <li key={p.id} className="flex animate-rise items-center gap-4 p-4" style={rise(idx)}>
                    <span
                      className={cn(
                        // 4:3 seperti kartu produk di katalog, jadi foto tampil utuh, tidak dipotong jadi persegi.
                        "flex aspect-[4/3] w-28 shrink-0 items-center justify-center overflow-hidden rounded-md text-4xl",
                        p.image_url ? "bg-white" : categoryTint(p.category),
                      )}
                    >
                      {p.image_url ? <img src={p.image_url} alt="" className="size-full object-contain" /> : <CategoryIcon category={p.category} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{p.name}</p>
                      <p className="t-label mt-1 tabular-nums">{formatIDR(p.price)} / barang</p>
                      {qty >= maxQty(p) && <p className="t-label mt-1 text-warning">Stok maksimal ({p.stock})</p>}
                    </div>
                    <Stepper
                      className="w-48 shrink-0"
                      name={p.name}
                      qty={qty}
                      max={maxQty(p)}
                      onChange={(n) => setQty(p.id, n)}
                      onLimit={() => toast("error", `Stok ${p.name} tinggal ${p.stock}.`)}
                    />
                    <p className="w-32 shrink-0 text-right font-extrabold tabular-nums tracking-tight">{formatIDR(p.price * qty)}</p>
                    <button type="button" onClick={() => setQty(p.id, 0)} aria-label={`Hapus ${p.name}`} className="btn btn-danger-quiet shrink-0">
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="flex flex-col gap-4 border-l border-border bg-surface p-6">
            {/* Ringkasan: pola yang sama dengan customer-web (baris uang, lalu Total di card-footer). */}
            <section className="card flex flex-col" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="t-title">Ringkasan belanja</h3>
                <span className="t-label tabular-nums">{list.length} produk</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <MoneyRow label={`Subtotal (${count} barang)`} value={formatIDR(total)} />
              </div>
              <div className="card-footer flex items-baseline justify-between gap-3">
                <span className="t-title">Total</span>
                <span className="t-figure">{formatIDR(total)}</span>
              </div>
            </section>
            <p className="notice">
              Pembayaran hanya dengan <b>QRIS</b> (GoPay, OVO, DANA, ShopeePay, m-banking). Struk tercetak otomatis setelah lunas.
            </p>
            {offline && <p className="alert-box">Koneksi terputus. Pembayaran bisa dilanjutkan setelah tersambung lagi.</p>}
            <button
              type="button"
              disabled={list.length === 0 || paying || offline}
              onClick={onPay}
              className="btn btn-primary btn-lg btn-block mt-auto min-h-[4.5rem] text-xl"
            >
              {paying ? "Menyiapkan QRIS…" : "Bayar dengan QRIS"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
