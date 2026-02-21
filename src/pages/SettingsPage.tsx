import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [store, setStore] = useState({ name: "", location: "", gst_number: "", phone: "", email: "", address: "" });
  const [settings, setSettings] = useState({
    loyalty_points_per_amount: 1,
    loyalty_amount_unit: 100,
    whatsapp_enabled: false,
    sms_enabled: false,
    default_discount_percent: 0,
    invoice_prefix: "INV",
  });

  useEffect(() => {
    if (!storeId) return;

    supabase.from("stores").select("*").eq("id", storeId).single().then(({ data }) => {
      if (data) setStore({
        name: data.name, location: data.location || "", gst_number: data.gst_number || "",
        phone: data.phone || "", email: data.email || "", address: data.address || "",
      });
    });

    supabase.from("store_settings").select("*").eq("store_id", storeId).single().then(({ data }) => {
      if (data) setSettings({
        loyalty_points_per_amount: Number(data.loyalty_points_per_amount),
        loyalty_amount_unit: Number(data.loyalty_amount_unit),
        whatsapp_enabled: data.whatsapp_enabled,
        sms_enabled: data.sms_enabled,
        default_discount_percent: Number(data.default_discount_percent),
        invoice_prefix: data.invoice_prefix,
      });
    });
  }, [storeId]);

  const saveStore = async () => {
    if (!storeId) return;
    const { error } = await supabase.from("stores").update(store).eq("id", storeId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Store details saved" });
  };

  const saveSettings = async () => {
    if (!storeId) return;
    const { error } = await supabase.from("store_settings").update(settings).eq("store_id", storeId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Settings saved" });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="page-header">Settings</h1>

      <Card>
        <CardHeader><CardTitle className="section-title">Store Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Store Name</Label><Input value={store.name} onChange={e => setStore({...store, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Location</Label><Input value={store.location} onChange={e => setStore({...store, location: e.target.value})} /></div>
            <div><Label>GST Number</Label><Input value={store.gst_number} onChange={e => setStore({...store, gst_number: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={store.phone} onChange={e => setStore({...store, phone: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={store.email} onChange={e => setStore({...store, email: e.target.value})} /></div>
          </div>
          <div><Label>Address</Label><Input value={store.address} onChange={e => setStore({...store, address: e.target.value})} /></div>
          <Button onClick={saveStore}><Save className="h-4 w-4 mr-2" /> Save Store Details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Loyalty Program</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Points per transaction</Label><Input type="number" value={settings.loyalty_points_per_amount} onChange={e => setSettings({...settings, loyalty_points_per_amount: Number(e.target.value)})} /></div>
            <div><Label>Per ₹ amount</Label><Input type="number" value={settings.loyalty_amount_unit} onChange={e => setSettings({...settings, loyalty_amount_unit: Number(e.target.value)})} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Earn {settings.loyalty_points_per_amount} point(s) for every ₹{settings.loyalty_amount_unit} spent
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Invoice Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Invoice Prefix</Label><Input value={settings.invoice_prefix} onChange={e => setSettings({...settings, invoice_prefix: e.target.value})} className="max-w-xs" /></div>
          <div><Label>Default Discount %</Label><Input type="number" value={settings.default_discount_percent} onChange={e => setSettings({...settings, default_discount_percent: Number(e.target.value)})} className="max-w-xs" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="section-title">Integrations</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">WhatsApp Integration</p>
              <p className="text-xs text-muted-foreground">Send invoices via WhatsApp</p>
            </div>
            <Switch checked={settings.whatsapp_enabled} onCheckedChange={v => setSettings({...settings, whatsapp_enabled: v})} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">SMS Integration</p>
              <p className="text-xs text-muted-foreground">Send invoices via SMS</p>
            </div>
            <Switch checked={settings.sms_enabled} onCheckedChange={v => setSettings({...settings, sms_enabled: v})} />
          </div>
          <Button onClick={saveSettings}><Save className="h-4 w-4 mr-2" /> Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
