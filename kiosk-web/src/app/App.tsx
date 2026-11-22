import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { config } from "../config";
import { ApiError, errorText, kioskApi, NetworkError, type Order } from "../lib/api";
import { cartSummary, useCart } from "../lib/cart";
import { useToast } from "../lib/toast";
import { useIdle } from "../lib/idle";
import { Catalog } from "../screens/Catalog";
import { CartButton, CartOverlay } from "../screens/Cart";
import { Payment } from "../screens/Payment";
import { Closed, Success } from "../screens/Done";
import { PinPad, StaffPanel } from "../screens/Staff";
import { IconAlert } from "../components/Icons";

type Screen =
  | { name: "catalog" }
  | { name: "payment"; order: Order }
  | { name: "success"; order: Order }
  | { name: "closed"; reason: "cancelled" | "expired" };

const LONG_PRESS_MS = 1500;

/**
 * Logo 2M membuka PIN staf (tidak kelihatan oleh pelanggan): tekan-tahan 1,5 detik, ATAU tap 5x cepat
 * (cadangan: di touchscreen Windows, tekan-lama kadang diubah Chrome jadi klik kanan dan membatalkan sentuhan).
 */
function Logo({ onLongPress }: { onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const taps = useRef<number[]>([]);
  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(onLongPress, LONG_PRESS_MS);
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      clearTimeout(timer.current);
      onLongPress();
    }
  };
  const stop = () => clearTimeout(timer.current);
  return (
    <span
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      aria-hidden="true"
      className="flex size-14 shrink-0 select-none items-center justify-center"
    >
      {/* pointer-events-none: sentuhan tetap ditangkap span (pemicu PIN staf), gambar tidak bisa di-drag/disimpan. */}
      <img
        src={`${import.meta.env.BASE_URL}logo-2m.png`}
        alt=""
        width={56}
        height={56}
        draggable={false}
        className="pointer-events-none size-14 rounded-lg"
      />
    </span>
  );
}

function FullScreenMessage({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-background p-10 text-center">
      <span className="flex size-24 items-center justify-center rounded-full bg-destructive-surface text-5xl text-destructive">
        <IconAlert />
      </span>
      <h1 className="t-headline">{title}</h1>
      <p className="max-w-xl text-lg text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function App() {
  const toast = useToast();
  const qc = useQueryClient();
  const [screen, setScreen] = useState<Screen>({ name: "catalog" });
  const [paying, setPaying] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [staffPin, setStaffPin] = useState<string | null>(null);
  // Dinaikkan setiap reset supaya kategori, scroll, dsb. kembali ke awal.
  const [resetKey, setResetKey] = useState(0);
  const clearCart = useCart((s) => s.clear);
  const reconcile = useCart((s) => s.reconcile);
  const cartCount = useCart((s) => cartSummary(s.lines).count);

  const cfg = useQuery({ queryKey: ["config"], queryFn: kioskApi.config, retry: 1, refetchInterval: 60_000 });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: kioskApi.products,
    refetchInterval: config.productsPollMs,
    refetchIntervalInBackground: true,
    retry: 1,
  });

  // Stok berubah (terjual / diisi ulang): sesuaikan keranjang, beri tahu pelanggan.
  useEffect(() => {
    if (!products.data) return;
    const adjusted = reconcile(products.data.products);
    for (const a of adjusted) {
      toast("error", a.to === 0 ? `${a.name} baru saja habis, dihapus dari keranjang.` : `Stok ${a.name} tinggal ${a.to}, jumlah disesuaikan.`);
    }
  }, [products.data, reconcile, toast]);

  const goHome = useCallback(() => {
    clearCart();
    setScreen({ name: "catalog" });
    setCartOpen(false);
    setPinOpen(false);
    setStaffPin(null);
    setResetKey((k) => k + 1);
    void qc.invalidateQueries({ queryKey: ["products"] });
  }, [clearCart, qc]);

  // Tidak ada sentuhan: tampilkan peringatan, lalu reset. Tidak aktif saat layar bayar/sukses
  // (keduanya punya hitung mundur sendiri) dan saat katalog kosong tanpa keranjang.
  const idleEnabled = screen.name === "catalog" && (staffPin !== null || pinOpen || cartOpen || cartCount > 0);
  const idle = useIdle({ enabled: idleEnabled, warnAfterMs: config.idleWarnMs, countdownSeconds: config.idleCountdownSeconds, onTimeout: goHome });

  async function pay() {
    const items = Object.values(useCart.getState().lines).map((l) => ({ product_id: l.product.id, qty: l.qty }));
    if (items.length === 0) return;
    setPaying(true);
    try {
      const order = await kioskApi.createOrder(items);
      setCartOpen(false);
      setScreen({ name: "payment", order });
    } catch (e) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK") {
        await qc.invalidateQueries({ queryKey: ["products"] });
        toast("error", e.message);
      } else {
        toast("error", errorText(e));
      }
    } finally {
      setPaying(false);
    }
  }

  const onPaid = useCallback(
    (order: Order) => {
      clearCart();
      setScreen({ name: "success", order });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    [clearCart, qc],
  );
  const onClosed = useCallback((_o: Order, reason: "cancelled" | "expired") => setScreen({ name: "closed", reason }), []);

  // ---------------------------------------------------------------- layar error
  const cfgErr = cfg.error;
  if (cfgErr instanceof ApiError && (cfgErr.status === 401 || cfgErr.status === 503 || cfgErr.status === 404)) {
    return (
      <FullScreenMessage
        title="Kiosk belum siap"
        body={`${cfgErr.message} Hubungi petugas toko. (Petugas: buka ${import.meta.env.BASE_URL}?token=…&branch=… sekali untuk mengatur perangkat.)`}
        action={
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary btn-lg">
            Muat ulang
          </button>
        }
      />
    );
  }
  const offlineNoData = (!products.data && products.isError) || (!cfg.data && cfg.isError);
  if (offlineNoData) {
    return (
      <FullScreenMessage
        title="Kiosk sedang offline"
        body="Tidak bisa terhubung ke server. Kami mencoba lagi otomatis. Silakan bayar di kasir atau hubungi petugas."
        action={
          <button
            type="button"
            onClick={() => {
              void cfg.refetch();
              void products.refetch();
            }}
            className="btn btn-primary btn-lg"
          >
            Coba lagi sekarang
          </button>
        }
      />
    );
  }
  if (!products.data || !cfg.data) {
    return (
      <div className="flex h-dvh items-center justify-center" aria-busy="true">
        <div className="skeleton h-16 w-80 rounded-lg" />
      </div>
    );
  }

  const storeName = cfg.data.store_name;
  // Data lama masih ada tapi refresh terakhir gagal karena jaringan: katalog tetap tampil dengan peringatan,
  // tapi checkout dikunci supaya pelanggan tidak terjebak di layar bayar yang tidak bisa dicek.
  const stale = products.isError && products.error instanceof NetworkError;

  return (
    <div key={resetKey} className="flex h-dvh flex-col">
      <header className="flex h-20 shrink-0 items-center gap-4 border-b border-border bg-background px-5">
        <Logo onLongPress={() => setPinOpen(true)} />
        <div className="min-w-0 leading-tight">
          <p className="text-xl font-extrabold tracking-tight">{storeName}</p>
          <p className="t-label">{cfg.data.branch.name} · Belanja mandiri</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {screen.name === "catalog" && cartCount > 0 && (
            <button type="button" onClick={goHome} className="btn btn-secondary btn-lg">
              Mulai dari awal
            </button>
          )}
          <span className="pill pill-primary text-sm">Bayar pakai QRIS</span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {screen.name === "catalog" && (
          <>
            <Catalog products={products.data.products} categories={products.data.categories} stale={stale} />
            <CartButton onOpen={() => setCartOpen(true)} />
            {cartOpen && <CartOverlay onClose={() => setCartOpen(false)} onPay={pay} paying={paying} offline={stale} />}
          </>
        )}
        {screen.name === "payment" && <Payment order={screen.order} onPaid={onPaid} onClosed={onClosed} />}
        {screen.name === "success" && <Success order={screen.order} storeName={storeName} onDone={goHome} />}
        {screen.name === "closed" && <Closed reason={screen.reason} onDone={goHome} />}
      </main>

      {idle.warning && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-rail/60" role="alertdialog" aria-label="Masih di sana?">
          <div className="dialog-panel flex w-[30rem] max-w-[92vw] flex-col items-center gap-4 rounded-xl bg-surface p-8 text-center">
            <h2 className="t-headline">Masih belanja?</h2>
            <p className="text-lg text-muted-foreground">Keranjang akan dikosongkan dalam</p>
            <p className="t-display tabular-nums">{idle.secondsLeft}</p>
            <button type="button" onClick={idle.dismiss} className="btn btn-primary btn-lg btn-block">
              Ya, lanjut belanja
            </button>
          </div>
        </div>
      )}

      {pinOpen && !staffPin && (
        <PinPad
          onClose={() => setPinOpen(false)}
          onSuccess={(pin) => {
            setPinOpen(false);
            setStaffPin(pin);
          }}
        />
      )}
      {staffPin && <StaffPanel pin={staffPin} storeName={storeName} onClose={() => setStaffPin(null)} />}
    </div>
  );
}
