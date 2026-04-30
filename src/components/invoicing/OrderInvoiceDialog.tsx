import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface OrderInvoiceDialogProps {
  order: any | null;
  onClose: () => void;
}

export default function OrderInvoiceDialog({ order, onClose }: OrderInvoiceDialogProps) {
  const [store, setStore] = useState<any>(null);
  const [productDetails, setProductDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!order?.store_id) return;
    setLoading(true);
    const ids = (order.order_items || []).map((i: any) => i.product_id).filter(Boolean);
    Promise.all([
      supabase.from("stores").select("name, address, phone, email, gst_number, logo_url").eq("id", order.store_id).maybeSingle(),
      ids.length
        ? supabase.from("products").select("id, name, sku, photo_url, color, size, category, subcategory, brand, mrp, hsn_code, tax_rate").in("id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]).then(([storeRes, prodRes]: any) => {
      setStore(storeRes.data);
      const map: Record<string, any> = {};
      (prodRes.data || []).forEach((p: any) => { map[p.id] = p; });
      setProductDetails(map);
      setLoading(false);
    });
  }, [order?.id, order?.store_id]);

  if (!order) return null;

  const addr = order.shipping_addresses;
  const cust = order.shop_customers;
  const items = order.order_items || [];
  const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);

  const handlePrint = () => {
    const node = document.getElementById("order-invoice-print");
    if (!node) return;
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><title>Invoice — ${order.order_number}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}
        body{padding:24px;color:#111;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px;}
        th{background:#f5f5f5;}
        .right{text-align:right;}
        @media print{body{padding:8px;}}
      </style></head><body>${node.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Invoice — {order.order_number}</span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div id="order-invoice-print" className="bg-white p-6 text-sm">
            {/* Header */}
            <div className="flex justify-between items-start border-b pb-4 mb-4">
              <div>
                {store?.logo_url && <img src={store.logo_url} alt="logo" style={{ maxHeight: 50, marginBottom: 6 }} />}
                <h2 className="text-xl font-bold">{store?.name || "Store"}</h2>
                {store?.address && <p className="text-xs text-muted-foreground">{store.address}</p>}
                {store?.phone && <p className="text-xs text-muted-foreground">📞 {store.phone}</p>}
                {store?.gst_number && <p className="text-xs text-muted-foreground">GSTIN: {store.gst_number}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-lg font-bold">TAX INVOICE</h3>
                <p className="text-xs"><strong>Order #:</strong> {order.order_number}</p>
                <p className="text-xs"><strong>Date:</strong> {format(new Date(order.created_at), "dd MMM yyyy")}</p>
                <p className="text-xs"><strong>Payment:</strong> {order.payment_status} ({order.payment_method || "—"})</p>
                <p className="text-xs"><strong>Status:</strong> {order.status}</p>
              </div>
            </div>

            {/* Bill to */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Bill To</p>
                <p className="font-medium">{addr?.name || cust?.name || "—"}</p>
                <p className="text-xs">{addr?.phone || cust?.phone || ""}</p>
                {cust?.email && <p className="text-xs">{cust.email}</p>}
              </div>
              {addr && (
                <div>
                  <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Ship To</p>
                  <p className="text-xs">{addr.address_line1}</p>
                  {addr.address_line2 && <p className="text-xs">{addr.address_line2}</p>}
                  <p className="text-xs">{addr.city}, {addr.state} — {addr.pincode}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">#</th>
                  <th className="border p-2 text-left">Image</th>
                  <th className="border p-2 text-left">Item Details</th>
                  <th className="border p-2 text-left">HSN</th>
                  <th className="border p-2 text-right">MRP</th>
                  <th className="border p-2 text-right">Qty</th>
                  <th className="border p-2 text-right">Unit Price</th>
                  <th className="border p-2 text-right">Tax</th>
                  <th className="border p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, idx: number) => {
                  const p = productDetails[it.product_id] || it.products || {};
                  const variantBits = [p.color, p.size].filter(Boolean).join(" / ");
                  const catBits = [p.brand, p.category, p.subcategory].filter(Boolean).join(" • ");
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="border p-2">{idx + 1}</td>
                      <td className="border p-2">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
                        ) : (
                          <div style={{ width: 48, height: 48, background: "#f3f4f6", borderRadius: 4 }} />
                        )}
                      </td>
                      <td className="border p-2">
                        <div className="font-medium">{p.name || it.product_id}</div>
                        {p.sku && <div className="text-[10px] text-muted-foreground">SKU: {p.sku}</div>}
                        {variantBits && <div className="text-[10px]"><strong>Variant:</strong> {variantBits}</div>}
                        {catBits && <div className="text-[10px] text-muted-foreground">{catBits}</div>}
                      </td>
                      <td className="border p-2 text-[10px]">{p.hsn_code || "—"}</td>
                      <td className="border p-2 text-right">{p.mrp ? `₹${Number(p.mrp).toFixed(2)}` : "—"}</td>
                      <td className="border p-2 text-right font-medium">{it.quantity}</td>
                      <td className="border p-2 text-right">₹{Number(it.unit_price).toFixed(2)}</td>
                      <td className="border p-2 text-right">₹{Number(it.tax_amount || 0).toFixed(2)}</td>
                      <td className="border p-2 text-right font-semibold">₹{Number(it.total).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="border p-2" colSpan={5}>Total Items: {items.length} • Total Qty: {totalQty}</td>
                  <td className="border p-2 text-right">{totalQty}</td>
                  <td className="border p-2"></td>
                  <td className="border p-2 text-right">₹{Number(order.tax_amount || 0).toFixed(2)}</td>
                  <td className="border p-2 text-right">₹{items.reduce((s: number, it: any) => s + Number(it.total || 0), 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-64 text-xs space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{Number(order.subtotal || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>₹{Number(order.tax_amount || 0).toFixed(2)}</span></div>
                {Number(order.shipping_amount || 0) > 0 && (
                  <div className="flex justify-between"><span>Shipping</span><span>₹{Number(order.shipping_amount).toFixed(2)}</span></div>
                )}
                {Number(order.discount_amount || 0) > 0 && (
                  <div className="flex justify-between"><span>Discount</span><span>-₹{Number(order.discount_amount).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-1 mt-1 text-sm">
                  <span>Grand Total</span><span>₹{Number(order.total_amount).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {order.tracking_number && (
              <div className="mt-6 pt-3 border-t text-xs">
                <p><strong>Tracking #:</strong> {order.tracking_number} {order.courier_name && `(${order.courier_name})`}</p>
              </div>
            )}
            {order.payment_id && (
              <p className="text-xs mt-1"><strong>Payment ID:</strong> {order.payment_id}</p>
            )}

            <p className="text-center text-[10px] text-muted-foreground mt-6 pt-3 border-t">
              Thank you for shopping with us!
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
