import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Trash2, FileText, ShoppingCart } from "lucide-react";
import { purchaseTotal } from "@/lib/purchaseCost";

interface Purchase {
  id: string; purchase_date: string; vendor_name: string; amount: number;
  gst_applicable: boolean; total_cost: number; quantity: number; bill_url: string | null;
}
const BUCKET = "purchase-bills";
const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function Purchases() {
  const { storeId } = useStore();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState(false);
  const [qty, setQty] = useState("1");
  const [bill, setBill] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const load = async () => {
    if (!storeId) return;
    const { data, error } = await supabase.from("purchases").select("*").eq("store_id", storeId)
      .order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) return toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Purchase[]);
  };
  useEffect(() => { load(); }, [storeId]);

  const total = purchaseTotal(parseFloat(amount), gst);

  const save = async () => {
    if (!storeId) return;
    const amt = parseFloat(amount); const q = parseInt(qty, 10);
    if (!vendor.trim()) return toast({ title: "Enter vendor name", variant: "destructive" });
    if (!(amt >= 0) || amount === "") return toast({ title: "Enter a valid amount", variant: "destructive" });
    if (!(q > 0)) return toast({ title: "Enter a valid quantity", variant: "destructive" });
    setSaving(true);
    let bill_url: string | null = null;
    if (bill) {
      const ext = bill.name.split(".").pop() || "jpg";
      const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, bill);
      if (error) { setSaving(false); return toast({ title: "Bill upload failed", description: error.message, variant: "destructive" }); }
      bill_url = path;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("purchases").insert({
      store_id: storeId, purchase_date: date, vendor_name: vendor.trim(), amount: amt,
      gst_applicable: gst, total_cost: purchaseTotal(amt, gst), quantity: q, bill_url, created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (bill_url) await supabase.storage.from(BUCKET).remove([bill_url]);
      return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }
    toast({ title: "Purchase saved" });
    setVendor(""); setAmount(""); setGst(false); setQty("1"); setBill(null); setFileKey(k => k + 1); setDate(today());
    load();
  };

  const remove = async (p: Purchase) => {
    if (!confirm(`Delete purchase from ${p.vendor_name}?`)) return;
    const { error } = await supabase.from("purchases").delete().eq("id", p.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    if (p.bill_url) await supabase.storage.from(BUCKET).remove([p.bill_url]);
    load();
  };

  const openBill = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) return toast({ title: "Cannot open bill", variant: "destructive" });
    window.open(data.signedUrl, "_blank");
  };

  const grand = rows.reduce((s, r) => s + Number(r.total_cost), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="h-6 w-6" /> Purchases</h1>
      <Card>
        <CardHeader><CardTitle>Add purchase</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Vendor name</Label><Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Sharma Traders" /></div>
          <div><Label>Amount (₹)</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Quantity</Label><Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="gst" checked={gst} onCheckedChange={setGst} />
            <Label htmlFor="gst">GST {gst ? "Yes (+5%)" : "No"}</Label>
          </div>
          <div><Label>Bill picture (optional)</Label><Input key={fileKey} type="file" accept="image/*,application/pdf" onChange={e => setBill(e.target.files?.[0] ?? null)} /></div>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between rounded-md bg-muted p-3">
            <span>Total cost{gst ? " (incl. 5% GST)" : ""}: <strong>{inr(total)}</strong></span>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save purchase"}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Purchase history · {inr(grand)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>GST</TableHead><TableHead className="text-right">Total cost</TableHead>
              <TableHead>Bill</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No purchases yet</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.purchase_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{r.vendor_name}</TableCell>
                  <TableCell className="text-right">{r.quantity}</TableCell>
                  <TableCell className="text-right">{inr(r.amount)}</TableCell>
                  <TableCell>{r.gst_applicable ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right font-medium">{inr(r.total_cost)}</TableCell>
                  <TableCell>{r.bill_url ? <Button size="sm" variant="ghost" onClick={() => openBill(r.bill_url!)}><FileText className="h-4 w-4 mr-1" />View</Button> : "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
