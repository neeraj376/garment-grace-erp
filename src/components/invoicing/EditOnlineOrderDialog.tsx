import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ORDER_STATUS = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUS = ["pending", "paid", "failed"];

interface EditOnlineOrderDialogProps {
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditOnlineOrderDialog({ order, onClose, onSaved }: EditOnlineOrderDialogProps) {
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [courier, setCourier] = useState("");
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setTracking(order.tracking_number || "");
    setCourier(order.courier_name || "");
    setShipping(Number(order.shipping_amount || 0));
    setDiscount(Number(order.discount_amount || 0));
    setNotes(order.notes || "");
    setItems((order.order_items || []).map((it: any) => ({
      ...it,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      tax_amount: Number(it.tax_amount || 0),
    })));
  }, [order]);

  if (!order) return null;

  const updateItem = (id: string, field: string, value: number) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const updated = { ...it, [field]: value };
      updated.total = (updated.quantity * updated.unit_price) + Number(updated.tax_amount || 0);
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const subtotal = items.reduce((s, it) => s + (it.quantity * it.unit_price), 0);
  const totalTax = items.reduce((s, it) => s + Number(it.tax_amount || 0), 0);
  const total = subtotal + totalTax + Number(shipping || 0) - Number(discount || 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update items
      for (const it of items) {
        const { error } = await supabase
          .from("order_items")
          .update({
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: it.tax_amount,
            total: it.total,
          })
          .eq("id", it.id);
        if (error) throw error;
      }

      // Delete removed items
      const keepIds = new Set(items.map((it) => it.id));
      const removed = (order.order_items || []).filter((it: any) => !keepIds.has(it.id));
      if (removed.length > 0) {
        const { error } = await supabase
          .from("order_items")
          .delete()
          .in("id", removed.map((r: any) => r.id));
        if (error) throw error;
      }

      // Update order
      const { error: ordErr } = await supabase
        .from("orders")
        .update({
          status,
          payment_status: paymentStatus,
          tracking_number: tracking.trim() || null,
          courier_name: courier.trim() || null,
          shipping_amount: shipping,
          discount_amount: discount,
          subtotal,
          tax_amount: totalTax,
          total_amount: total,
          notes: notes.trim() || null,
        })
        .eq("id", order.id);
      if (ordErr) throw ordErr;

      toast.success("Order updated");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order — {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Order Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>AWB / Tracking #</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Courier</Label>
              <Input value={courier} onChange={(e) => setCourier(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">Items</Label>
            <div className="border rounded-lg overflow-hidden mt-1.5">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 text-xs">Product</th>
                    <th className="text-right p-2 text-xs w-20">Qty</th>
                    <th className="text-right p-2 text-xs w-28">Unit Price</th>
                    <th className="text-right p-2 text-xs w-24">Tax</th>
                    <th className="text-right p-2 text-xs w-24">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{it.products?.name || it.product_id}</td>
                      <td className="p-1">
                        <Input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => updateItem(it.id, "quantity", Number(e.target.value))}
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(it.id, "unit_price", Number(e.target.value))}
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={it.tax_amount}
                          onChange={(e) => updateItem(it.id, "tax_amount", Number(e.target.value))}
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="p-2 text-right font-medium">₹{Number(it.total).toFixed(2)}</td>
                      <td className="p-1">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-sm">No items</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Shipping (₹)</Label>
              <Input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Discount (₹)</Label>
              <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>₹{totalTax.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span>₹{Number(shipping).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-₹{Number(discount).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1.5 mt-1 text-base">
              <span>Grand Total</span><span>₹{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
