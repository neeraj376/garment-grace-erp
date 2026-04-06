import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  tax_rate: number;
  item_discount: number;
  category?: string;
  subcategory?: string;
  color?: string;
  size?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null;
  cart: CartItem[];
  customerName: string;
  customerMobile: string;
  paymentMethod: string;
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
}

export default function InvoicePreviewDialog({
  open, onClose, storeId, cart, customerName, customerMobile,
  paymentMethod, subtotal, taxAmount, discount, total,
}: Props) {
  const [store, setStore] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storeId || !open) return;
    supabase.from("stores").select("name, address, phone, gst_number, logo_url").eq("id", storeId).single()
      .then(({ data }) => setStore(data));
  }, [storeId, open]);

  const handleDownload = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Invoice Preview</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        th { background: #1a1a2e; color: white; font-weight: 600; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .header { text-align: center; margin-bottom: 16px; }
        .header h1 { margin: 0; font-size: 22px; color: #1a1a2e; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .divider { border-top: 1px solid #e5e7eb; margin: 12px 0; }
        .meta { display: flex; justify-content: space-between; font-size: 13px; margin: 8px 0; }
        .summary { margin-top: 12px; }
        .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        .total-row { font-size: 16px; font-weight: 700; border-top: 2px solid #1a1a2e; padding-top: 8px; margin-top: 4px; }
        .footer { text-align: center; margin-top: 24px; font-size: 10px; color: #aaa; }
        @media print { body { margin: 0; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const storeName = store?.name || "Store";

  const getLineTotal = (item: CartItem) => item.unit_price * item.quantity - item.item_discount;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          {/* Store Header */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: "#1a1a2e", fontFamily: "Arial, sans-serif" }}>{storeName}</h1>
            {store?.address && <p style={{ margin: "2px 0", fontSize: 12, color: "#666" }}>{store.address}</p>}
            {store?.phone && <p style={{ margin: "2px 0", fontSize: 12, color: "#666" }}>Ph: {store.phone}</p>}
            {store?.gst_number && <p style={{ margin: "2px 0", fontSize: 12, color: "#666" }}>GSTIN: {store.gst_number}</p>}
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", margin: "12px 0" }} />

          {/* Invoice Meta */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
            <div>
              <strong>INVOICE (Preview)</strong><br />
              <span style={{ color: "#666" }}>Date: {now}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span>Customer: {customerName || "—"}</span><br />
              {customerMobile && <span style={{ color: "#666" }}>Mobile: {customerMobile}</span>}
              <br />
              <span style={{ color: "#666" }}>Payment: {paymentMethod.toUpperCase()}</span>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", margin: "12px 0" }} />

          {/* Items Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontFamily: "Arial, sans-serif" }}>
            <thead>
              <tr style={{ background: "#1a1a2e", color: "white" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12 }}>ITEM</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 12 }}>QTY</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>PRICE</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>DISC</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f8f9fa" : "white" }}>
                  <td style={{ padding: "8px 12px", fontSize: 13 }}>
                    {item.name}
                    <br />
                    <span style={{ fontSize: 11, color: "#888" }}>{item.sku}</span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontSize: 13 }}>{item.quantity}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13 }}>₹{item.unit_price.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13, color: item.item_discount > 0 ? "#d32f2f" : "#333" }}>
                    {item.item_discount > 0 ? `-₹${item.item_discount.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 13, fontWeight: 600 }}>₹{getLineTotal(item).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div style={{ marginLeft: "auto", width: 250 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: "#666" }}>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: "#666" }}>Tax (incl.):</span>
              <span>₹{taxAmount.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <span style={{ color: "#666" }}>Discount:</span>
                <span style={{ color: "#d32f2f" }}>-₹{discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", fontSize: 16, fontWeight: 700, borderTop: "2px solid #1a1a2e", marginTop: 4 }}>
              <span>TOTAL:</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 24, fontSize: 10, color: "#aaa" }}>
            Generated by Garment Grace ERP
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleDownload} className="flex-1">
            <Download className="h-4 w-4 mr-2" /> Download / Print
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
