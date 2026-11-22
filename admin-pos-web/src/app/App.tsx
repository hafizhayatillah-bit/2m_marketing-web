import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { IconBox, IconChart, IconLogout, IconReceipt, IconStore, IconWallet } from "../components/Icons";
import { Select } from "../components/Select";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useThumb } from "../components/Segmented";
import { AuthGate, useSession } from "../features/auth/AuthGate";
import { BranchProvider, useBranch } from "../features/branch/BranchProvider";
import { ProductsPage } from "../features/products/ProductsPage";
import { StockPage } from "../features/stock/StockPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { ExpensesPage } from "../features/expenses/ExpensesPage";
import { cn } from "../lib/utils";
import { InstallButton } from "../components/InstallButton";
import { LOGO } from "../lib/brand";

type Page = "laporan" | "transaksi" | "produk" | "stok" | "biaya";

const NAV: { id: Page; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "laporan", label: "Laporan", icon: IconChart },
  { id: "transaksi", label: "Transaksi", icon: IconReceipt },
  { id: "produk", label: "Produk", icon: IconStore },
  { id: "stok", label: "Stok", icon: IconBox },
  { id: "biaya", label: "Biaya", icon: IconWallet },
];

// Halaman disimpan di hash (#/stok) supaya reload dan tombol back tetap di halaman yang sama.
function readHash(): Page {
  const id = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return NAV.some((n) => n.id === id) ? (id as Page) : "laporan";
}

function usePage(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(readHash);
  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [page, (p) => (window.location.hash = `/${p}`)];
}

function Shell() {
  const { branchId, branches, setBranchId } = useBranch();
  const { username, logout } = useSession();
  const [page, setPage] = usePage();
  const rail = useRef<HTMLDivElement>(null);
  const thumb = useThumb(rail, "[aria-current='page']", page);

  return (
    <div className="flex min-h-dvh flex-col pb-24 md:flex-row md:pb-0">
      <nav
        aria-label="Navigasi utama"
        className="rail fixed inset-x-3 bottom-3 z-[700] flex rounded-[1.125rem] bg-rail p-1.5 shadow-nav md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:h-dvh md:w-[5.5rem] md:shrink-0 md:flex-col md:rounded-none md:p-2 md:py-4 md:shadow-none"
      >
        <img
          src={LOGO}
          alt="2M Sembako"
          width={48}
          height={48}
          className="mx-auto mb-5 hidden size-12 shrink-0 rounded-[0.625rem] md:block"
        />
        <div ref={rail} className="relative flex flex-1 gap-1 md:flex-none md:flex-col">
          <span
            aria-hidden="true"
            className={cn("absolute left-0 top-0 rounded-xl bg-rail-foreground", thumb.ready && "transition-[transform,width,height] duration-300 ease-settle")}
            style={thumb.style}
          />
          {NAV.map((item) => {
            const active = item.id === page;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setPage(item.id)}
                className={cn(
                  "relative z-[1] flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.6875rem] font-bold transition-colors active:scale-[0.96] md:min-h-[3.75rem] md:flex-none",
                  active ? "text-rail" : "text-rail-muted hover:text-rail-foreground",
                )}
              >
                <Icon className="text-xl" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 md:px-6">
          <img src={LOGO} alt="2M Sembako" width={36} height={36} className="size-9 shrink-0 rounded-lg md:hidden" />
          <p className="hidden font-bold sm:block">Admin toko kiosk</p>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-sm">
            <InstallButton compact />
            <Select
              label="Cabang"
              icon={<IconStore />}
              align="end"
              className="max-w-[12rem] sm:max-w-[16rem]"
              value={branchId ? String(branchId) : ""}
              options={branches.map((b) => ({ value: String(b.id), label: b.name, hint: b.is_active ? undefined : "Nonaktif" }))}
              onChange={(v) => setBranchId(Number(v))}
            />
            <span className="avatar size-9 text-sm" title={username} aria-hidden="true">
              {username.charAt(0)}
            </span>
            <button type="button" className="icon-btn" aria-label={`Keluar (${username})`} title="Keluar" onClick={logout}>
              <IconLogout />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">
          {!branchId ? (
            <div className="p-4 md:p-6" role="status">
              <div className="skeleton h-10 w-48" />
            </div>
          ) : (
            <ErrorBoundary key={page}>
              {page === "laporan" && <ReportsPage key={branchId} onNavigate={setPage} />}
              {page === "transaksi" && <OrdersPage key={branchId} />}
              {page === "produk" && <ProductsPage key={branchId} />}
              {page === "stok" && <StockPage key={branchId} />}
              {page === "biaya" && <ExpensesPage key={branchId} />}
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthGate>
      <BranchProvider>
        <Shell />
      </BranchProvider>
    </AuthGate>
  );
}

export type { Page };
