import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Trash2, FileText, ShoppingCart } from "lucide-react";
import { purchaseTotal } from "@/lib/purchaseCost";

interface Purchase {
  id: string; purchase_date: string; vendor_name: string; amount: number;
  gst_applicable: boolean; total_cost: number; quantity: number; bill_url: string | null; details: string | null;
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
  const [details, setDetails] = useState("");
  const [bill, setBill] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [scanning, setScanning] = useState(false);

  const toJpegDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * scale; c.height = img.height * scale;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unreadable image")); };
    img.src = url;
  });

  const onBill = async (file: File | null) => {
    setBill(file);
    if (!file || !file.type.startsWith("image/")) return;
    setScanning(true);
    try {
      const image = await toJpegDataUrl(file);
      const { data, error } = await supabase.functions.invoke("scan-purchase-bill", { body: { image } });
      if (error || data?.error) throw new Error(data?.error || "Could not read the bill");
      const f = data.fields || {};
      if (f.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(f.purchase_date)) setDate(f.purchase_date);
      if (f.vendor_name) setVendor(f.vendor_name);
      if (typeof f.amount === "number") setAmount(String(Math.round(f.amount * 100) / 100));
      if (typeof f.gst_applicable === "boolean") setGst(f.gst_applicable);
      if (Number.isInteger(f.quantity) && f.quantity > 0) setQty(String(f.quantity));
      if (f.details) setDetails(f.details);
      toast({ title: "Details filled from bill", description: "Please check them before saving." });
    } catch (e: any) {
      toast({ title: "Couldn't read the bill", description: e.message + " — fill details manually.", variant: "destructive" });
    } finally { setScanning(false); }
  };

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
      gst_applicable: gst, total_cost: purchaseTotal(amt, gst), quantity: q, details: details.trim() || null, bill_url, created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (bill_url) await supabase.storage.from(BUCKET).remove([bill_url]);
      return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }
    toast({ title: "Purchase saved" });
    setVendor(""); setDetails(""); setAmount(""); setGst(false); setQty("1"); setBill(null); setFileKey(k => k + 1); setDate(today());
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
          <div><Label>Bill picture (optional)</Label><Input key={fileKey} type="file" accept="image/*,application/pdf" onChange={e => onBill(e.target.files?.[0] ?? null)} disabled={scanning} />{scanning && <p className="text-xs text-muted-foreground mt-1">Reading bill…</p>}</div>
          <div className="sm:col-span-2 lg:col-span-3"><Label>Purchase details (optional)</Label><Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="e.g. 20 cotton shirts, assorted sizes" /></div>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between rounded-md bg-muted p-3">
            <span>Total cost{gst ? " (incl. 5% GST)" : ""}: <strong>{inr(total)}</strong></span>
            <Button onClick={save} disabled={saving || scanning}>{saving ? "Saving…" : "Save purchase"}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Purchase history · {inr(grand)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>GST</TableHead><TableHead className="text-right">Total cost</TableHead>
              <TableHead>Bill</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No purchases yet</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.purchase_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{r.vendor_name}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap text-sm text-muted-foreground">{r.details || "—"}</TableCell>
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
