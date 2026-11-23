import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconAlert, IconDownload } from "../../components/Icons";
import { Segmented } from "../../components/Segmented";
import { DateRangeFilter, ErrorBox, LoadingRows, PageHeader, ProductThumb, rangeOf, type DayRange } from "../../components/ui";
import { api, url } from "../../lib/api";
import { formatDay, formatIDR, formatNumber } from "../../lib/format";
import type { ProductSales, ReportSummary, Totals } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useBranch, useBranchId } from "../branch/BranchProvider";
import { ChartLegend, SalesChart } from "./SalesChart";

type NavTarget = "transaksi" | "stok" | "produk" | "biaya";

const pct = (v: number | null) => (v === null ? "–" : `${String(v).replace(".", ",")}%`);

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="card flex flex-col gap-1.5">
      <p className="t-label">{label}</p>
      <p className={cn("text-2xl font-extrabold tracking-tight tabular-nums", tone === "danger" && "text-destructive")}>{value}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TodayPanel({ t, pending, onNavigate }: { t: Totals; pending: number; onNavigate: (p: NavTarget) => void }) {
  return (
    <section className="panel-ink flex flex-col gap-5 md:flex-row md:items-end md:gap-14" aria-label="Penjualan hari ini">
      <div className="flex flex-col gap-1">
        <p className="t-label">Omzet hari ini</p>
        <p className="t-figure">{formatIDR(t.omzet)}</p>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {(
          [
            ["Laba kotor", formatIDR(t.laba_kotor)],
            ["Biaya hari ini", formatIDR(t.biaya)],
            ["Laba bersih", formatIDR(t.laba_bersih)],
            ["Transaksi", formatNumber(t.transactions)],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="t-label">{k}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {pending > 0 && (
        <button className="btn btn-invert shrink-0" onClick={() => onNavigate("transaksi")}>
          {pending} menunggu bayar
        </button>
      )}
    </section>
  );
}

// Satu baris "rumus" dalam laporan: label kiri, angka kanan; baris hasil ditebalkan dengan garis di atasnya.
function Line({ label, value, sign, strong, hint, tone }: { label: string; value: number; sign?: "-" | "="; strong?: boolean; hint?: string; tone?: "danger" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong && "border-t border-foreground pt-3")}>
      <span className={cn("min-w-0", strong ? "font-bold" : "text-muted-foreground")}>
        {sign && <span className="mr-1.5 inline-block w-3 text-center font-bold text-foreground">{sign === "-" ? "−" : "="}</span>}
        {label}
        {hint && <span className="t-label ml-2">{hint}</span>}
      </span>
      <span className={cn("shrink-0 tabular-nums", strong ? "text-xl font-extrabold" : "font-semibold", tone === "danger" && "text-destructive")}>
        {formatIDR(value)}
      </span>
    </div>
  );
}

function FinanceSection({ t, onNavigate }: { t: Totals; onNavigate: (p: NavTarget) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card flex flex-col" aria-labelledby="laba-title">
        <h3 id="laba-title" className="font-bold">
          Laba
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">Dari barang yang terjual. Modal = harga modal saat barang itu terjual.</p>
        <Line label="Omzet (penjualan lunas)" value={t.omzet} />
        <Line sign="-" label="Modal barang terjual (HPP)" value={t.hpp} />
        <Line sign="=" label="Laba kotor" value={t.laba_kotor} strong hint={`margin ${pct(t.margin_pct)}`} tone={t.laba_kotor < 0 ? "danger" : undefined} />
        <Line sign="-" label="Biaya operasional" value={t.biaya} />
        {t.biaya_per_kategori.length > 0 && (
          <ul className="-mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-3 text-sm">
            {t.biaya_per_kategori.map((c) => (
              <li key={c.category} className="flex justify-between gap-3 text-muted-foreground">
                <span>{c.category}</span>
                <span className="tabular-nums">{formatIDR(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <Line sign="=" label="Laba bersih" value={t.laba_bersih} strong hint={`margin ${pct(t.margin_bersih_pct)}`} tone={t.laba_bersih < 0 ? "danger" : undefined} />
        <div className="mt-auto pt-3">
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("biaya")}>
            Catat biaya
          </button>
        </div>
      </section>

      <section className="card flex flex-col" aria-labelledby="kas-title">
        <h3 id="kas-title" className="font-bold">
          Arus uang
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">Uang yang benar-benar masuk dan keluar di rentang ini.</p>
        <Line label="Uang masuk dari penjualan" value={t.kas_masuk} />
        <Line
          sign="-"
          label="Belanja barang"
          value={t.pembelian}
          hint={t.pembelian_lines ? `${formatNumber(t.pembelian_qty)} unit, ${t.pembelian_lines} baris` : undefined}
        />
        <Line sign="-" label="Biaya operasional" value={t.biaya} />
        <Line sign="=" label="Selisih uang" value={t.kas_bersih} strong tone={t.kas_bersih < 0 ? "danger" : undefined} />
        <p className="mt-2 text-sm text-muted-foreground">
          Selisih uang bisa minus saat baru belanja stok. Itu bukan rugi: barangnya ada di rak (lihat nilai stok di Produk) dan jadi modal saat terjual.
        </p>
        {t.pembelian_tanpa_modal > 0 && (
          <p className="notice mt-2 text-sm">{t.pembelian_tanpa_modal} baris barang masuk tanpa modal per unit, jadi belanjanya dihitung Rp0.</p>
        )}
        <div className="mt-auto pt-3">
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("stok")}>
            Catat barang masuk
          </button>
        </div>
      </section>
    </div>
  );
}

type ProductSort = "qty" | "laba" | "margin";

function ProductTable({ rows }: { rows: ProductSales[] }) {
  const [sort, setSort] = useState<ProductSort>("qty");
  const [all, setAll] = useState(false);
  const sorted = [...rows].sort((a, b) =>
    sort === "qty" ? b.qty - a.qty || b.omzet - a.omzet : sort === "laba" ? b.laba - a.laba : (b.margin_pct ?? -1e9) - (a.margin_pct ?? -1e9),
  );
  const shown = all ? sorted : sorted.slice(0, 10);
  return (
    <section className="flex flex-col gap-3">
      <div className="section-head">
        <h2 className="t-title">Penjualan per produk</h2>
        <span className="t-label tabular-nums">{rows.length} produk terjual</span>
      </div>
      <Segmented<ProductSort>
        label="Urutkan"
        value={sort}
        onChange={setSort}
        className="w-full sm:w-[26rem]"
        items={[
          { id: "qty", label: "Terlaris", title: "Urut jumlah terjual" },
          { id: "laba", label: "Laba terbesar", title: "Urut laba kotor" },
          { id: "margin", label: "Margin %", title: "Urut persentase margin" },
        ]}
      />
      {rows.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada penjualan lunas di rentang ini.</p>
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Produk</th>
                <th className="text-right">Terjual</th>
                <th className="text-right">Omzet</th>
                <th className="text-right">Modal</th>
                <th className="text-right">Laba kotor</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={p.product_id}>
                  <td data-label="#" className="tabular-nums text-muted-foreground">
                    {i + 1}
                  </td>
                  <td data-primary>
                    <span className="block font-bold">{p.name}</span>
                    {p.missing_cost_lines > 0 && <span className="t-label mt-0.5 block text-warning">{p.missing_cost_lines} baris tanpa modal (dihitung 0)</span>}
                  </td>
                  <td data-label="Terjual" className="font-bold tabular-nums md:text-right">
                    {formatNumber(p.qty)}
                  </td>
                  <td data-label="Omzet" className="tabular-nums md:text-right">
                    {formatIDR(p.omzet)}
                  </td>
                  <td data-label="Modal" className="tabular-nums md:text-right">
                    {formatIDR(p.hpp)}
                  </td>
                  <td data-label="Laba kotor" className={cn("font-bold tabular-nums md:text-right", p.laba < 0 && "text-destructive")}>
                    {formatIDR(p.laba)}
                  </td>
                  <td data-label="Margin" className="tabular-nums md:text-right">
                    {pct(p.margin_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 10 && (
        <button className="btn btn-secondary btn-sm self-center" onClick={() => setAll(!all)}>
          {all ? "Tampilkan 10 teratas" : `Tampilkan semua (${rows.length})`}
        </button>
      )}
    </section>
  );
}

const EXPORTS: { kind: string; label: string }[] = [
  { kind: "daily", label: "Keuangan harian" },
  { kind: "purchases", label: "Belanja barang" },
  { kind: "expenses", label: "Biaya" },
  { kind: "products", label: "Per produk" },
  { kind: "orders", label: "Transaksi" },
  { kind: "items", label: "Item terjual" },
];

export function ReportsPage({ onNavigate }: { onNavigate: (p: NavTarget) => void }) {
  const branchId = useBranchId();
  const { branchName } = useBranch();
  const [range, setRange] = useState<DayRange>(() => rangeOf("7d"));
  const [view, setView] = useState<"chart" | "table">("chart");

  const report = useQuery({
    queryKey: ["report", branchId, range.from, range.to],
    queryFn: () => api.get<ReportSummary>("/reports/summary", { branch_id: branchId, date_from: range.from, date_to: range.to }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const r = report.data;
  const t = r?.range;
  const days = r ? r.daily.length : 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Laporan" description={`Penjualan kiosk ${branchName ?? ""} yang sudah lunas, biaya, laba bersih dan arus uang.`} />
      {report.isLoading && <LoadingRows rows={3} className="h-24" />}
      {report.isError && <ErrorBox error={report.error} />}
      {r && (
        <>
          <TodayPanel t={r.today} pending={r.pending_orders} onNavigate={onNavigate} />

          <section className="flex flex-col gap-4">
            <div className="section-head">
              <h2 className="t-title">
                {range.from === range.to ? formatDay(range.from, { weekday: "long", day: "numeric", month: "long" }) : `${formatDay(range.from, { day: "numeric", month: "short" })} – ${formatDay(range.to, { day: "numeric", month: "short", year: "numeric" })}`}
              </h2>
              <span className="t-label tabular-nums">{days} hari</span>
            </div>
            <DateRangeFilter value={range} onChange={(v) => v && setRange(v)} />
            {t && t.missing_cost_lines > 0 && (
              <div className="stock-warning" role="status">
                <IconAlert className="mt-0.5 shrink-0 text-xl" />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-bold">{t.missing_cost_lines} item terjual tanpa harga modal</span>, jadi modalnya dihitung 0 dan laba terlihat lebih besar. Isi modal di menu Produk supaya penjualan berikutnya benar.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("produk")}>
                  Isi modal
                </button>
              </div>
            )}
            {t && (
              <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-5", report.isPlaceholderData && "opacity-60")}>
                <Stat label="Omzet" value={formatIDR(t.omzet)} hint={`${formatNumber(t.items_sold)} barang terjual`} />
                <Stat label="Laba kotor" value={formatIDR(t.laba_kotor)} hint={`Margin ${pct(t.margin_pct)}`} tone={t.laba_kotor < 0 ? "danger" : undefined} />
                <Stat label="Biaya operasional" value={formatIDR(t.biaya)} hint={`${t.biaya_per_kategori.length} kategori`} />
                <Stat label="Laba bersih" value={formatIDR(t.laba_bersih)} hint={`Margin ${pct(t.margin_bersih_pct)}`} tone={t.laba_bersih < 0 ? "danger" : undefined} />
                <Stat
                  label="Transaksi"
                  value={formatNumber(t.transactions)}
                  hint={`rata-rata ${formatIDR(t.avg_basket)}${days > 1 ? ` · ${(t.transactions / days).toFixed(1).replace(".", ",")}/hari` : ""}`}
                />
              </div>
            )}
            {t && <FinanceSection t={t} onNavigate={onNavigate} />}

            <div className="card flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Penjualan harian</h3>
                  <ChartLegend />
                </div>
                <Segmented
                  label="Tampilan"
                  value={view}
                  onChange={setView}
                  className="w-48"
                  items={[
                    { id: "chart", label: "Grafik" },
                    { id: "table", label: "Tabel" },
                  ]}
                />
              </div>
              {view === "chart" ? (
                <SalesChart rows={r.daily} />
              ) : (
                <div className="max-h-[22rem] overflow-auto rounded-lg border border-border">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th className="text-right">Transaksi</th>
                        <th className="text-right">Omzet</th>
                        <th className="text-right">Modal</th>
                        <th className="text-right">Laba kotor</th>
                        <th className="text-right">Biaya</th>
                        <th className="text-right">Laba bersih</th>
                        <th className="text-right">Belanja barang</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...r.daily].reverse().map((d) => (
                        <tr key={d.date}>
                          <td data-primary>{formatDay(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                          <td data-label="Transaksi" className="tabular-nums md:text-right">
                            {d.transactions}
                          </td>
                          <td data-label="Omzet" className="font-bold tabular-nums md:text-right">
                            {formatIDR(d.omzet)}
                          </td>
                          <td data-label="Modal" className="tabular-nums md:text-right">
                            {formatIDR(d.hpp)}
                          </td>
                          <td data-label="Laba kotor" className="tabular-nums md:text-right">
                            {formatIDR(d.laba_kotor)}
                          </td>
                          <td data-label="Biaya" className="tabular-nums md:text-right">
                            {formatIDR(d.biaya)}
                          </td>
                          <td data-label="Laba bersih" className={cn("font-bold tabular-nums md:text-right", d.laba_bersih < 0 && "text-destructive")}>
                            {formatIDR(d.laba_bersih)}
                          </td>
                          <td data-label="Belanja barang" className="tabular-nums md:text-right">
                            {formatIDR(d.pembelian)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <ProductTable rows={r.products} />

          <section className="flex flex-col gap-3">
            <div className="section-head">
              <h2 className="t-title">Stok menipis</h2>
              <span className="t-label tabular-nums">{r.low_stock.length} produk</span>
            </div>
            {r.low_stock.length === 0 ? (
              <div className="empty-state">
                <p>Semua produk yang dijual masih di atas batas menipis.</p>
              </div>
            ) : (
              <>
                <ul className="list">
                  {r.low_stock.map((p) => (
                    <li key={p.product_id} className="list-row">
                      <ProductThumb src={p.image_url} size="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{p.name}</span>
                        <span className="t-label mt-0.5 block">Batas menipis {p.min_qty}</span>
                      </span>
                      <span className={cn("pill pill-dot tabular-nums", p.stock <= 0 ? "pill-danger" : "pill-warning")}>{p.stock <= 0 ? `Habis (${p.stock})` : `Sisa ${p.stock}`}</span>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-secondary btn-sm self-start" onClick={() => onNavigate("stok")}>
                  Catat barang masuk
                </button>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="section-head">
              <h2 className="t-title">Unduh CSV</h2>
              <span className="t-label">Rentang yang dipilih, pemisah titik koma (Excel)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((e) => (
                <a key={e.kind} className="btn btn-secondary" href={url("/reports/export", { branch_id: branchId, kind: e.kind, date_from: range.from, date_to: range.to })} download>
                  <IconDownload /> {e.label}
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
