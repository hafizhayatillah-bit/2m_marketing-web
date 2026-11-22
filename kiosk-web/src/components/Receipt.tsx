import { createPortal } from "react-dom";
import { config } from "../config";
import type { Order } from "../lib/api";
import { formatDateTime, formatIDR } from "../lib/format";

/**
 * Struk thermal. Dirender ke #receipt-root (di luar #root) dan hanya tampil saat print.
 * Lebar kertas: ?paper=58 (default) atau ?paper=80 di URL kiosk. Lebar area cetak 48 mm / 72 mm.
 */
const PAPER = {
  "58": { page: "58mm", content: "48mm" },
  "80": { page: "80mm", content: "72mm" },
} as const;

export function Receipt({ order, storeName }: { order: Order; storeName: string }) {
  const target = document.getElementById("receipt-root");
  if (!target) return null;
  const paper = PAPER[config.paper];
  return createPortal(
    <>
      <style>{`@page { size: ${paper.page} auto; margin: 0; }`}</style>
      <div className="receipt" style={{ ["--receipt-width" as string]: paper.content }}>
        <div className="receipt-center">
          <div className="receipt-store">{storeName}</div>
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
          <span>{order.payment_method === "QRIS" ? "QRIS" : order.payment_method}</span>
        </div>
        <div className="receipt-row">
          <span>Status</span>
          <span>{order.status === "PAID" ? "LUNAS" : order.status}</span>
        </div>
        <hr className="receipt-rule" />
        <div className="receipt-center">
          <div>Terima kasih telah berbelanja!</div>
          <div>Simpan struk ini sebagai bukti pembayaran.</div>
        </div>
      </div>
    </>,
    target,
  );
}
