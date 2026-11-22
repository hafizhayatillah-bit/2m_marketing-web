import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconAlert, IconChevronRight } from "../../components/Icons";
import { Select } from "../../components/Select";
import { ErrorBox, LoadingRows, ProductThumb, SearchField } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { capitalize, digitsOnly, formatIDR, formatNumber } from "../../lib/format";
import type { BranchProduct, BranchProductsResponse, CatalogProduct, ProductState } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch, useBranchId } from "../branch/BranchProvider";

export const PRODUCTS_KEY = "branch-products";
const MAX_RUPIAH = 100_000_000; // sama dengan batas validasi server

export function useBranchProducts() {
  const branchId = useBranchId();
  return useQuery({
    queryKey: [PRODUCTS_KEY, branchId],
    queryFn: () => api.get<BranchProductsResponse>("/products", { branch_id: branchId }),
  });
}

export const STATE_LABEL: Record<ProductState, { label: string; pill: string }> = {
  available: { label: "Dijual", pill: "pill-success" },
  low: { label: "Menipis", pill: "pill-warning" },
  out: { label: "Habis", pill: "pill-danger" },
  hidden: { label: "Disembunyikan", pill: "" },
  no_price: { label: "Belum ada harga", pill: "pill-warning" },
};

type Patch = Partial<Pick<BranchProduct, "price" | "cost_price" | "is_active" | "min_qty">>;

function usePatchProduct() {
  const branchId = useBranchId();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Patch }) =>
      api.patch<BranchProduct>(`/products/${id}`, { ...patch, branch_id: branchId }),
    onSuccess: (saved) => {
      // Ganti baris di cache supaya tabel tidak berkedip; ringkasan disegarkan di belakang.
      queryClient.setQueryData<BranchProductsResponse>([PRODUCTS_KEY, branchId], (old) =>
        old ? { ...old, products: old.products.map((p) => (p.product_id === saved.product_id ? saved : p)) } : old,
      );
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });
}

// Angka rupiah yang bisa diubah langsung di tabel. Simpan saat Enter atau keluar dari kolom; Escape membatalkan.
function MoneyCell({ value, label, onSave, allowEmpty }: { value: number | null; label: string; onSave: (v: number | null) => void; allowEmpty?: boolean }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  useEffect(() => {
    if (!focused) setDraft(value === null ? "" : String(value));
  }, [value, focused]);
  // Seleksi sebelum paint (nilai berganti dari "Rp18.500" ke "18500"), supaya ketikan pertama langsung mengganti angka.
  useLayoutEffect(() => {
    if (focused) input.current?.select();
  }, [focused]);

  const commit = () => {
    setFocused(false);
    const next = draft === "" ? null : Number(draft);
    if (next === value) return;
    if (next === null && !allowEmpty) return setDraft(value === null ? "" : String(value));
    if ((next !== null && next <= 0 && !allowEmpty) || (next !== null && next > MAX_RUPIAH)) {
      if (next !== null && next > MAX_RUPIAH) toast("error", `Maksimal ${formatIDR(MAX_RUPIAH)}.`);
      return setDraft(value === null ? "" : String(value));
    }
    onSave(next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(value === null ? "" : String(value));
      setFocused(false);
      requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
    }
  };
  return (
    <input
      className="field min-h-9 w-full py-1.5 text-right font-bold tabular-nums md:w-[7.5rem]"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder="–"
      maxLength={focused ? 9 : 14}
      value={focused ? draft : draft === "" ? "" : formatIDR(Number(draft))}
      ref={input}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(digitsOnly(e.target.value))}
      onBlur={commit}
      onKeyDown={onKey}
    />
  );
}

function Margin({ p }: { p: Pick<BranchProduct, "margin" | "margin_pct"> }) {
  if (p.margin === null) return <span className="text-muted-foreground">Isi modal</span>;
  return (
    <span className={cn("tabular-nums", p.margin < 0 && "font-bold text-destructive")}>
      <span className="font-bold">{formatIDR(p.margin)}</span>
      <span className="t-label ml-1.5">{String(p.margin_pct).replace(".", ",")}%</span>
    </span>
  );
}

function SettingsDialog({ product, onClose }: { product: BranchProduct; onClose: () => void }) {
  const { branchName } = useBranch();
  const patch = usePatchProduct();
  const toast = useToast();
  const [minQty, setMinQty] = useState(String(product.min_qty));
  const [active, setActive] = useState(product.is_active);
  const changes: Patch = {};
  if (minQty !== "" && Number(minQty) !== product.min_qty) changes.min_qty = Number(minQty);
  if (active !== product.is_active) changes.is_active = active;
  const dirty = Object.keys(changes).length > 0;

  return (
    <Dialog title={product.name}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          patch.mutate(
            { id: product.product_id, patch: changes },
            { onSuccess: (s) => (toast("success", `${s.name} disimpan`), onClose()) },
          );
        }}
      >
        <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
          <p className="tabular-nums">
            <span className="font-semibold">{product.sku ?? "Tanpa SKU"}</span> · <span className="capitalize">{product.category}</span> · stok{" "}
            {formatNumber(product.stock)}
          </p>
          <p className="text-muted-foreground">
            Harga dan modal diubah langsung di tabel. Nama, foto dan SKU diubah di Katalog. Stok diubah lewat menu Stok supaya tercatat.
          </p>
        </div>
        <label className="field-label flex flex-col gap-1.5">
          Batas stok menipis
          <input
            className="field tabular-nums"
            inputMode="numeric"
            maxLength={6}
            value={minQty}
            onChange={(e) => setMinQty(digitsOnly(e.target.value))}
            disabled={patch.isPending}
          />
          <span className="text-sm font-normal">Produk muncul di daftar “perlu restock” saat stok sama atau di bawah angka ini.</span>
        </label>
        <label className="option-row" data-selected={active}>
          <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={patch.isPending} />
          Jual di kiosk {branchName ?? "cabang ini"}
        </label>
        {!product.catalog_active && <p className="notice">Produk ini dinonaktifkan di Katalog, jadi tidak tampil di kiosk maupun website.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={patch.isPending}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={patch.isPending || !dirty || minQty === ""}>
            {patch.isPending ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// Langkah 1 memilih produk katalog yang belum dijual di cabang ini; langkah 2 mengisi harga, modal dan stok awal.
function AddProductDialog({ onClose }: { onClose: () => void }) {
  const { branchName } = useBranch();
  const branchId = useBranchId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [minQty, setMinQty] = useState("5");
  const [active, setActive] = useState(true);

  const available = useQuery({
    queryKey: ["products-available", branchId, q],
    queryFn: () => api.get<{ products: CatalogProduct[] }>("/products/available", { branch_id: branchId, q: q || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = available.data?.products ?? [];

  const add = useMutation({
    mutationFn: () =>
      api.post<BranchProduct>("/products", {
        branch_id: branchId,
        product_id: picked!.id,
        price: Number(price),
        cost_price: cost === "" ? null : Number(cost),
        initial_qty: Number(stock || 0),
        min_qty: Number(minQty || 0),
        is_active: active,
      }),
    onSuccess: (p) => {
      toast("success", `${p.name} sekarang dijual di ${branchName ?? "cabang ini"}`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] });
      void queryClient.invalidateQueries({ queryKey: ["products-available", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const busy = add.isPending;

  if (picked) {
    const margin = Number(price) > 0 && cost !== "" ? Number(price) - Number(cost) : null;
    return (
      <Dialog title={`Jual ${picked.name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(price) > 0) add.mutate();
          }}
        >
          <p className="border-y border-border py-3 text-sm tabular-nums">
            <span className="font-semibold">{picked.sku ?? "Tanpa SKU"}</span> · <span className="capitalize">{picked.category}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label flex flex-col gap-1.5">
              Harga jual (Rp)
              <input className="field tabular-nums" inputMode="numeric" maxLength={9} value={price} onChange={(e) => setPrice(digitsOnly(e.target.value))} disabled={busy} autoFocus />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Modal (Rp)
              <input className="field tabular-nums" inputMode="numeric" maxLength={9} value={cost} onChange={(e) => setCost(digitsOnly(e.target.value))} disabled={busy} />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Stok awal
              <input className="field tabular-nums" inputMode="numeric" maxLength={6} value={stock} onChange={(e) => setStock(digitsOnly(e.target.value))} disabled={busy} />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Batas menipis
              <input className="field tabular-nums" inputMode="numeric" maxLength={6} value={minQty} onChange={(e) => setMinQty(digitsOnly(e.target.value))} disabled={busy} />
            </label>
          </div>
          <p className="-mt-1 text-sm text-muted-foreground">
            {margin !== null ? (
              <>
                Margin <span className={cn("font-bold", margin < 0 ? "text-destructive" : "text-foreground")}>{formatIDR(margin)}</span> per unit.{" "}
              </>
            ) : null}
            Stok awal dicatat sebagai barang masuk. Harga dan modal berlaku di semua cabang kiosk.
          </p>
          <label className="option-row" data-selected={active}>
            <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
            Langsung tampil di kiosk
          </label>
          {add.isError && <ErrorBox error={add.error} />}
          <div className="flex justify-between gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPicked(null)} disabled={busy}>
              Kembali
            </button>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !(Number(price) > 0)}>
                {busy ? "Menambahkan…" : "Tambahkan"}
              </button>
            </span>
          </div>
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog title="Tambah produk" wide>
      <p className="-mt-2 text-muted-foreground">Pilih produk dari katalog yang belum dijual di {branchName ?? "cabang ini"}.</p>
      <SearchField value={search} onChange={setSearch} label="Cari produk katalog" autoFocus />
      {available.isLoading && <div className="skeleton h-40" role="status" aria-busy="true" aria-label="Memuat" />}
      {available.isError && <ErrorBox error={available.error} />}
      {available.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>{q ? `Tidak ada produk katalog yang cocok dengan “${q}”.` : "Semua produk di katalog sudah dijual di cabang ini. Buat produk baru di tab Katalog."}</p>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="list max-h-[50dvh] overflow-y-auto">
          {rows.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="list-row"
                onClick={() => {
                  setPicked(p);
                  setPrice(p.price ? String(p.price) : "");
                  setCost(p.cost_price !== null ? String(p.cost_price) : "");
                }}
              >
                <ProductThumb src={p.image_url} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p.name}</span>
                  <span className="t-label mt-0.5 block tabular-nums">
                    {p.sku ?? "tanpa SKU"} · {p.category}
                    {!p.is_active && " · nonaktif di katalog"}
                  </span>
                </span>
                <IconChevronRight aria-hidden="true" className="row-arrow text-lg" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <button className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}

const STATE_CHIPS: { id: ProductState | "all"; label: string; dot?: string }[] = [
  { id: "all", label: "Semua" },
  { id: "available", label: "Dijual", dot: "bg-success" },
  { id: "low", label: "Menipis", dot: "bg-warning" },
  { id: "out", label: "Habis", dot: "bg-destructive" },
  { id: "no_price", label: "Belum ada harga", dot: "bg-warning" },
  { id: "hidden", label: "Disembunyikan", dot: "bg-muted-foreground" },
];

function StockWarning({ summary, onShow }: { summary: BranchProductsResponse["summary"]; onShow: (s: ProductState) => void }) {
  if (summary.low === 0 && summary.out === 0) return null;
  const parts = [summary.out > 0 && `${summary.out} habis`, summary.low > 0 && `${summary.low} menipis`].filter(Boolean);
  return (
    <div className="stock-warning animate-rise" role="status">
      <IconAlert className="mt-0.5 shrink-0 text-xl" />
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-64">
        <p className="font-bold">Perlu restock: {parts.join(" dan ")}</p>
        <p className="text-sm">Produk habis tidak bisa dipilih pelanggan di kiosk. Catat barang datang di menu Stok.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 max-sm:pl-8">
        {summary.out > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onShow("out")}>
            Lihat habis
          </button>
        )}
        {summary.low > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onShow("low")}>
            Lihat menipis
          </button>
        )}
      </div>
    </div>
  );
}

export function ProductsSection() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const [state, setState] = useState<ProductState | "all">("all");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState<{ dialog: "edit"; id: number } | { dialog: "add" } | null>(null);
  const products = useBranchProducts();
  const patch = usePatchProduct();
  const toast = useToast();

  const all = products.data?.products ?? [];
  const summary = products.data?.summary;
  const categories = products.data?.categories ?? [];
  const rows = all.filter(
    (p) =>
      (state === "all" || p.state === state) &&
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)),
  );
  const editing = open?.dialog === "edit" ? all.find((p) => p.product_id === open.id) : undefined;
  const filtered = q !== "" || state !== "all" || category !== "";
  const save = (p: BranchProduct, change: Patch, message: string) =>
    patch.mutate({ id: p.product_id, patch: change }, { onSuccess: () => toast("success", message) });

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <StockWarning
          summary={summary}
          onShow={(s) => {
            setState(s);
            setCategory("");
          }}
        />
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={search} onChange={setSearch} label="Cari produk" className="lg:max-w-sm" />
        <Select
          label="Kategori"
          className="w-full sm:w-56"
          active={category !== ""}
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "Semua kategori" }, ...categories.map((c) => ({ value: c, label: capitalize(c) }))]}
        />
        {summary && (
          <p className="t-label whitespace-nowrap lg:ml-auto">
            Nilai stok (modal) <span className="font-bold text-foreground tabular-nums">{formatIDR(summary.stock_value)}</span>
          </p>
        )}
        <button className="btn btn-primary self-start whitespace-nowrap lg:self-auto" onClick={() => setOpen({ dialog: "add" })}>
          Tambah produk
        </button>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filter status">
        {STATE_CHIPS.map((chip) => {
          const count = summary ? (chip.id === "all" ? summary.total : summary[chip.id]) : undefined;
          if (chip.id !== "all" && chip.id !== state && count === 0) return null;
          return (
            <button key={chip.id} type="button" className="chip" aria-pressed={state === chip.id} onClick={() => setState(chip.id)}>
              {chip.dot && <span aria-hidden="true" className={cn("size-2 rounded-full", chip.dot)} />}
              {chip.label}
              {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
        {filtered && (
          <button
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            onClick={() => {
              setSearch("");
              setState("all");
              setCategory("");
            }}
          >
            Hapus filter
          </button>
        )}
      </div>

      {products.isLoading && <LoadingRows />}
      {products.isError && <ErrorBox error={products.error} />}
      {products.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>{filtered ? "Tidak ada produk yang cocok dengan filter ini." : "Cabang ini belum menjual produk. Pakai Tambah produk untuk memilih dari katalog."}</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card animate-rise overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th className="min-w-[13rem]">Produk</th>
                <th className="text-right">Harga jual</th>
                <th className="text-right">Modal</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Stok</th>
                <th>Kiosk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = STATE_LABEL[p.state];
                return (
                  <tr key={p.product_id}>
                    <td data-primary>
                      <span className="flex items-center gap-3">
                        <ProductThumb src={p.image_url} />
                        <span className="min-w-0">
                          <span className="block font-bold">{p.name}</span>
                          <span className="t-label mt-0.5 block tabular-nums">
                            {p.sku ?? "tanpa SKU"} · {p.category}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Harga jual" className="md:text-right">
                      <MoneyCell value={p.price} label={`Harga jual ${p.name}`} onSave={(v) => save(p, { price: v }, `Harga ${p.name} jadi ${formatIDR(v)}`)} />
                    </td>
                    <td data-label="Modal" className="md:text-right">
                      <MoneyCell
                        value={p.cost_price}
                        allowEmpty
                        label={`Modal ${p.name}`}
                        onSave={(v) => save(p, { cost_price: v }, v === null ? `Modal ${p.name} dikosongkan` : `Modal ${p.name} jadi ${formatIDR(v)}`)}
                      />
                    </td>
                    <td data-label="Margin" className="md:text-right">
                      <Margin p={p} />
                    </td>
                    <td data-label="Stok" className="md:text-right">
                      <span className="flex items-center justify-end gap-2">
                        <span className={cn("font-bold tabular-nums", p.stock <= 0 && "text-destructive")}>{formatNumber(p.stock)}</span>
                      </span>
                      <span className={cn("pill pill-dot mt-1", status.pill)}>{status.label}</span>
                    </td>
                    <td data-label="Kiosk">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          className="size-5 accent-primary"
                          checked={p.is_active}
                          onChange={(e) =>
                            save(p, { is_active: e.target.checked }, e.target.checked ? `${p.name} tampil lagi di kiosk` : `${p.name} disembunyikan dari kiosk`)
                          }
                        />
                        {p.is_active ? "Dijual" : "Sembunyi"}
                      </label>
                    </td>
                    <td data-actions className="md:text-right">
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "edit", id: p.product_id })}>
                        Atur
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SettingsDialog product={editing} onClose={() => setOpen(null)} />}
      {open?.dialog === "add" && <AddProductDialog onClose={() => setOpen(null)} />}
    </div>
  );
}
