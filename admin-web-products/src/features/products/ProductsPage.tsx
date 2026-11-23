import { useState, type CSSProperties } from "react";
import { Segmented, useSwapX, type SegmentedItem } from "../../components/Segmented";
import { useBranch } from "./BranchProvider";
import { CatalogSection } from "./CatalogSection";
import { ProductsSection } from "./ProductsSection";

type Section = "products" | "catalog";

const ITEMS: SegmentedItem<Section>[] = [
  { id: "products", label: "Produk", title: "Produk, harga dan stok cabang" },
  { id: "catalog", label: "Katalog", title: "Katalog produk semua cabang" },
];

export function ProductsPage() {
  const { branchId, branchName } = useBranch();
  const [section, setSection] = useState<Section>("products");
  const swapX = useSwapX(ITEMS.findIndex((i) => i.id === section));

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="t-headline">Produk</h1>
        <p className="text-muted-foreground">
          {section === "catalog"
            ? "Semua SKU yang bisa dijual cabang. Detail di sini berlaku di semua cabang."
            : `Harga dan stok untuk ${branchName ?? "cabang ini"}.`}
        </p>
      </div>
      <Segmented label="Bagian produk" value={section} onChange={setSection} items={ITEMS} className="w-full sm:w-80" />
      <div key={section} className="swap-in min-w-0" style={{ "--swap-x": swapX } as CSSProperties}>
        {section === "catalog" ? (
          <CatalogSection />
        ) : !branchId ? (
          <p className="text-sm text-muted-foreground">Pilih cabang…</p>
        ) : (
          <ProductsSection key={branchId} />
        )}
      </div>
    </div>
  );
}
