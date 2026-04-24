import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface InvoiceData {
  id: string;
  invoice_number: string;
  created_at: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  source: string;
  courier_name: string | null;
  awb_no: string | null;
  notes: string | null;
  store: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    gst_number: string | null;
    logo_url: string | null;
  } | null;
  customer: {
    name: string | null;
    mobile: string;
  } | null;
  items: {
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    discount: number;
    product: { name: string; sku: string } | null;
  }[];
}

export default function InvoicePublic() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("invoices")
          .select(`
            id, invoice_number, created_at, subtotal, tax_amount, discount_amount,
            total_amount, payment_method, source, courier_name, awb_no, notes,
            stores!invoices_store_id_fkey(name, address, phone, email, gst_number, logo_url),
            customers!invoices_customer_id_fkey(name, mobile),
            invoice_items(quantity, unit_price, tax_amount, total, discount,
              products!invoice_items_product_id_fkey(name, sku)
            )
          `)
          .eq("id", id)
          .single();

        if (fetchErr) throw fetchErr;

        setInvoice({
          ...data,
          store: data.stores as any,
          customer: data.customers as any,
          items: (data.invoice_items as any[]).map((item: any) => ({
            ...item,
            product: item.products,
          })),
        });
      } catch (err: any) {
        setError("Invoice not found or access denied.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invoice Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const date = new Date(invoice.created_at);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              {invoice.store?.logo_url && (
                <img src={invoice.store.logo_url} alt="Store" className="h-10 mb-2 rounded" />
              )}
              <h1 className="text-xl font-bold">{invoice.store?.name || "Store"}</h1>
              {invoice.store?.address && <p className="text-sm opacity-80">{invoice.store.address}</p>}
              {invoice.store?.phone && <p className="text-sm opacity-80">Phone: {invoice.store.phone}</p>}
              {invoice.store?.gst_number && <p className="text-sm opacity-80">GST: {invoice.store.gst_number}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Invoice</p>
              <p className="text-lg font-bold">{invoice.invoice_number}</p>
              <p className="text-sm opacity-80">{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>
        </div>

        {/* Customer */}
        {invoice.customer && (
          <div className="px-6 py-3 border-b bg-gray-50">
            <p className="text-xs text-gray-500 uppercase">Bill To</p>
            <p className="font-medium">{invoice.customer.name || "Walk-in Customer"}</p>
            <p className="text-sm text-gray-600">{invoice.customer.mobile}</p>
          </div>
        )}

        {/* Items */}
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium text-center">Qty</th>
                <th className="pb-2 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2">
                    <p className="font-medium">{item.product?.name || "Unknown"}</p>
                    <p className="text-xs text-gray-400">{item.product?.sku}</p>
                  </td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right">₹{Number(item.unit_price).toLocaleString("en-IN")}</td>
                  <td className="py-2 text-right font-medium">₹{Number(item.total).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="max-w-xs ml-auto space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>₹{Number(invoice.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>₹{Number(invoice.tax_amount).toFixed(2)}</span></div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-₹{Number(invoice.discount_amount).toFixed(2)}</span></div>
            )}
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Total</span>
              <span>₹{Number(invoice.total_amount).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 text-center text-xs text-gray-400">
          <p>Payment: {invoice.payment_method.toUpperCase()} • {invoice.source === "online" ? "Online" : "In-Store"}</p>
          {invoice.source === "online" && (invoice.courier_name || invoice.awb_no) && (
            <p className="mt-1">Courier: {invoice.courier_name || "—"} • AWB: {invoice.awb_no || "—"}</p>
          )}
          <p className="mt-1">Thank you for your purchase!</p>
        </div>
      </div>
    </div>
  );
}
