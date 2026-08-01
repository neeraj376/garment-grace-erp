import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OnlineOrdersTab from "@/components/invoicing/OnlineOrdersTab";

const order = {
  id: "1", order_number: "ORD-1", status: "pending", payment_status: "paid",
  total_amount: 100, subtotal: 90, tax_amount: 10, shipping_amount: 0, discount_amount: 0,
  created_at: new Date().toISOString(), notes: null, tracking_number: null, courier_name: null,
  order_items: [{ id: "i1", product_id: "p1", quantity: 1, unit_price: 90, tax_amount: 10, total: 100, products: { name: "X", sku: "S", photo_url: null, tax_rate: 5 } }],
  shipping_addresses: { name: "A", phone: "9", address_line1: "l1", address_line2: null, city: "c", state: "s", pincode: "110001" },
  shop_customers: { name: "A", phone: "9", email: "a@b.c" },
};

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy({}, { get: () => (...a: any[]) => chain });
  return { supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [order], error: null }) }) }) }), functions: { invoke: async () => ({ data: null, error: null }) }, rpc: async () => ({ data: null, error: null }) } };
});

describe("OnlineOrdersTab", () => {
  it("renders", async () => {
    const qc = new QueryClient();
    const { findByText } = render(<QueryClientProvider client={qc}><OnlineOrdersTab storeId="s1" /></QueryClientProvider>);
    expect(await findByText(/ORD-1/)).toBeTruthy();
  });
});
