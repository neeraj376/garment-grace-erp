import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";

type WNum = {
  id: string;
  store_id: string;
  label: string;
  phone: string;
  provider: string;
  api_url: string | null;
  api_key: string | null;
  template_name: string | null;
  is_active: boolean;
  sort_order: number;
  last_used_at: string | null;
  message_count: number;
};

type LogRow = {
  id: string;
  from_phone: string | null;
  message_text: string | null;
  assigned_number_id: string | null;
  forwarded_ok: boolean;
  error: string | null;
  created_at: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function WhatsAppRotationPage() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<WNum[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    label: "",
    phone: "",
    provider: "interakt",
    api_url: "",
    api_key: "",
    template_name: "",
  });

  const webhookUrl = storeId
    ? `${SUPABASE_URL}/functions/v1/whatsapp-inbound?store_id=${storeId}`
    : "";

  const load = async () => {
    if (!storeId) return;
    const [n, l] = await Promise.all([
      supabase.from("whatsapp_numbers").select("*").eq("store_id", storeId).order("sort_order"),
      supabase.from("whatsapp_inbound_log").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
    ]);
    setNumbers((n.data as WNum[]) || []);
    setLogs((l.data as LogRow[]) || []);
  };

  useEffect(() => { load(); }, [storeId]);

  const addNumber = async () => {
    if (!storeId || !form.label || !form.phone) {
      toast({ title: "Label and phone are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    const maxOrder = numbers.reduce((m, x) => Math.max(m, x.sort_order), -1);
    const { error } = await supabase.from("whatsapp_numbers").insert({
      store_id: storeId,
      label: form.label,
      phone: form.phone,
      provider: form.provider,
      api_url: form.api_url || null,
      api_key: form.api_key || null,
      template_name: form.template_name || null,
      sort_order: maxOrder + 1,
    });
    setLoading(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Number added" });
      setForm({ label: "", phone: "", provider: "interakt", api_url: "", api_key: "", template_name: "" });
      load();
    }
  };

  const toggle = async (id: string, is_active: boolean) => {
    await supabase.from("whatsapp_numbers").update({ is_active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this number from the rotation?")) return;
    await supabase.from("whatsapp_numbers").delete().eq("id", id);
    load();
  };

  const move = async (id: string, direction: -1 | 1) => {
    const idx = numbers.findIndex((n) => n.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= numbers.length) return;
    const a = numbers[idx], b = numbers[swapIdx];
    await Promise.all([
      supabase.from("whatsapp_numbers").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("whatsapp_numbers").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    load();
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Webhook URL copied" });
  };

  const resetCounts = async () => {
    if (!storeId) return;
    await supabase.from("whatsapp_numbers").update({ message_count: 0 }).eq("store_id", storeId);
    load();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <h1 className="page-header">WhatsApp Round-Robin</h1>

      <Card>
        <CardHeader><CardTitle className="section-title">Inbound Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Configure this URL as the inbound webhook on each WhatsApp Business number's provider dashboard.
            Every new customer message is forwarded to the next active number in rotation
            (sticky per customer — repeat customers go to the same number).
          </p>
          <div className="flex gap-2 items-center">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhook}><Copy className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Add WhatsApp Number</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Agent A" /></div>
            <div><Label>Phone (with country code)</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919999999999" /></div>
            <div>
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interakt">Interakt</SelectItem>
                  <SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem>
                  <SelectItem value="generic">Generic (POST to/text)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Template name (optional)</Label><Input value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} placeholder="e.g. customer_lead_alert" /></div>
            <div className="md:col-span-2"><Label>API URL</Label><Input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} placeholder="https://api.interakt.ai/v1/public/message/" /></div>
            <div className="md:col-span-2"><Label>API Key</Label><Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="API key / token" /></div>
          </div>
          <Button onClick={addNumber} disabled={loading}><Plus className="h-4 w-4 mr-2" /> Add to Rotation</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="section-title">Rotation Chain</CardTitle>
          <Button variant="outline" size="sm" onClick={resetCounts}>Reset counts</Button>
        </CardHeader>
        <CardContent>
          {numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No numbers added yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Msgs</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n, i) => (
                  <TableRow key={n.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{n.label}</TableCell>
                    <TableCell className="font-mono text-xs">{n.phone}</TableCell>
                    <TableCell>{n.provider}</TableCell>
                    <TableCell>{n.message_count}</TableCell>
                    <TableCell><Switch checked={n.is_active} onCheckedChange={(v) => toggle(n.id, v)} /></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => move(n.id, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => move(n.id, 1)} disabled={i === numbers.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Recent Inbound (last 50)</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inbound messages yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => {
                  const assigned = numbers.find((n) => n.id === l.assigned_number_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{l.from_phone || "-"}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.message_text || "-"}</TableCell>
                      <TableCell>{assigned?.label || "-"}</TableCell>
                      <TableCell className={l.forwarded_ok ? "text-green-600" : "text-destructive"}>
                        {l.forwarded_ok ? "OK" : l.error || "Failed"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
