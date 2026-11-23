import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../components/Dialog";
import { IconImage, IconTrash } from "../../components/Icons";
import { ErrorBox, LoadingRows, ProductThumb, SearchField } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatIDR } from "../../lib/format";
import type { CatalogProduct } from "../../lib/types";
import { useToast } from "../../lib/toast";
import { PhotoEditor, type PhotoSource } from "./PhotoEditor";

// Harga jual tiap cabang bisa beda: tampilkan satu harga atau rentangnya.
function priceRange(p: CatalogProduct): string {
  const prices = p.branches.map((b) => b.price).filter((v): v is number => v !== null);
  if (prices.length === 0) return p.price !== null ? formatIDR(p.price) : "–";
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? formatIDR(lo) : `${formatIDR(lo)} – ${formatIDR(hi)}`;
}
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
  // Foto hasil editor yang belum diunggah: baru dikirim ke Cloudinary saat Simpan, jadi Batal tidak meninggalkan file yatim.
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [editing, setEditing] = useState<PhotoSource | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [active, setActive] = useState(product?.is_active ?? true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (newPhoto && URL.revokeObjectURL(newPhoto.preview)), [newPhoto]);
  const shownPhoto = newPhoto?.preview ?? imageUrl;

  const skuValue = sku.trim().toUpperCase();
  const skuInvalid = skuValue !== "" && !SKU.test(skuValue);
  const invalid = !name.trim() || !category.trim() || skuInvalid;

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
    newPhoto !== null ||
    body.image_url !== product.image_url ||
    body.is_active !== product.is_active;

  const save = useMutation({
    mutationFn: async () => {
      let image_url = body.image_url;
      if (newPhoto) {
        const form = new FormData();
        form.append("file", new File([newPhoto.blob], "produk.jpg", { type: "image/jpeg" }));
        image_url = (await api.upload<{ url: string }>("/catalog/upload-image", form)).url;
        setImageUrl(image_url);
        setNewPhoto(null);
      }
      const payload = { ...body, image_url };
      return product ? api.patch<CatalogProduct>(`/catalog/${product.id}`, payload) : api.post<CatalogProduct>("/catalog", payload);
    },
    onSuccess: (p) => {
      toast("success", product ? `${p.name} disimpan` : `${p.name} masuk katalog. Tambahkan ke cabang lewat tab Produk.`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del<void>(`/catalog/${product!.id}`),
    onSuccess: () => {
      toast("success", `${product!.name} dihapus dari katalog`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
  const busy = save.isPending || remove.isPending;

  if (editing) {
    return (
      <Dialog title="Atur foto" wide>
        <PhotoEditor
          source={editing}
          onCancel={() => setEditing(null)}
          onDone={(blob) => {
            setNewPhoto({ blob, preview: URL.createObjectURL(blob) });
            setEditing(null);
          }}
        />
      </Dialog>
    );
  }

  if (product && confirmDelete) {
    const inBranches = product.branches.length > 0;
    return (
      <Dialog title={`Hapus ${product.name}?`}>
        {inBranches ? (
          <p className="notice">
            Produk ini sudah ada di cabang ({product.branches.map((b) => b.name).join(", ")}), jadi tidak bisa dihapus: riwayat stok dan penjualannya ikut
            hilang. Nonaktifkan saja lewat Status.
          </p>
        ) : (
          <p>Produk dan fotonya dihapus permanen dari katalog dan website. Tidak bisa dibatalkan.</p>
        )}
        {remove.isError && <ErrorBox error={remove.error} />}
        <div className="dialog-footer">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            Kembali
          </button>
          {!inBranches && (
            <button type="button" className="btn btn-danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? "Menghapus…" : "Hapus permanen"}
            </button>
          )}
        </div>
      </Dialog>
    );
  }

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
          <div className="flex flex-col gap-2">
            <span className="field-label">Foto</span>
            <span className="photo-tile photo-tile-product relative flex w-full items-center justify-center text-3xl text-muted-foreground">
              {shownPhoto ? <img src={shownPhoto} alt="" /> : <IconImage />}
              {save.isPending && newPhoto && <span className="photo-tile-state">Mengunggah…</span>}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setEditing(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              {shownPhoto ? "Ganti foto" : "Unggah foto"}
            </button>
            {shownPhoto && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(newPhoto?.blob ?? imageUrl!)} disabled={busy}>
                Atur posisi
              </button>
            )}
            {shownPhoto && (
              <button
                type="button"
                className="btn btn-danger-quiet btn-sm"
                onClick={() => {
                  setNewPhoto(null);
                  setImageUrl(null);
                }}
                disabled={busy}
              >
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
          {product && (
            <button type="button" className="btn btn-danger-quiet sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <IconTrash /> Hapus produk
            </button>
          )}
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

// Aktif = tampil di website dan bisa dijual di kiosk (semua cabang). Per cabang diatur di tab Produk (Dijual/Sembunyi).
function StatusToggle({ product }: { product: CatalogProduct }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const patch = useMutation({
    mutationFn: (is_active: boolean) => api.patch<CatalogProduct>(`/catalog/${product.id}`, { is_active }),
    onSuccess: (p) => toast("success", p.is_active ? `${p.name} aktif lagi` : `${p.name} dinonaktifkan: hilang dari kiosk dan website`),
    onError: (e) => toast("error", errorMessage(e)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
  const checked = patch.isPending ? !!patch.variables : product.is_active;
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={checked}
        disabled={patch.isPending}
        onChange={(e) => patch.mutate(e.target.checked)}
        aria-label={`${product.name} aktif`}
      />
      {checked ? "Aktif" : "Nonaktif"}
    </label>
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
                    {priceRange(p)}
                  </td>
                  <td data-label="Dijual di">
                    {p.branches.length === 0 ? <span className="text-muted-foreground">Belum ada cabang</span> : p.branches.map((b) => b.name).join(", ")}
                  </td>
                  <td data-label="Status">
                    <StatusToggle product={p} />
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
