import { useDeferredValue, useState, type CSSProperties } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconPlus, IconTrash } from "../../components/Icons";
import { Segmented, useSwapX, type SegmentedItem } from "../../components/Segmented";
import { Select } from "../../components/Select";
import { DateRangeFilter, ErrorBox, LoadingRows, PageHeader, ProductPicker, ProductThumb, SearchField, type DayRange } from "../../components/ui";
import { api } from "../../lib/api";
import { capitalize, digitsOnly, formatDateTime, formatIDR, formatNumber } from "../../lib/format";
import type { BranchProduct, Movement, MovementType } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch, useBranchId } from "../branch/BranchProvider";
import { PRODUCTS_KEY, useBranchProducts } from "../products/ProductsSection";

type Section = "in" | "adjust" | "opname" | "history";

const ITEMS: SegmentedItem<Section>[] = [
  { id: "in", label: "Barang masuk", title: "Catat barang datang dari supplier" },
  { id: "adjust", label: "Penyesuaian", title: "Barang rusak, hilang, atau koreksi" },
  { id: "opname", label: "Opname", title: "Stock opname: hitung fisik" },
  { id: "history", label: "Riwayat", title: "Riwayat pergerakan stok" },
];

const MOVES_KEY = "stock-movements";

function useStockDone() {
  const branchId = useBranchId();
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: [MOVES_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: ["report"] });
  };
}

export function StockPage() {
  const { branchName } = useBranch();
  const [section, setSection] = useState<Section>("in");
  const swapX = useSwapX(ITEMS.findIndex((i) => i.id === section));
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PageHeader title="Stok" description={`Semua perubahan stok ${branchName ?? "cabang ini"} tercatat di Riwayat. Stok yang tampil di kiosk ikut berubah.`} />
      <Segmented label="Bagian stok" value={section} onChange={setSection} items={ITEMS} className="w-full lg:w-[36rem]" />
      <div key={section} className="swap-in min-w-0" style={{ "--swap-x": swapX } as CSSProperties}>
        {section === "in" && <StockInSection />}
        {section === "adjust" && <AdjustSection />}
        {section === "opname" && <OpnameSection />}
        {section === "history" && <HistorySection />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- barang masuk

interface InLine {
  product: BranchProduct;
  qty: string;
  cost: string;
}

function PickDialog({ title, products, exclude, onPick, onClose }: { title: string; products: BranchProduct[]; exclude?: number[]; onPick: (p: BranchProduct) => void; onClose: () => void }) {
  return (
    <Dialog title={title} wide>
      <ProductPicker products={products} exclude={exclude} onPick={onPick} />
      <div className="flex justify-end">
        <button className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}

function StockInSection() {
  const branchId = useBranchId();
  const products = useBranchProducts();
  const toast = useToast();
  const done = useStockDone();
  const [lines, setLines] = useState<InLine[]>([]);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [picking, setPicking] = useState(false);

  const valid = lines.length > 0 && lines.every((l) => Number(l.qty) > 0);
  const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalCost = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.cost || 0), 0);
  const set = (i: number, patch: Partial<InLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: () =>
      api.post("/stock/in", {
        branch_id: branchId,
        ref: ref.trim() || null,
        note: note.trim() || null,
        update_cost: updateCost,
        items: lines.map((l) => ({ product_id: l.product.product_id, qty: Number(l.qty), unit_cost: l.cost === "" ? null : Number(l.cost) })),
      }),
    onSuccess: () => {
      toast("success", `${formatNumber(totalQty)} unit dari ${lines.length} produk masuk stok`);
      setLines([]);
      setRef("");
      setNote("");
      done();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="field-label flex flex-col gap-1.5">
          No. nota / surat jalan
          <input className="field" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} placeholder="Opsional" />
        </label>
        <label className="field-label flex flex-col gap-1.5">
          Catatan
          <input className="field" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="mis. Supplier, nama pengirim" />
        </label>
      </div>
      {products.isLoading && <LoadingRows rows={2} />}
      {products.isError && <ErrorBox error={products.error} />}
      {lines.length === 0 ? (
        <div className="empty-state">
          <p>Tambahkan produk yang datang, lalu isi jumlah dan harga modal per unit dari nota.</p>
          <button className="btn btn-primary mt-2" onClick={() => setPicking(true)} disabled={!products.data}>
            <IconPlus /> Tambah barang
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produk</th>
                <th className="text-right">Stok sekarang</th>
                <th className="text-right">Jumlah masuk</th>
                <th className="text-right">Modal / unit</th>
                <th className="text-right">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.product.product_id}>
                  <td data-primary>
                    <span className="flex items-center gap-3">
                      <ProductThumb src={l.product.image_url} size="size-9" />
                      <span className="font-bold">{l.product.name}</span>
                    </span>
                  </td>
                  <td data-label="Stok sekarang" className="tabular-nums md:text-right">
                    {formatNumber(l.product.stock)}
                  </td>
                  <td data-label="Jumlah masuk" className="md:text-right">
                    <input
                      className="field min-h-9 w-24 py-1.5 text-right font-bold tabular-nums"
                      inputMode="numeric"
                      maxLength={6}
                      aria-label={`Jumlah masuk ${l.product.name}`}
                      value={l.qty}
                      onChange={(e) => set(i, { qty: digitsOnly(e.target.value) })}
                      aria-invalid={l.qty !== "" && Number(l.qty) <= 0}
                      autoFocus={i === lines.length - 1}
                    />
                  </td>
                  <td data-label="Modal / unit" className="md:text-right">
                    <input
                      className="field min-h-9 w-32 py-1.5 text-right tabular-nums"
                      inputMode="numeric"
                      maxLength={9}
                      aria-label={`Modal per unit ${l.product.name}`}
                      value={l.cost}
                      placeholder="–"
                      onChange={(e) => set(i, { cost: digitsOnly(e.target.value) })}
                    />
                  </td>
                  <td data-label="Subtotal" className="font-bold tabular-nums md:text-right">
                    {l.cost ? formatIDR(Number(l.qty || 0) * Number(l.cost)) : "–"}
                  </td>
                  <td data-actions className="md:text-right">
                    <button className="icon-btn" aria-label={`Hapus ${l.product.name}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
            <button className="btn btn-secondary btn-sm" onClick={() => setPicking(true)}>
              <IconPlus /> Tambah barang
            </button>
            <p className="ml-auto text-sm tabular-nums">
              {formatNumber(totalQty)} unit · modal <span className="font-bold">{formatIDR(totalCost)}</span>
            </p>
          </div>
        </div>
      )}
      {lines.length > 0 && (
        <>
          <label className="option-row" data-selected={updateCost}>
            <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
            Jadikan modal per unit ini harga modal produk (dipakai untuk laporan laba penjualan berikutnya)
          </label>
          {save.isError && <ErrorBox error={save.error} />}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setLines([])} disabled={save.isPending}>
              Kosongkan
            </button>
            <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
              {save.isPending ? "Menyimpan…" : "Simpan barang masuk"}
            </button>
          </div>
        </>
      )}
      {picking && products.data && (
        <PickDialog
          title="Tambah barang masuk"
          products={products.data.products}
          exclude={lines.map((l) => l.product.product_id)}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setLines((ls) => [...ls, { product: p, qty: "", cost: p.cost_price !== null ? String(p.cost_price) : "" }]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- penyesuaian

const REASONS_OUT = ["Rusak", "Kedaluwarsa", "Hilang", "Dipakai toko", "Retur ke supplier"];
const REASONS_ADJUST = ["Salah input", "Barang ditemukan", "Koreksi hitung"];

function AdjustSection() {
  const branchId = useBranchId();
  const products = useBranchProducts();
  const toast = useToast();
  const done = useStockDone();
  const [product, setProduct] = useState<BranchProduct | null>(null);
  const [kind, setKind] = useState<"out" | "plus" | "minus">("out");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState(false);
  const current = product ? products.data?.products.find((p) => p.product_id === product.product_id) ?? product : null;
  const delta = (kind === "plus" ? 1 : -1) * Number(qty || 0);
  const fullNote = [reason, note.trim()].filter(Boolean).join(": ");
  const valid = current && Number(qty) > 0 && fullNote !== "";

  const save = useMutation({
    mutationFn: () =>
      api.post<Movement>("/stock/adjust", { branch_id: branchId, product_id: current!.product_id, type: kind === "out" ? "out" : "adjust", delta, note: fullNote }),
    onSuccess: (m) => {
      toast("success", `Stok ${current!.name} jadi ${formatNumber(m.qty_after ?? 0)}`);
      setQty("");
      setNote("");
      setReason("");
      done();
    },
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Produk</span>
          {current ? (
            <div className="list">
              <div className="list-row">
                <ProductThumb src={current.image_url} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{current.name}</span>
                  <span className="t-label mt-0.5 block tabular-nums">Stok sistem sekarang {formatNumber(current.stock)}</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => setPicking(true)}>
                  Ganti
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary self-start" onClick={() => setPicking(true)} disabled={!products.data}>
              Pilih produk
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Jenis</span>
          <Segmented
            label="Jenis penyesuaian"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setReason("");
            }}
            items={[
              { id: "out", label: "Barang keluar", title: "Rusak, kedaluwarsa, hilang, dipakai" },
              { id: "minus", label: "Koreksi −", title: "Kurangi stok sistem" },
              { id: "plus", label: "Koreksi +", title: "Tambah stok sistem" },
            ]}
            className="w-full sm:w-[28rem]"
          />
        </div>
        <label className="field-label flex flex-col gap-1.5 sm:w-48">
          Jumlah
          <input className="field tabular-nums" inputMode="numeric" maxLength={6} value={qty} onChange={(e) => setQty(digitsOnly(e.target.value))} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Alasan</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Alasan">
            {(kind === "out" ? REASONS_OUT : REASONS_ADJUST).map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(reason === r ? "" : r)}>
                {r}
              </button>
            ))}
          </div>
          <input className="field mt-1" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="Keterangan (wajib kalau alasan tidak dipilih)" />
        </div>
      </div>
      <aside className="card flex flex-col gap-3 self-start">
        <h2 className="t-title">Ringkasan</h2>
        {current && Number(qty) > 0 ? (
          <dl className="spec-list">
            <dt>Stok sekarang</dt>
            <dd className="tabular-nums">{formatNumber(current.stock)}</dd>
            <dt>Perubahan</dt>
            <dd className={cn("tabular-nums", delta < 0 ? "text-destructive" : "text-success")}>{delta > 0 ? `+${delta}` : delta}</dd>
            <dt>Stok setelahnya</dt>
            <dd className="tabular-nums">{formatNumber(current.stock + delta)}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Pilih produk dan isi jumlah untuk melihat stok setelah disesuaikan.</p>
        )}
        {save.isError && <ErrorBox error={save.error} />}
        <button className="btn btn-primary btn-block" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Menyimpan…" : "Simpan penyesuaian"}
        </button>
      </aside>
      {picking && products.data && (
        <PickDialog
          title="Pilih produk"
          products={products.data.products}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setProduct(p);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stock opname

interface OpnameResponse {
  ref: string;
  changed: number;
  results: { product_id: number; system_qty: number; counted: number; diff: number }[];
}

function OpnameSection() {
  const branchId = useBranchId();
  const products = useBranchProducts();
  const toast = useToast();
  const done = useStockDone();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OpnameResponse | null>(null);

  const all = products.data?.products ?? [];
  const rows = all.filter((p) => (!category || p.category === category) && (!q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)));
  const entered = all.filter((p) => counts[p.product_id] !== undefined && counts[p.product_id] !== "");
  const diffs = entered.map((p) => ({ p, diff: Number(counts[p.product_id]) - p.stock })).filter((d) => d.diff !== 0);
  const valueDiff = diffs.reduce((s, d) => s + d.diff * (d.p.cost_price ?? 0), 0);

  const save = useMutation({
    mutationFn: () =>
      api.post<OpnameResponse>("/stock/opname", {
        branch_id: branchId,
        note: note.trim() || null,
        items: entered.map((p) => ({ product_id: p.product_id, counted: Number(counts[p.product_id]) })),
      }),
    onSuccess: (r) => {
      setResult(r);
      setConfirming(false);
      setCounts({});
      setNote("");
      toast("success", r.changed ? `Opname ${r.ref} disimpan: ${r.changed} produk dikoreksi` : `Opname ${r.ref} disimpan: semua cocok`);
      done();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {result && (
        <div className="notice flex flex-wrap items-center gap-3" role="status">
          <span>
            Opname <span className="font-bold">{result.ref}</span> tersimpan. {result.results.length} produk dihitung, {result.changed} dikoreksi (tercatat sebagai penyesuaian di Riwayat).
          </span>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={() => setResult(null)}>
            Tutup
          </button>
        </div>
      )}
      <p className="text-muted-foreground">
        Hitung barang di rak, lalu isi kolom <span className="font-semibold text-foreground">Hitung fisik</span>. Produk yang dikosongkan tidak ikut diopname. Selisih dihitung ulang saat disimpan, jadi penjualan di tengah hitungan tetap aman.
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={search} onChange={setSearch} label="Cari produk" className="lg:max-w-sm" />
        <Select
          label="Kategori"
          className="w-full sm:w-56"
          active={category !== ""}
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "Semua kategori" }, ...(products.data?.categories ?? []).map((c) => ({ value: c, label: capitalize(c) }))]}
        />
        <button
          className="btn btn-secondary btn-sm lg:ml-auto"
          onClick={() => setCounts((c) => ({ ...c, ...Object.fromEntries(rows.map((p) => [p.product_id, c[p.product_id] ?? String(Math.max(0, p.stock))])) }))}
          disabled={rows.length === 0}
          title="Isi kolom hitung dengan stok sistem, lalu ubah yang berbeda saja"
        >
          Isi dengan stok sistem
        </button>
      </div>
      {products.isLoading && <LoadingRows />}
      {products.isError && <ErrorBox error={products.error} />}
      {rows.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produk</th>
                <th className="text-right">Stok sistem</th>
                <th className="text-right">Hitung fisik</th>
                <th className="text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const v = counts[p.product_id] ?? "";
                const diff = v === "" ? null : Number(v) - p.stock;
                return (
                  <tr key={p.product_id}>
                    <td data-primary>
                      <span className="block font-bold">{p.name}</span>
                      <span className="t-label mt-0.5 block tabular-nums">
                        {p.sku ?? "tanpa SKU"} · {p.category}
                      </span>
                    </td>
                    <td data-label="Stok sistem" className="tabular-nums md:text-right">
                      {formatNumber(p.stock)}
                    </td>
                    <td data-label="Hitung fisik" className="md:text-right">
                      <input
                        className="field min-h-9 w-24 py-1.5 text-right font-bold tabular-nums"
                        inputMode="numeric"
                        maxLength={6}
                        aria-label={`Hitung fisik ${p.name}`}
                        value={v}
                        placeholder="–"
                        onChange={(e) => setCounts((c) => ({ ...c, [p.product_id]: digitsOnly(e.target.value) }))}
                      />
                    </td>
                    <td data-label="Selisih" className={cn("font-bold tabular-nums md:text-right", diff !== null && diff < 0 && "text-destructive", diff !== null && diff > 0 && "text-success")}>
                      {diff === null ? <span className="font-normal text-muted-foreground">–</span> : diff === 0 ? "Cocok" : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="field-label flex flex-1 flex-col gap-1.5">
          Catatan opname
          <input className="field" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="mis. Opname akhir bulan, dihitung oleh …" />
        </label>
        <p className="text-sm tabular-nums md:pb-3">
          {entered.length} dihitung · {diffs.length} selisih
        </p>
        <button className="btn btn-primary" disabled={entered.length === 0} onClick={() => setConfirming(true)}>
          Simpan opname
        </button>
      </div>
      {confirming && (
        <Dialog title="Simpan stock opname?">
          <p className="text-muted-foreground">
            {entered.length} produk dihitung. {diffs.length === 0 ? "Semua cocok dengan stok sistem." : `${diffs.length} produk akan dikoreksi:`}
          </p>
          {diffs.length > 0 && (
            <ul className="list max-h-64 overflow-y-auto">
              {diffs.map(({ p, diff }) => (
                <li key={p.product_id} className="list-row min-h-0 justify-between py-2.5">
                  <span className="min-w-0 truncate font-semibold">{p.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {p.stock} → {counts[p.product_id]} <span className={cn("ml-1 font-bold", diff < 0 ? "text-destructive" : "text-success")}>({diff > 0 ? `+${diff}` : diff})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {diffs.length > 0 && (
            <p className="text-sm">
              Nilai selisih (modal): <span className={cn("font-bold tabular-nums", valueDiff < 0 && "text-destructive")}>{formatIDR(valueDiff)}</span>
            </p>
          )}
          {save.isError && <ErrorBox error={save.error} />}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={save.isPending}>
              Batal
            </button>
            <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Menyimpan…" : "Simpan opname"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- riwayat

export const MOVE_LABEL: Record<MovementType, { label: string; pill: string }> = {
  in: { label: "Masuk", pill: "pill-success" },
  out: { label: "Keluar", pill: "pill-danger" },
  adjust: { label: "Koreksi", pill: "pill-warning" },
  sale: { label: "Penjualan", pill: "pill-info" },
};

const TYPE_CHIPS: { id: MovementType | "all"; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "in", label: "Masuk" },
  { id: "sale", label: "Penjualan" },
  { id: "out", label: "Keluar" },
  { id: "adjust", label: "Koreksi & opname" },
];

function HistorySection() {
  const branchId = useBranchId();
  const products = useBranchProducts();
  const [type, setType] = useState<MovementType | "all">("all");
  const [productId, setProductId] = useState("");
  const [range, setRange] = useState<DayRange | null>(null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());

  const moves = useInfiniteQuery({
    queryKey: [MOVES_KEY, branchId, type, productId, range?.from, range?.to, q],
    queryFn: ({ pageParam }) =>
      api.get<{ movements: Movement[]; has_more: boolean; page: number }>("/stock/movements", {
        branch_id: branchId,
        type: type === "all" ? undefined : type,
        product_id: productId || undefined,
        date_from: range?.from,
        date_to: range?.to,
        q: q || undefined,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const rows = moves.data?.pages.flatMap((p) => p.movements) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={search} onChange={setSearch} label="Cari riwayat" placeholder="Cari produk, no. order, catatan…" className="lg:max-w-sm" />
        <Select
          label="Produk"
          className="w-full sm:w-72"
          active={productId !== ""}
          value={productId}
          onChange={setProductId}
          options={[{ value: "", label: "Semua produk" }, ...(products.data?.products ?? []).map((p) => ({ value: String(p.product_id), label: p.name, hint: `stok ${p.stock}` }))]}
        />
      </div>
      <DateRangeFilter value={range} onChange={setRange} allowAll />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Jenis pergerakan">
        {TYPE_CHIPS.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={type === c.id} onClick={() => setType(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {moves.isLoading && <LoadingRows />}
      {moves.isError && <ErrorBox error={moves.error} />}
      {moves.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>Belum ada pergerakan stok untuk filter ini. Barang masuk, penjualan kiosk dan opname muncul di sini.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Produk</th>
                <th>Jenis</th>
                <th className="text-right">Perubahan</th>
                <th className="text-right">Stok setelah</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const t = MOVE_LABEL[m.type];
                return (
                  <tr key={m.id}>
                    <td data-label="Waktu" className="whitespace-nowrap tabular-nums">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td data-primary className="font-bold">
                      {m.product_name}
                    </td>
                    <td data-label="Jenis">
                      <span className={cn("pill", t.pill)}>{t.label}</span>
                    </td>
                    <td data-label="Perubahan" className={cn("font-bold tabular-nums md:text-right", m.qty < 0 ? "text-destructive" : "text-success")}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </td>
                    <td data-label="Stok setelah" className="tabular-nums md:text-right">
                      {m.qty_after ?? "–"}
                    </td>
                    <td data-label="Keterangan" className="max-w-sm">
                      <span className="block">{m.note ?? "–"}</span>
                      <span className="t-label mt-0.5 block">
                        {[m.ref, m.unit_cost !== null ? `modal ${formatIDR(m.unit_cost)}` : null, m.created_by && `oleh ${m.created_by}`].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {moves.hasNextPage && (
        <button className="btn btn-secondary self-center" onClick={() => void moves.fetchNextPage()} disabled={moves.isFetchingNextPage}>
          {moves.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </div>
  );
}
