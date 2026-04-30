import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2, Replace, Plus, Search } from "lucide-react";
import { toast } from "sonner";

const ORDER_STATUS = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUS = ["pending", "paid", "failed"];

interface EditOnlineOrderDialogProps {
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}

interface OrderItemRow {
  id: string;          // existing row id OR temp id like "new_..."
  product_id: string;
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
  isNew?: boolean;
  replaced?: boolean;  // true when product_id was changed on an existing row
}

export default function EditOnlineOrderDialog({ order, onClose, onSaved }: EditOnlineOrderDialogProps) {
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [courier, setCourier] = useState("");
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  // When set, the next picked product will REPLACE this row instead of being added as new
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setTracking(order.tracking_number || "");
    setCourier(order.courier_name || "");
    setShipping(Number(order.shipping_amount || 0));
    setDiscount(Number(order.discount_amount || 0));
    setNotes(order.notes || "");
    setRemovedIds([]);
    setProductSearch("");
    setReplaceTargetId(null);
    setItems((order.order_items || []).map((it: any) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.products?.name || "Unknown product",
      product_sku: it.products?.sku,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      tax_amount: Number(it.tax_amount || 0),
      tax_rate: Number(it.products?.tax_rate || 5),
      total: Number(it.total),
    })));

    // Fetch products available for replacement / addition
    (async () => {
      if (!order.store_id) return;
      const { data: inStockIds } = await supabase.rpc("get_in_stock_product_ids", {
        p_store_id: order.store_id,
      });
      const idsToFetch = new Set<string>(inStockIds || []);
      // Always include product ids already on this order so user can see them
      (order.order_items || []).forEach((it: any) => idsToFetch.add(it.product_id));
      if (idsToFetch.size === 0) return;
      const idArr = Array.from(idsToFetch);
      let all: any[] = [];
      const batchSize = 200;
      for (let i = 0; i < idArr.length; i += batchSize) {
        const { data } = await supabase
          .from("products")
          .select("id, sku, name, selling_price, tax_rate, category, subcategory, color, size, brand")
          .eq("store_id", order.store_id)
          .eq("is_active", true)
          .in("id", idArr.slice(i, i + batchSize));
        if (data) all = all.concat(data);
      }
      setAvailableProducts(all);
    })();
  }, [order]);

  const recalcRow = (row: OrderItemRow): OrderItemRow => {
    const gross = row.unit_price * row.quantity;
    const taxRate = row.tax_rate || 0;
    const priceExclTax = taxRate > 0 ? gross / (1 + taxRate / 100) : gross;
    const taxAmount = gross - priceExclTax;
    return { ...row, total: gross, tax_amount: parseFloat(taxAmount.toFixed(2)) };
  };

  const updateItem = (id: string, field: keyof OrderItemRow, value: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? recalcRow({ ...it, [field]: value }) : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (!id.startsWith("new_")) {
      setRemovedIds((prev) => [...prev, id]);
    }
  };

  const pickProduct = (product: any) => {
    const price = Number(product.selling_price);
    const taxRate = Number(product.tax_rate) || 5;

    if (replaceTargetId) {
      // Replace product on the targeted row, keep the row id (so we UPDATE in place)
      setItems((prev) => prev.map((it) => {
        if (it.id !== replaceTargetId) return it;
        return recalcRow({
          ...it,
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku,
          unit_price: price,
          tax_rate: taxRate,
          replaced: !it.id.startsWith("new_"),
        });
      }));
      setReplaceTargetId(null);
    } else {
      // Add new line item
      const newRow = recalcRow({
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity: 1,
        unit_price: price,
        tax_amount: 0,
        tax_rate: taxRate,
        total: price,
        isNew: true,
      });
      setItems((prev) => [...prev, newRow]);
    }
    setProductSearch("");
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return availableProducts
      .filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [availableProducts, productSearch]);

  if (!order) return null;

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const totalTax = items.reduce((s, it) => s + Number(it.tax_amount || 0), 0);
  const total = subtotal + Number(shipping || 0) - Number(discount || 0);

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error("Order must have at least one item");
      return;
    }
    setSaving(true);
    try {
      // 1) Delete removed items
      if (removedIds.length > 0) {
        const { error } = await supabase.from("order_items").delete().in("id", removedIds);
        if (error) throw error;
      }

      // 2) Update existing items (including replaced product_id)
      const existing = items.filter((it) => !it.id.startsWith("new_"));
      for (const it of existing) {
        const { error } = await supabase
          .from("order_items")
          .update({
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: it.tax_amount,
            total: it.total,
          })
          .eq("id", it.id);
        if (error) throw error;
      }

      // 3) Insert new items
      const newOnes = items.filter((it) => it.id.startsWith("new_"));
      if (newOnes.length > 0) {
        const { error } = await supabase.from("order_items").insert(
          newOnes.map((it) => ({
            order_id: order.id,
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: it.tax_amount,
            total: it.total,
          }))
        );
        if (error) throw error;
      }

      // 4) Update order
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
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-semibold">Items</Label>
              {replaceTargetId && (
                <span className="text-xs text-primary">
                  Pick a product below to replace the selected line.{" "}
                  <button type="button" className="underline" onClick={() => setReplaceTargetId(null)}>Cancel</button>
                </span>
              )}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 text-xs">Product</th>
                    <th className="text-right p-2 text-xs w-20">Qty</th>
                    <th className="text-right p-2 text-xs w-28">Unit Price</th>
                    <th className="text-right p-2 text-xs w-24">Tax (incl.)</th>
                    <th className="text-right p-2 text-xs w-24">Total</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className={`border-t ${replaceTargetId === it.id ? "bg-primary/5" : ""}`}
                    >
                      <td className="p-2">
                        <div className="font-medium">{it.product_name}</div>
                        {it.product_sku && (
                          <div className="text-[11px] text-muted-foreground">{it.product_sku}</div>
                        )}
                        {it.isNew && <span className="text-[10px] text-primary">• new</span>}
                        {it.replaced && <span className="text-[10px] text-amber-600">• replaced</span>}
                      </td>
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
                      <td className="p-2 text-right text-muted-foreground">
                        ₹{Number(it.tax_amount).toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-medium">₹{Number(it.total).toFixed(2)}</td>
                      <td className="p-1">
                        <div className="flex items-center gap-0.5 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Replace product"
                            onClick={() =>
                              setReplaceTargetId(replaceTargetId === it.id ? null : it.id)
                            }
                          >
                            <Replace className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Remove" onClick={() => removeItem(it.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-sm">No items</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Product picker */}
            <div className="mt-3 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                {replaceTargetId ? (
                  <Replace className="h-4 w-4 text-primary" />
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground" />
                )}
                <Label className="text-xs font-semibold">
                  {replaceTargetId ? "Replace with product" : "Add product to order"}
                </Label>
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name or SKU..."
                  className="pl-8 h-9"
                />
              </div>
              {productSearch && filteredProducts.length > 0 && (
                <div className="mt-2 border rounded-md bg-background divide-y max-h-56 overflow-y-auto">
                  {filteredProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => pickProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.sku}
                          {p.size ? ` • ${p.size}` : ""}
                          {p.color ? ` • ${p.color}` : ""}
                        </div>
                      </div>
                      <span className="text-sm font-semibold">₹{Number(p.selling_price).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
              {productSearch && filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No matching in-stock products.</p>
              )}
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
            <div className="flex justify-between"><span>Subtotal (incl. GST)</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>GST included</span><span>₹{totalTax.toFixed(2)}</span></div>
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
