import { useDeferredValue, useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconAlert, IconPrinter } from "../../components/Icons";
import { Segmented } from "../../components/Segmented";
import { Select } from "../../components/Select";
import { DateRangeFilter, ErrorBox, LoadingRows, OrderStatusPill, PageHeader, SearchField, rangeOf, type DayRange } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDateTime, formatIDR, formatTime } from "../../lib/format";
import type { OrderDetail, OrderRow, OrderStatus } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranchId } from "../branch/BranchProvider";
import { PRODUCTS_KEY } from "../products/ProductsSection";
import { Receipt, type Paper } from "./Receipt";

const ORDERS_KEY = "orders";

interface OrdersResponse {
  orders: OrderRow[];
  page: number;
  has_more: boolean;
  counts: Record<OrderStatus | "all" | "paid_late", number>;
}

type Tab = "all" | OrderStatus;

const CONFIRMED_BY: Record<string, string> = { webhook: "otomatis (gateway)", poll: "otomatis (cek status)", staff: "staf / admin" };

function readPaper(): Paper {
  try {
    return localStorage.getItem("admin-pos-paper") === "80" ? "80" : "58";
  } catch {
    return "58";
  }
}

function OrderDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const branchId = useBranchId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"paid" | "cancel" | null>(null);
  const [paper, setPaper] = useState<Paper>(readPaper);
  const [printing, setPrinting] = useState(false);
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });

  const refresh = (o: OrderDetail) => {
    queryClient.setQueryData(["order", id], o);
    void queryClient.invalidateQueries({ queryKey: [ORDERS_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: ["report"] });
  };
  const markPaid = useMutation({
    mutationFn: () => api.post<OrderDetail>(`/orders/${id}/mark-paid`),
    onSuccess: (o) => {
      refresh(o);
      setConfirm(null);
      toast("success", `${o.order_number} ditandai lunas. Stok sudah dipotong.`);
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.post<OrderDetail>(`/orders/${id}/cancel`),
    onSuccess: (o) => {
      refresh(o);
      setConfirm(null);
      toast("success", `${o.order_number} dibatalkan`);
    },
  });

  // Render struk dulu, baru print di frame berikutnya.
  useEffect(() => {
    if (!printing) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [printing]);

  const o = order.data;
  const busy = markPaid.isPending || cancel.isPending;
  const late = o?.payments.some((p) => p.status === "PAID_LATE");

  return (
    <Dialog title={o ? `Order ${o.order_number}` : "Order"} wide>
      {order.isLoading && <LoadingRows rows={3} className="h-10" />}
      {order.isError && <ErrorBox error={order.error} />}
      {o && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <OrderStatusPill status={o.status} />
            <span className="tabular-nums">Dibuat {formatDateTime(o.created_at)}</span>
            {o.paid_at && <span className="tabular-nums">Lunas {formatDateTime(o.paid_at)}</span>}
          </div>
          {o.cancel_reason && <p className="notice">{o.cancel_reason}</p>}
          {late && (
            <p className="stock-warning" role="alert">
              <IconAlert className="mt-0.5 shrink-0 text-xl" />
              <span>Uang masuk setelah order kedaluwarsa/dibatalkan (PAID_LATE). Cek mutasi, lalu tandai lunas atau refund pelanggan.</span>
            </p>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Barang</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Harga</th>
                  <th className="text-right">Modal</th>
                  <th className="text-right">Subtotal</th>
                  <th className="text-right">Laba</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.product_id}>
                    <td data-primary className="font-semibold">
                      {i.name}
                    </td>
                    <td data-label="Qty" className="tabular-nums md:text-right">
                      {i.qty}
                    </td>
                    <td data-label="Harga" className="tabular-nums md:text-right">
                      {formatIDR(i.unit_price)}
                    </td>
                    <td data-label="Modal" className="tabular-nums md:text-right">
                      {formatIDR(i.cost_price)}
                    </td>
                    <td data-label="Subtotal" className="font-bold tabular-nums md:text-right">
                      {formatIDR(i.subtotal)}
                    </td>
                    <td data-label="Laba" className={cn("tabular-nums md:text-right", i.profit !== null && i.profit < 0 && "text-destructive")}>
                      {i.profit === null ? <span className="text-muted-foreground">modal kosong</span> : formatIDR(i.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="spec-list">
            <dt>Total</dt>
            <dd className="text-lg font-extrabold tabular-nums">{formatIDR(o.total)}</dd>
            <dt>Modal (HPP)</dt>
            <dd className="tabular-nums">{formatIDR(o.cost)}</dd>
            <dt>Laba kotor</dt>
            <dd className="tabular-nums">{formatIDR(o.profit)}</dd>
            <dt>Pembayaran</dt>
            <dd>
              {o.payment_method}
              {o.payment && (
                <span className="t-label ml-2">
                  {o.payment.provider} · {o.payment.status}
                  {o.payment.confirmed_by && ` · dikonfirmasi ${CONFIRMED_BY[o.payment.confirmed_by] ?? o.payment.confirmed_by}`}
                </span>
              )}
            </dd>
          </dl>
          {o.status === "PENDING_PAYMENT" && (
            <p className="notice">Mode QRIS manual: cocokkan nominal {formatIDR(o.total)} di aplikasi merchant QRIS sebelum menandai lunas.</p>
          )}
          {(markPaid.isError || cancel.isError) && <ErrorBox error={markPaid.error ?? cancel.error} />}
          <div className="dialog-footer flex-wrap">
            {o.status === "PAID" && (
              <span className="mr-auto flex items-center gap-2">
                <Select<Paper>
                  label="Kertas"
                  className="w-32"
                  value={paper}
                  onChange={(p) => {
                    setPaper(p);
                    try {
                      localStorage.setItem("admin-pos-paper", p);
                    } catch {
                      /* private mode */
                    }
                  }}
                  options={[
                    { value: "58", label: "58 mm" },
                    { value: "80", label: "80 mm" },
                  ]}
                />
                <button className="btn btn-secondary" onClick={() => setPrinting(true)}>
                  <IconPrinter /> Cetak ulang struk
                </button>
              </span>
            )}
            {o.status === "PENDING_PAYMENT" && (
              <button className="btn btn-danger-quiet mr-auto" onClick={() => setConfirm("cancel")} disabled={busy}>
                Batalkan order
              </button>
            )}
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Tutup
            </button>
            {o.status !== "PAID" && (
              <button className="btn btn-primary" onClick={() => setConfirm("paid")} disabled={busy}>
                {o.status === "PENDING_PAYMENT" ? "Tandai lunas" : "Ternyata sudah bayar"}
              </button>
            )}
          </div>
          {printing && <Receipt order={o} paper={paper} />}
        </div>
      )}
      {confirm && o && (
        <Dialog title={confirm === "paid" ? `Tandai ${o.order_number} lunas?` : `Batalkan ${o.order_number}?`}>
          <p className="text-muted-foreground">
            {confirm === "paid"
              ? `Pastikan uang ${formatIDR(o.total)} sudah masuk di aplikasi merchant. Stok ${o.item_count} barang akan dipotong dan order masuk laporan.`
              : "Order dibatalkan dan tidak bisa dibayar lagi. Stok tidak berubah karena belum dipotong."}
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Kembali
            </button>
            {confirm === "paid" ? (
              <button className="btn btn-primary" onClick={() => markPaid.mutate()} disabled={busy}>
                {markPaid.isPending ? "Memproses…" : "Ya, sudah lunas"}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => cancel.mutate()} disabled={busy}>
                {cancel.isPending ? "Memproses…" : "Ya, batalkan"}
              </button>
            )}
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

export function OrdersPage() {
  const branchId = useBranchId();
  const [tab, setTab] = useState<Tab>("all");
  const [range, setRange] = useState<DayRange | null>(() => rangeOf("today"));
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [openId, setOpenId] = useState<number | null>(null);

  const orders = useInfiniteQuery({
    queryKey: [ORDERS_KEY, branchId, tab, range?.from, range?.to, q],
    queryFn: ({ pageParam }) =>
      api.get<OrdersResponse>("/orders", {
        branch_id: branchId,
        status: tab === "all" ? undefined : tab,
        date_from: range?.from,
        date_to: range?.to,
        q: q || undefined,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    // Order kiosk baru masuk terus; segarkan diam-diam.
    refetchInterval: 15_000,
  });
  const rows = orders.data?.pages.flatMap((p) => p.orders) ?? [];
  const counts = orders.data?.pages[0]?.counts;
  const count = (id: Tab) => counts?.[id] ?? 0;
  const paidRows = rows.filter((o) => o.status === "PAID");
  const sum = paidRows.reduce((s, o) => s + o.total, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PageHeader title="Transaksi" description="Order dari kiosk. Order menunggu bayar bisa ditandai lunas atau dibatalkan dari sini saat QRIS masih manual." />
      {count("PENDING_PAYMENT") > 0 && tab !== "PENDING_PAYMENT" && (
        <div className="stock-warning" role="status">
          <IconAlert className="mt-0.5 shrink-0 text-xl" />
          <p className="min-w-0 flex-1 font-bold">{count("PENDING_PAYMENT")} order menunggu pembayaran</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab("PENDING_PAYMENT")}>
            Lihat
          </button>
        </div>
      )}
      <Segmented
        label="Status order"
        value={tab}
        onChange={setTab}
        className="w-full lg:w-[40rem]"
        items={(
          [
            ["all", "Semua"],
            ["PENDING_PAYMENT", "Menunggu"],
            ["PAID", "Lunas"],
            ["CANCELLED", "Batal"],
            ["EXPIRED", "Kedaluwarsa"],
          ] as [Tab, string][]
        ).map(([id, label]) => ({
          id,
          title: label,
          label: (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-base font-extrabold tabular-nums">{count(id)}</span>
              <span>{label}</span>
            </span>
          ),
        }))}
      />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <SearchField value={search} onChange={setSearch} label="Cari nomor order" placeholder="Cari nomor order, mis. K261122-0008" className="xl:max-w-xs" />
        <DateRangeFilter value={range} onChange={setRange} allowAll />
      </div>
      {orders.isLoading && <LoadingRows />}
      {orders.isError && <ErrorBox error={orders.error} />}
      {orders.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>Belum ada order untuk filter ini. Order baru muncul di sini begitu pelanggan menekan “Bayar dengan QRIS” di kiosk.</p>
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="card animate-rise overflow-hidden overflow-x-auto p-0 md:p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Waktu</th>
                  <th className="text-right">Barang</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Laba</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td data-primary>
                      <span className="block font-extrabold tracking-tight tabular-nums">{o.order_number}</span>
                      {o.payment && <span className="t-label mt-0.5 block">QRIS {o.payment.provider}</span>}
                    </td>
                    <td data-label="Waktu" className="whitespace-nowrap tabular-nums">
                      {range && range.from === range.to ? formatTime(o.created_at) : formatDateTime(o.created_at)}
                    </td>
                    <td data-label="Barang" className="tabular-nums md:text-right">
                      {o.item_count}
                    </td>
                    <td data-label="Total" className="font-bold tabular-nums md:text-right">
                      {formatIDR(o.total)}
                    </td>
                    <td data-label="Laba" className="tabular-nums md:text-right">
                      {o.status === "PAID" ? formatIDR(o.profit) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td data-label="Status">
                      <OrderStatusPill status={o.status} />
                    </td>
                    <td data-actions className="md:text-right">
                      <button className={cn("btn btn-sm", o.status === "PENDING_PAYMENT" ? "btn-primary" : "btn-secondary")} onClick={() => setOpenId(o.id)}>
                        {o.status === "PENDING_PAYMENT" ? "Proses" : "Detail"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-label self-end tabular-nums">
            {paidRows.length} lunas di daftar ini · total <span className="text-foreground">{formatIDR(sum)}</span>
          </p>
        </>
      )}
      {orders.hasNextPage && (
        <button className="btn btn-secondary self-center" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>
          {orders.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
      {openId !== null && <OrderDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
