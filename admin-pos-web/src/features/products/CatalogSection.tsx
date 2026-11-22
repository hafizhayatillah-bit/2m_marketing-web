import { useDeferredValue, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconImage, IconTrash } from "../../components/Icons";
import { ErrorBox, LoadingRows, ProductThumb, SearchField } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatIDR } from "../../lib/format";
import { compressImage } from "../../lib/image";
import type { CatalogProduct } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { PRODUCTS_KEY } from "./ProductsSection";

const CATALOG_KEY = "catalog";
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

function CatalogDialog({ product, categories, onClose }: { product?: CatalogProduct; categories: string[]; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [active, setActive] = useState(product?.is_active ?? true);
  const fileInput = useRef<HTMLInputElement>(null);

  const skuValue = sku.trim().toUpperCase();
  const skuInvalid = skuValue !== "" && !SKU.test(skuValue);
  const invalid = !name.trim() || !category.trim() || skuInvalid;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append("file", new File([blob], "produk.jpg", { type: "image/jpeg" }));
      return api.upload<{ url: string }>("/catalog/upload-image", form);
    },
    onSuccess: (r) => setImageUrl(r.url),
    onError: (e) => toast("error", errorMessage(e)),
  });

  const body = {
    name: name.trim(),
    sku: skuValue || null,
    category: category.trim().toLowerCase(),
    description: description.trim() || null,
    image_url: imageUrl,
    is_active: active,
  };
  const dirty =
    !product ||
    body.name !== product.name ||
    body.sku !== product.sku ||
    body.category !== product.category ||
    body.description !== (product.description ?? null) ||
    body.image_url !== product.image_url ||
    body.is_active !== product.is_active;

  const save = useMutation({
    mutationFn: () => (product ? api.patch<CatalogProduct>(`/catalog/${product.id}`, body) : api.post<CatalogProduct>("/catalog", body)),
    onSuccess: (p) => {
      toast("success", product ? `${p.name} disimpan` : `${p.name} masuk katalog. Tambahkan ke cabang lewat tab Produk.`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
  const busy = save.isPending || upload.isPending;

  return (
    <Dialog title={product ? `Ubah ${product.name}` : "Produk baru"} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid && !busy) save.mutate();
        }}
      >
        {product && product.branches.length > 0 && (
          <p className="notice">Berlaku di semua cabang yang menjual produk ini dan di website ({product.branches.map((b) => b.name).join(", ")}).</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[9rem_1fr]">
          <div className="flex flex-col gap-2">
            <span className="field-label">Foto</span>
            <span className="photo-tile relative flex aspect-square w-full items-center justify-center text-3xl text-muted-foreground">
              {imageUrl ? <img src={imageUrl} alt="" /> : <IconImage />}
              {upload.isPending && <span className="photo-tile-state">Mengunggah…</span>}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              {imageUrl ? "Ganti foto" : "Unggah foto"}
            </button>
            {imageUrl && (
              <button type="button" className="btn btn-danger-quiet btn-sm" onClick={() => setImageUrl(null)} disabled={busy}>
                <IconTrash /> Hapus foto
              </button>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <label className="field-label flex flex-col gap-1.5">
              Nama
              <input className="field" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus={!product} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="field-label flex flex-col gap-1.5">
                SKU
                <input
                  className="field uppercase tabular-nums"
                  value={sku}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(e) => setSku(e.target.value.replace(/\s/g, ""))}
                  disabled={busy}
                  aria-invalid={skuInvalid}
                  placeholder="mis. 2M-00017"
                />
              </label>
              <label className="field-label flex flex-col gap-1.5">
                Kategori
                <input className="field" list="catalog-categories" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} disabled={busy} />
              </label>
            </div>
            <p className="-mt-2 text-sm text-muted-foreground">SKU: huruf, angka dan tanda minus. Kosongkan kalau belum ada.</p>
            <datalist id="catalog-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <label className="field-label flex flex-col gap-1.5">
          Deskripsi
          <textarea className="field min-h-24" value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </label>
        <label className="option-row" data-selected={active}>
          <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
          Aktif (tampil di website dan bisa dijual di kiosk)
        </label>
        {save.isError && <ErrorBox error={save.error} />}
        <div className="dialog-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty || invalid}>
            {save.isPending ? "Menyimpan…" : product ? "Simpan" : "Buat produk"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CatalogSection() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const [open, setOpen] = useState<{ dialog: "edit"; id: number } | { dialog: "new" } | null>(null);
  const catalog = useQuery({ queryKey: [CATALOG_KEY], queryFn: () => api.get<{ products: CatalogProduct[]; categories: string[] }>("/catalog") });
  const all = catalog.data?.products ?? [];
  const rows = all.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || p.category.includes(q));
  const editing = open?.dialog === "edit" ? all.find((p) => p.id === open.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField value={search} onChange={setSearch} label="Cari katalog" placeholder="Cari nama, SKU atau kategori…" className="lg:max-w-sm" />
        <p className="t-label lg:ml-auto">{all.length} produk di katalog</p>
        <button className="btn btn-primary self-start whitespace-nowrap lg:self-auto" onClick={() => setOpen({ dialog: "new" })}>
          Produk baru
        </button>
      </div>
      {catalog.isLoading && <LoadingRows />}
      {catalog.isError && <ErrorBox error={catalog.error} />}
      {catalog.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>{q ? `Tidak ada produk yang cocok dengan “${search.trim()}”.` : "Katalog masih kosong. Buat produk pertama dengan Produk baru."}</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card animate-rise overflow-hidden overflow-x-auto p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Kategori</th>
                <th className="text-right">Harga</th>
                <th>Dijual di</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-primary>
                    <span className="flex items-center gap-3">
                      <ProductThumb src={p.image_url} />
                      <span className="min-w-0">
                        <span className="block font-bold">{p.name}</span>
                        <span className="t-label mt-0.5 block tabular-nums">
                          {p.sku ?? "tanpa SKU"}
                          {!p.image_url && " · belum ada foto"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td data-label="Kategori" className="capitalize">
                    {p.category}
                  </td>
                  <td data-label="Harga" className="font-bold tabular-nums md:text-right">
                    {formatIDR(p.price)}
                  </td>
                  <td data-label="Dijual di">
                    {p.branches.length === 0 ? <span className="text-muted-foreground">Belum ada cabang</span> : p.branches.map((b) => b.name).join(", ")}
                  </td>
                  <td data-label="Status">
                    <span className={p.is_active ? "pill pill-dot pill-success" : "pill pill-dot"}>{p.is_active ? "Aktif" : "Nonaktif"}</span>
                  </td>
                  <td data-actions className="md:text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "edit", id: p.id })}>
                      Ubah
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open?.dialog === "new" && <CatalogDialog categories={catalog.data?.categories ?? []} onClose={() => setOpen(null)} />}
      {editing && <CatalogDialog product={editing} categories={catalog.data?.categories ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}
