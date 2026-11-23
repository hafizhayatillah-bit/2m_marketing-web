import { Navigate, Route, Routes } from "react-router-dom";
import { ChatListPage } from "../features/chat/ChatListPage";
import { ChatRoomPage } from "../features/chat/ChatRoomPage";
import { BranchPicker } from "../features/catalog/BranchPicker";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { ProductPage } from "../features/catalog/ProductPage";
import { CartPage } from "../features/cart/CartPage";
import { CheckoutPage } from "../features/checkout/CheckoutPage";
import { OrderStatusPage } from "../features/orders/OrderStatusPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { PaymentReturnPage } from "../features/orders/PaymentReturnPage";
import { MockPayPage } from "../features/orders/MockPayPage";
import { Layout } from "./Layout";

// Login, account and address screens are not part of this package: the host project owns them.
// Pass the host's access token to lib/api.ts (setAccessToken) and the chosen address id to lib/checkout.ts (setAddressId).
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<BranchPicker />} />
        <Route path="/b/:branchId" element={<CatalogPage />} />
        <Route path="/b/:branchId/p/:productId" element={<ProductPage />} />
        <Route path="/b/:branchId/cart" element={<CartPage />} />
        <Route path="/b/:branchId/checkout" element={<CheckoutPage />} />
        <Route path="/mock-pay/:invoiceId" element={<MockPayPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
        <Route path="/orders/:orderId/return" element={<PaymentReturnPage />} />
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:threadId" element={<ChatRoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
