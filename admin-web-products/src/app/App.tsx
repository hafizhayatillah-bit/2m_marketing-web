import { IconStore } from "../components/Icons";
import { Select } from "../components/Select";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { BranchProvider, useBranch } from "../features/products/BranchProvider";
import { ProductsPage } from "../features/products/ProductsPage";

// Same rail + header shell as the 2M admin, with only the product screens.
function Shell() {
  const { branchId, branches, setBranchId } = useBranch();

  return (
    <div className="flex min-h-dvh flex-col pb-24 md:flex-row md:pb-0">
      <nav
        aria-label="Navigasi utama"
        className="rail fixed inset-x-3 bottom-3 z-[700] flex gap-1 rounded-[1.125rem] bg-rail p-1.5 shadow-nav md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:h-dvh md:w-[5.5rem] md:shrink-0 md:flex-col md:rounded-none md:p-2 md:py-4 md:shadow-none"
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-5 hidden size-11 items-center justify-center rounded-md bg-rail-foreground text-base font-extrabold tracking-tight text-rail md:flex"
        >
          2M
        </span>
        <button
          aria-current="page"
          className="relative z-[1] flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-rail-foreground px-1 text-[0.6875rem] font-bold text-rail md:min-h-[3.75rem] md:flex-none"
        >
          <IconStore className="text-xl" />
          Produk
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 md:px-6">
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            <Select
              label="Cabang"
              icon={<IconStore />}
              align="end"
              className="max-w-[12rem] sm:max-w-[16rem]"
              value={branchId ?? ""}
              options={branches.map((b) => ({ value: b.id, label: b.name, hint: b.is_active ? undefined : "Nonaktif" }))}
              onChange={setBranchId}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <ErrorBoundary>
            <ProductsPage />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BranchProvider>
      <Shell />
    </BranchProvider>
  );
}
