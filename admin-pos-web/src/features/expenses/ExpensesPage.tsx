import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconTrash } from "../../components/Icons";
import { NumberInput } from "../../components/NumberInput";
import { Select } from "../../components/Select";
import { DateRangeFilter, ErrorBox, LoadingRows, PageHeader, rangeOf, type DayRange } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDay, formatIDR, todayWIB } from "../../lib/format";
import type { Expense } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { useBranch, useBranchId } from "../branch/BranchProvider";

const EXPENSES_KEY = "expenses";
const NEW_CATEGORY = "__new__";

interface ExpensesResponse {
  expenses: Expense[];
  total: number;
  categories: string[];
}

// Tambah (expense undefined) atau ubah satu catatan biaya.
function ExpenseForm({ expense, categories, onDone, onCancel }: { expense?: Expense; categories: string[]; onDone: () => void; onCancel?: () => void }) {
  const branchId = useBranchId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(expense?.spent_on ?? todayWIB());
  const [category, setCategory] = useState(expense?.category ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [note, setNote] = useState(expense?.note ?? "");
  // Kategori dipilih dari dropdown; "Kategori baru…" membuka kolom untuk menulis kategori sendiri.
  const [custom, setCustom] = useState(false);
  const options = categories.includes(category) || category === "" ? categories : [category, ...categories];
  const valid = day !== "" && category.trim() !== "" && Number(amount) > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = { spent_on: day, category: category.trim(), amount: Number(amount), note: note.trim() || null };
      return expense ? api.patch<Expense>(`/expenses/${expense.id}`, body) : api.post<Expense>("/expenses", { ...body, branch_id: branchId });
    },
    onSuccess: (e) => {
      toast("success", `${e.category} ${formatIDR(e.amount)} ${expense ? "disimpan" : "dicatat"}`);
      if (!expense) {
        setAmount("");
        setNote("");
      }
      void queryClient.invalidateQueries({ queryKey: [EXPENSES_KEY, branchId] });
      void queryClient.invalidateQueries({ queryKey: ["report"] });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Kategori</span>
        <Select
          label="Kategori biaya"
          className="w-full"
          value={custom ? NEW_CATEGORY : category}
          onChange={(v) => {
            if (v === NEW_CATEGORY) {
              setCustom(true);
              setCategory("");
            } else {
              setCustom(false);
              setCategory(v);
            }
          }}
          options={[
            ...(category === "" && !custom ? [{ value: "", label: "Pilih kategori", disabled: true }] : []),
            ...options.map((c) => ({ value: c, label: c })),
            { value: NEW_CATEGORY, label: "+ Kategori baru…" },
          ]}
        />
        {custom && (
          <input
            className="field"
            value={category}
            maxLength={40}
            autoFocus
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Nama kategori baru, mis. Perbaikan"
            aria-label="Nama kategori baru"
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="field-label flex flex-col gap-1.5">
          Jumlah
          <NumberInput prefix="Rp" maxDigits={10} className="text-lg font-bold" value={amount} onValueChange={setAmount} />
        </label>
        <label className="field-label flex flex-col gap-1.5">
          Tanggal
          <input type="date" className="field tabular-nums" max={todayWIB()} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      <label className="field-label flex flex-col gap-1.5">
        Catatan
        <input className="field" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="mis. Token listrik November, gaji Andi minggu ke-3" />
      </label>
      {save.isError && <ErrorBox error={save.error} />}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={save.isPending}>
            Batal
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? "Menyimpan…" : expense ? "Simpan" : "Catat biaya"}
        </button>
      </div>
    </form>
  );
}

export function ExpensesPage() {
  const branchId = useBranchId();
  const { branchName } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DayRange | null>(() => rangeOf("month"));
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [filterCategory, setFilterCategory] = useState("");

  const list = useQuery({
    queryKey: [EXPENSES_KEY, branchId, range?.from, range?.to],
    queryFn: () => api.get<ExpensesResponse>("/expenses", { branch_id: branchId, date_from: range?.from, date_to: range?.to }),
    placeholderData: keepPreviousData,
  });
  const allRows = list.data?.expenses ?? [];
  const rows = filterCategory ? allRows.filter((e) => e.category === filterCategory) : allRows;
  const filteredTotal = rows.reduce((s, e) => s + e.amount, 0);
  const categories = list.data?.categories ?? [];
  const usedCategories = [...new Set(allRows.map((e) => e.category))].sort();
  const byCategory = Object.entries(rows.reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + e.amount), m), {})).sort((a, b) => b[1] - a[1]);

  const remove = useMutation({
    mutationFn: (e: Expense) => api.del(`/expenses/${e.id}`),
    onSuccess: () => {
      toast("success", "Catatan biaya dihapus");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: [EXPENSES_KEY, branchId] });
      void queryClient.invalidateQueries({ queryKey: ["report"] });
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Biaya"
        description={`Pengeluaran operasional ${branchName ?? "toko"}: listrik, sewa, gaji, plastik, dan lainnya. Dipakai untuk menghitung laba bersih. Belanja barang dagangan dicatat di Stok → Barang masuk, bukan di sini.`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[24rem_1fr]">
        <section className="card flex flex-col gap-4 self-start">
          <h2 className="t-title">Catat biaya</h2>
          <ExpenseForm categories={categories} onDone={() => {}} />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="section-head">
            <h2 className="t-title">Riwayat biaya</h2>
            <span className="t-label tabular-nums">{rows.length} catatan</span>
          </div>
          <DateRangeFilter value={range} onChange={setRange} allowAll />
          <Select
            label="Filter kategori"
            className="w-full sm:w-64"
            active={filterCategory !== ""}
            value={filterCategory}
            onChange={setFilterCategory}
            options={[{ value: "", label: "Semua kategori" }, ...usedCategories.map((c) => ({ value: c, label: c }))]}
          />
          {list.isLoading && <LoadingRows />}
          {list.isError && <ErrorBox error={list.error} />}
          {list.data && (
            <div className="panel-ink flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="t-label">Total biaya {filterCategory ? `${filterCategory} ` : ""}{range ? "di rentang ini" : "semua"}</p>
                <p className="t-figure">{formatIDR(filterCategory ? filteredTotal : list.data.total)}</p>
              </div>
              {!filterCategory && byCategory.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
                  {byCategory.slice(0, 6).map(([c, a]) => (
                    <div key={c} className="contents">
                      <dt className="text-rail-muted">{c}</dt>
                      <dd className="font-bold tabular-nums">{formatIDR(a)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {list.isSuccess && rows.length === 0 && (
            <div className="empty-state">
              <p>Belum ada biaya di rentang ini. Catat listrik, sewa, gaji dan pengeluaran toko lain supaya laba bersih di Laporan akurat.</p>
            </div>
          )}
          {rows.length > 0 && (
            <div className="card overflow-hidden overflow-x-auto p-0 md:p-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Kategori</th>
                    <th>Catatan</th>
                    <th className="text-right">Jumlah</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Tanggal" className="whitespace-nowrap tabular-nums">
                        {formatDay(e.spent_on, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td data-primary className="font-bold">
                        {e.category}
                      </td>
                      <td data-label="Catatan" className="max-w-xs">
                        {e.note ?? <span className="text-muted-foreground">–</span>}
                        {e.created_by && <span className="t-label mt-0.5 block">oleh {e.created_by}</span>}
                      </td>
                      <td data-label="Jumlah" className="font-bold tabular-nums md:text-right">
                        {formatIDR(e.amount)}
                      </td>
                      <td data-actions className="whitespace-nowrap md:text-right">
                        <span className="inline-flex gap-2">
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(e)}>
                            Ubah
                          </button>
                          <button className="icon-btn size-9" aria-label={`Hapus ${e.category} ${formatIDR(e.amount)}`} onClick={() => setDeleting(e)}>
                            <IconTrash />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {editing && (
        <Dialog title="Ubah biaya">
          <ExpenseForm expense={editing} categories={categories} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Hapus catatan biaya?">
          <p className="text-muted-foreground">
            {deleting.category} {formatIDR(deleting.amount)} tanggal {formatDay(deleting.spent_on, { day: "numeric", month: "long", year: "numeric" })} dihapus permanen dan laba bersih dihitung ulang.
          </p>
          {remove.isError && <ErrorBox error={remove.error} />}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Batal
            </button>
            <button className="btn btn-danger" onClick={() => remove.mutate(deleting)} disabled={remove.isPending}>
              {remove.isPending ? "Menghapus…" : "Hapus"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
