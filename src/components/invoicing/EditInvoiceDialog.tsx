import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  payment_method: string;
  status: string;
  notes: string | null;
}

interface Props {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditInvoiceDialog({ invoice, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(invoice.payment_method);
  const [status, setStatus] = useState(invoice.status);
  const [notes, setNotes] = useState(invoice.notes || "");
  const [discountAmount, setDiscountAmount] = useState(String(invoice.discount_amount));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          payment_method: paymentMethod,
          status,
          notes: notes || null,
          discount_amount: Number(discountAmount) || 0,
        })
        .eq("id", invoice.id);

      if (error) throw error;
      toast({ title: "Invoice updated successfully" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Invoice {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="partially_returned">Partial Return</SelectItem>
                <SelectItem value="fully_returned">Fully Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Discount Amount (₹)</Label>
            <Input
              type="number"
              value={discountAmount}
              onChange={e => setDiscountAmount(e.target.value)}
              min="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
