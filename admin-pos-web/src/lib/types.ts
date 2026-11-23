export interface Branch {
  id: number;
  name: string;
  address: string;
  is_active: boolean;
  product_count: number;
}

export type ProductState = "available" | "low" | "out" | "hidden" | "no_price";

export interface BranchProduct {
  product_id: number;
  name: string;
  sku: string | null;
  category: string;
  image_url: string | null;
  price: number | null;
  cost_price: number | null;
  stock: number;
  min_qty: number;
  is_active: boolean;
  catalog_active: boolean;
  state: ProductState;
  margin: number | null;
  margin_pct: number | null;
  updated_at: string | null;
}

export interface BranchProductsResponse {
  products: BranchProduct[];
  categories: string[];
  summary: Record<ProductState | "total" | "stock_value", number>;
}

export interface CatalogProduct {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  price: number | null;
  cost_price: number | null;
  // Harga jual per cabang (null kalau cabang itu belum mengisi harga).
  branches: { id: number; name: string; price: number | null }[];
}

export type MovementType = "in" | "out" | "adjust" | "sale";

export interface Movement {
  id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  type: MovementType;
  qty: number;
  qty_after: number | null;
  unit_cost: number | null;
  ref: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED";

export interface OrderPayment {
  provider: string;
  provider_ref: string | null;
  status: string;
  amount: number;
  paid_at: string | null;
  confirmed_by: string | null;
}

export interface OrderRow {
  id: number;
  order_number: string;
  status: OrderStatus;
  channel: string;
  total: number;
  cost: number;
  profit: number;
  missing_cost_items: number;
  item_count: number;
  line_count: number;
  payment_method: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  payment: OrderPayment | null;
}

export interface OrderDetail extends OrderRow {
  branch: { id: number; name: string; address: string } | null;
  items: {
    product_id: number;
    name: string;
    sku: string | null;
    qty: number;
    unit_price: number;
    cost_price: number | null;
    subtotal: number;
    profit: number | null;
  }[];
  payments: (OrderPayment & { id: number; created_at: string })[];
}

export interface Totals {
  omzet: number;
  hpp: number;
  laba_kotor: number;
  margin_pct: number | null;
  transactions: number;
  avg_basket: number;
  items_sold: number;
  missing_cost_lines: number;
  // Keuangan
  pembelian: number;
  pembelian_qty: number;
  pembelian_lines: number;
  pembelian_tanpa_modal: number;
  biaya: number;
  biaya_per_kategori: { category: string; amount: number; count: number }[];
  laba_bersih: number;
  margin_bersih_pct: number | null;
  kas_masuk: number;
  kas_keluar: number;
  kas_bersih: number;
}

export interface DailyRow {
  date: string;
  omzet: number;
  hpp: number;
  laba_kotor: number;
  transactions: number;
  biaya: number;
  laba_bersih: number;
  pembelian: number;
  kas_bersih: number;
}

export interface Expense {
  id: number;
  spent_on: string;
  category: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductSales {
  product_id: number;
  name: string;
  sku: string | null;
  qty: number;
  omzet: number;
  hpp: number;
  laba: number;
  margin_pct: number | null;
  missing_cost_lines: number;
}

export interface ReportSummary {
  date_from: string;
  date_to: string;
  today: Totals;
  range: Totals;
  daily: DailyRow[];
  products: ProductSales[];
  low_stock: BranchProduct[];
  pending_orders: number;
}
