import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvoiceItem {
  id: string;
  product_id: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  products: { name: string; sku: string } | null;
}

interface ReturnItem {
  item: InvoiceItem;
  selected: boolean;
  returnQty: number;
}

interface Props {
  invoice: { id: string; invoice_number: string; total_amount: number; status: string };
  storeId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReturnDialog({ invoice, storeId, userId, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchItems = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("invoice_items")
        .select("id, product_id, quantity, returned_quantity, unit_price, tax_amount, total, products(name, sku)")
        .eq("invoice_id", invoice.id);

      setItems(
        (data as any)?.map((item: InvoiceItem) => ({
          item,
          selected: false,
          returnQty: Math.max(0, item.quantity - item.returned_quantity),
        })) ?? []
      );
      setLoading(false);
    };
    fetchItems();
  }, [open, invoice.id]);

  const returnable = items.filter(r => r.item.quantity - r.item.returned_quantity > 0);
  const selected = items.filter(r => r.selected && r.returnQty > 0);

  const totalRefund = selected.reduce((sum, r) => {
    const perUnitTotal = r.item.total / r.item.quantity;
    return sum + perUnitTotal * r.returnQty;
  }, 0);

  const handleReturn = async () => {
    if (selected.length === 0) {
      toast({ title: "Error", description: "Select at least one item to return", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      // 1. Create return records
      const returnRecords = selected.map(r => ({
        invoice_id: invoice.id,
        invoice_item_id: r.item.id,
        product_id: r.item.product_id,
        store_id: storeId,
        quantity_returned: r.returnQty,
        refund_amount: parseFloat(((r.item.total / r.item.quantity) * r.returnQty).toFixed(2)),
        reason: reason || null,
        created_by: userId,
      }));

      const { error: returnError } = await supabase.from("invoice_returns").insert(returnRecords);
      if (returnError) throw returnError;

      // 2. Update returned_quantity on invoice_items
      for (const r of selected) {
        const newReturnedQty = r.item.returned_quantity + r.returnQty;
        const { error } = await supabase
          .from("invoice_items")
          .update({ returned_quantity: newReturnedQty })
          .eq("id", r.item.id);
        if (error) throw error;
      }

      // 3. Add inventory back to inventory_batches
      for (const r of selected) {
        // Find the latest batch for this product or create a new one
        const { data: existingBatch } = await supabase
          .from("inventory_batches")
          .select("id, quantity")
          .eq("product_id", r.item.product_id)
          .eq("store_id", storeId)
          .order("received_at", { ascending: false })
          .limit(1)
          .single();

        if (existingBatch) {
          await supabase
            .from("inventory_batches")
            .update({ quantity: existingBatch.quantity + r.returnQty })
            .eq("id", existingBatch.id);
        } else {
          await supabase.from("inventory_batches").insert({
            product_id: r.item.product_id,
            store_id: storeId,
            quantity: r.returnQty,
            buying_price: 0,
            batch_number: `RTN-${Date.now().toString(36).toUpperCase()}`,
          });
        }
      }

      // 4. Update invoice status
      const allItems = items.map(r => {
        const sel = selected.find(s => s.item.id === r.item.id);
        const totalReturned = r.item.returned_quantity + (sel ? sel.returnQty : 0);
        return { qty: r.item.quantity, returned: totalReturned };
      });

      const allFullyReturned = allItems.every(i => i.returned >= i.qty);
      const anyReturned = allItems.some(i => i.returned > 0);

      const newStatus = allFullyReturned ? "fully_returned" : anyReturned ? "partially_returned" : "completed";

      await supabase.from("invoices").update({ status: newStatus }).eq("id", invoice.id);

      toast({
        title: "Return processed",
        description: `Refund of ₹${totalRefund.toLocaleString("en-IN")} — ${selected.length} item(s) returned to stock`,
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Process Return — {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : returnable.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">All items have already been returned.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Sold</TableHead>
                  <TableHead className="text-center">Already Returned</TableHead>
                  <TableHead className="text-center">Return Qty</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r, idx) => {
                  const maxReturn = r.item.quantity - r.item.returned_quantity;
                  if (maxReturn <= 0) return null;
                  const perUnit = r.item.total / r.item.quantity;
                  return (
                    <TableRow key={r.item.id}>
                      <TableCell>
                        <Checkbox
                          checked={r.selected}
                          onCheckedChange={checked =>
                            setItems(items.map((it, i) => i === idx ? { ...it, selected: !!checked } : it))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.item.products?.name}</div>
                        <div className="text-xs text-muted-foreground">{r.item.products?.sku}</div>
                      </TableCell>
                      <TableCell className="text-center">{r.item.quantity}</TableCell>
                      <TableCell className="text-center">{r.item.returned_quantity}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min={1}
                          max={maxReturn}
                          value={r.returnQty}
                          onChange={e => {
                            const val = Math.min(Math.max(1, parseInt(e.target.value) || 1), maxReturn);
                            setItems(items.map((it, i) => i === idx ? { ...it, returnQty: val } : it));
                          }}
                          className="w-16 mx-auto text-center"
                          disabled={!r.selected}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {r.selected ? `₹${(perUnit * r.returnQty).toLocaleString("en-IN")}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="space-y-3">
              <div>
                <Label>Reason for return</Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Optional — e.g. Defective, Wrong size, Customer changed mind"
                  rows={2}
                />
              </div>

              <div className="flex justify-between items-center border-t pt-3">
                <div>
                  <span className="text-sm text-muted-foreground">Total Refund: </span>
                  <span className="text-lg font-bold">₹{totalRefund.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleReturn}
            disabled={processing || selected.length === 0}
            variant="destructive"
          >
            {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Process Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
