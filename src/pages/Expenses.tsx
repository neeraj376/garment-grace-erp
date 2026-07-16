import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Trash2, Upload, FileText, Receipt, Wallet } from "lucide-react";

const COST_TYPES = ["Rent", "Salaries", "Electricity", "Courier Bill", "Internet", "Water", "Maintenance", "Marketing", "Other"];
type Frequency = "one_time" | "weekly" | "monthly" | "custom";

interface OperatingCost {
  id: string;
  cost_type: string;
  amount: number;
  frequency: Frequency;
  period_start: string;
  period_end: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function computeRange(freq: Frequency, start: string, end: string) {
  const s = new Date(start);
  if (freq === "one_time") return { period_start: start, period_end: start };
  if (freq === "weekly") {
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return { period_start: start, period_end: e.toISOString().slice(0, 10) };
  }
  if (freq === "monthly") {
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    return { period_start: start, period_end: e.toISOString().slice(0, 10) };
  }
  return { period_start: start, period_end: end || start };
}

export default function Expenses() {
  const { storeId } = useStore();
  const [costs, setCosts] = useState<OperatingCost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [costType, setCostType] = useState<string>("Rent");
  const [customType, setCustomType] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const fetchCosts = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("operating_costs")
      .select("*")
      .eq("store_id", storeId)
      .order("period_start", { ascending: false });
    setLoading(false);
    if (error) { toast({ title: "Failed to load", description: error.message, variant: "destructive" }); return; }
    setCosts((data ?? []) as OperatingCost[]);
  };

  useEffect(() => { fetchCosts(); }, [storeId]);

  const reset = () => {
    setCostType("Rent"); setCustomType(""); setAmount("");
    setFrequency("monthly"); setPeriodStart(todayISO()); setPeriodEnd(todayISO());
    setNotes(""); setReceipt(null);
  };

  const handleSave = async () => {
    if (!storeId) return;
    const type = costType === "Other" ? customType.trim() : costType;
    const amt = Number(amount);
    if (!type) return toast({ title: "Cost type required", variant: "destructive" });
    if (!amt || amt <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
    if (!periodStart) return toast({ title: "Start date required", variant: "destructive" });
    if (frequency === "custom" && !periodEnd) return toast({ title: "End date required for custom", variant: "destructive" });

    setSaving(true);
    let receipt_url: string | null = null;
    if (receipt) {
      const ext = receipt.name.split(".").pop() || "bin";
      const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("operating-cost-receipts").upload(path, receipt);
      if (upErr) { setSaving(false); toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); return; }
      receipt_url = path;
    }

    const range = computeRange(frequency, periodStart, periodEnd);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("operating_costs").insert({
      store_id: storeId,
      cost_type: type,
      amount: amt,
      frequency,
      period_start: range.period_start,
      period_end: range.period_end,
      notes: notes || null,
      receipt_url,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Expense saved" });
    reset();
    fetchCosts();
  };

  const handleDelete = async (id: string, receipt_url: string | null) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("operating_costs").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    if (receipt_url) await supabase.storage.from("operating-cost-receipts").remove([receipt_url]);
    toast({ title: "Deleted" });
    fetchCosts();
  };

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("operating-cost-receipts").createSignedUrl(path, 300);
    if (error || !data) return toast({ title: "Cannot open receipt", variant: "destructive" });
    window.open(data.signedUrl, "_blank");
  };

  const summary = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const inMonth = (c: OperatingCost) => new Date(c.period_start) <= now && new Date(c.period_end) >= startOfMonth;
    const monthTotal = costs.filter(inMonth).reduce((s, c) => s + Number(c.amount), 0);
    const allTotal = costs.reduce((s, c) => s + Number(c.amount), 0);
    const byType: Record<string, number> = {};
    costs.filter(inMonth).forEach(c => { byType[c.cost_type] = (byType[c.cost_type] || 0) + Number(c.amount); });
    return { monthTotal, allTotal, byType };
  }, [costs]);

  const fmt = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Expenses / Operating Costs</h1>
        <p className="text-sm text-muted-foreground mt-1">Track rent, salaries, electricity, courier bills and other operating expenses</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Wallet className="h-4 w-4" />This Month</div>
          <p className="text-2xl font-bold font-display">{fmt(summary.monthTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Receipt className="h-4 w-4" />All Recorded</div>
          <p className="text-2xl font-bold font-display">{fmt(summary.allTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><FileText className="h-4 w-4" />Entries</div>
          <p className="text-2xl font-bold font-display">{costs.length}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="section-title">Add Expense</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Cost Type</Label>
              <Select value={costType} onValueChange={setCostType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              {costType === "Other" && (
                <Input className="mt-2" placeholder="Specify type" value={customType} onChange={e => setCustomType(e.target.value)} />
              )}
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={v => setFrequency(v as Frequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{frequency === "one_time" ? "Date" : "Period Start"}</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            {frequency === "custom" && (
              <div>
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Receipt (optional)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={e => setReceipt(e.target.files?.[0] ?? null)} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={saving}><Upload className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Expense"}</Button>
            <Button variant="outline" onClick={reset} disabled={saving}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Recorded Expenses</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : costs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No expenses recorded yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.cost_type}</TableCell>
                    <TableCell className="capitalize">{c.frequency.replace("_", " ")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.period_start}{c.period_end !== c.period_start ? ` → ${c.period_end}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(c.amount))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{c.notes || "—"}</TableCell>
                    <TableCell>
                      {c.receipt_url ? (
                        <Button size="sm" variant="ghost" onClick={() => openReceipt(c.receipt_url!)}>
                          <FileText className="h-4 w-4 mr-1" />View
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id, c.receipt_url)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
