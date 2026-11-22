import { config } from "../config";

const BASE = "/api/v1/kiosk";
const TIMEOUT_MS = 12_000;

export interface Branch {
  id: number;
  name: string;
  address: string;
  whatsapp_number?: string;
}

export interface KioskConfig {
  store_name: string;
  branch: Branch;
  payment_provider: string;
  needs_staff_confirmation: boolean;
  order_ttl_seconds: number;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  image_url: string | null;
  price: number;
  stock: number;
}

export interface ProductList {
  branch_id: number;
  products: Product[];
  categories: string[];
}

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED";

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  total: number;
  payment_method: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  expires_in_seconds: number | null;
  cancel_reason: string | null;
  branch: { id: number; name: string; address: string } | null;
  items: { product_id: number; name: string; qty: number; unit_price: number; subtotal: number }[];
  payment: {
    provider: string;
    status: string;
    qr_string: string | null;
    qr_image_url: string | null;
    expires_at: string | null;
    needs_staff_confirmation: boolean;
  } | null;
}

/** Server menjawab dengan error (4xx/5xx). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Server tidak bisa dihubungi (offline, timeout, DNS). */
export class NetworkError extends Error {}

export async function request<T>(path: string, init: RequestInit & { staffPin?: string } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { "X-Kiosk-Token": config.deviceToken, Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.staffPin) headers["X-Staff-Pin"] = init.staffPin;
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers, signal: ctrl.signal, cache: "no-store" });
  } catch {
    throw new NetworkError("Tidak bisa terhubung ke server.");
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // body kosong / bukan JSON
  }
  if (!res.ok) {
    const d = (body as { detail?: unknown } | null)?.detail;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const det = d as Record<string, unknown>;
      throw new ApiError(res.status, String(det.code ?? "ERROR"), String(det.message ?? "Terjadi kesalahan."), det);
    }
    if (res.status >= 500 && res.status !== 503) throw new NetworkError("Server sedang bermasalah.");
    throw new ApiError(res.status, "ERROR", typeof d === "string" ? d : "Permintaan tidak valid.");
  }
  return body as T;
}

const branchQs = () => `branch=${encodeURIComponent(config.branch)}`;

export const kioskApi = {
  config: () => request<KioskConfig>(`/config?${branchQs()}`),
  products: () => request<ProductList>(`/products?${branchQs()}`),
  createOrder: (items: { product_id: number; qty: number }[]) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify({ branch: config.branch, items }) }),
  order: (id: number) => request<Order>(`/orders/${id}`),
  cancelOrder: (id: number) => request<Order>(`/orders/${id}/cancel`, { method: "POST" }),
  staffLogin: (pin: string) => request<{ ok: boolean }>("/staff/login", { method: "POST", staffPin: pin }),
  staffOrders: (pin: string) => request<{ pending: Order[]; recent: Order[] }>(`/staff/orders?${branchQs()}`, { staffPin: pin }),
  staffMarkPaid: (pin: string, id: number) => request<Order>(`/staff/orders/${id}/mark-paid`, { method: "POST", staffPin: pin }),
  staffCancel: (pin: string, id: number) => request<Order>(`/staff/orders/${id}/cancel`, { method: "POST", staffPin: pin }),
};

export function errorText(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return "Terjadi kesalahan. Silakan coba lagi.";
}
