import { createPortal } from "react-dom";
import { formatDateTime, formatIDR } from "../../lib/format";
import type { OrderDetail } from "../../lib/types";

// Salinan tata letak struk kiosk (kiosk-web/src/components/Receipt.tsx). Dirender ke #receipt-root dan hanya tampil saat print.
export type Paper = "58" | "80";
const PAPER = {
  "58": { page: "58mm", content: "48mm" },
  "80": { page: "80mm", content: "72mm" },
} as const;

const STORE_NAME = "2M Sembako";

export function Receipt({ order, paper }: { order: OrderDetail; paper: Paper }) {
  const target = document.getElementById("receipt-root");
  if (!target) return null;
  const p = PAPER[paper];
  return createPortal(
    <>
      <style>{`@page { size: ${p.page} auto; margin: 0; }`}</style>
      <div className="receipt" style={{ ["--receipt-width" as string]: p.content }}>
        <div className="receipt-center">
          <div className="receipt-store">{STORE_NAME}</div>
          {order.branch && (
            <>
              <div>{order.branch.name}</div>
              <div>{order.branch.address}</div>
            </>
          )}
        </div>
        <hr className="receipt-rule" />
        <div className="receipt-row">
          <span>No. order</span>
          <span>{order.order_number}</span>
        </div>
        <div className="receipt-row">
          <span>Waktu</span>
          <span>{formatDateTime(order.paid_at ?? order.created_at)}</span>
        </div>
        <hr className="receipt-rule" />
        {order.items.map((i) => (
          <div key={i.product_id} style={{ marginBottom: "1.5mm" }}>
            <div className="receipt-item-name">{i.name}</div>
            <div className="receipt-row">
              <span>
                {i.qty} x {formatIDR(i.unit_price)}
              </span>
              <span>{formatIDR(i.subtotal)}</span>
            </div>
          </div>
        ))}
        <hr className="receipt-rule" />
        <div className="receipt-row receipt-total">
          <span>TOTAL</span>
          <span>{formatIDR(order.total)}</span>
        </div>
        <div className="receipt-row">
          <span>Pembayaran</span>
          <span>{order.payment_method}</span>
        </div>
        <div className="receipt-row">
          <span>Status</span>
          <span>{order.status === "PAID" ? "LUNAS" : order.status}</span>
        </div>
        <hr className="receipt-rule" />
        <div className="receipt-center">
          <div>CETAK ULANG</div>
          <div>Terima kasih telah berbelanja!</div>
        </div>
      </div>
    </>,
    target,
  );
}
