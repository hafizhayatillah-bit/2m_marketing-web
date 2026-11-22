import { useState, type CSSProperties } from "react";
import { Segmented, useSwapX, type SegmentedItem } from "../../components/Segmented";
import { PageHeader } from "../../components/ui";
import { useBranch } from "../branch/BranchProvider";
import { CatalogSection } from "./CatalogSection";
import { ProductsSection } from "./ProductsSection";

type Section = "products" | "catalog";

const ITEMS: SegmentedItem<Section>[] = [
  { id: "products", label: "Produk", title: "Produk, harga, modal dan stok cabang" },
  { id: "catalog", label: "Katalog", title: "Master produk semua cabang" },
];

export function ProductsPage() {
  const { branchName } = useBranch();
  const [section, setSection] = useState<Section>("products");
  const swapX = useSwapX(ITEMS.findIndex((i) => i.id === section));

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PageHeader
        title="Produk"
        description={
          section === "catalog"
            ? "Nama, SKU, kategori, foto dan deskripsi. Berlaku di semua cabang dan website."
            : `Harga jual, modal dan stok di ${branchName ?? "cabang ini"}. Klik angka harga atau modal untuk mengubahnya.`
        }
      />
      <Segmented label="Bagian produk" value={section} onChange={setSection} items={ITEMS} className="w-full sm:w-80" />
      <div key={section} className="swap-in min-w-0" style={{ "--swap-x": swapX } as CSSProperties}>
        {section === "catalog" ? <CatalogSection /> : <ProductsSection />}
      </div>
    </div>
  );
}
