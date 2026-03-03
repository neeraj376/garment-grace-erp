import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw, ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

      <WooCommerceSection storeId={storeId} />
    </div>
  );
}

function WooCommerceSection({ storeId }: { storeId: string | null }) {
  const { toast } = useToast();
  const [wooConfig, setWooConfig] = useState<any>(null);
  const [wooUrl, setWooUrl] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from("woocommerce_config")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWooConfig(data);
          setWooUrl(data.woo_store_url);
        }
        setLoading(false);
      });
  }, [storeId]);

  const saveConfig = async () => {
    if (!storeId || !wooUrl) return;
    if (wooConfig) {
      await supabase.from("woocommerce_config").update({ woo_store_url: wooUrl }).eq("id", wooConfig.id);
    } else {
      const { data } = await supabase
        .from("woocommerce_config")
        .insert({ store_id: storeId, woo_store_url: wooUrl })
        .select()
        .single();
      setWooConfig(data);
    }
    toast({ title: "WooCommerce config saved" });
  };

  const runSync = async (fnName: string, body: Record<string, any>) => {
    if (!storeId) return;
    setSyncing(fnName);
    try {
      const res = await supabase.functions.invoke(fnName, { body: { store_id: storeId, ...body } });
      if (res.error) throw res.error;
      toast({ title: "Sync complete", description: JSON.stringify(res.data) });
      // Refresh config for timestamps
      const { data } = await supabase.from("woocommerce_config").select("*").eq("store_id", storeId).maybeSingle();
      if (data) setWooConfig(data);
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : "Never";

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="section-title flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> WooCommerce Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>WooCommerce Store URL</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={wooUrl}
              onChange={e => setWooUrl(e.target.value)}
              placeholder="https://yourstore.com"
              className="flex-1"
            />
            <Button onClick={saveConfig} size="sm">
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">API keys are securely stored. Set your store URL above to enable sync.</p>
        </div>

        {wooConfig && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium">Sync Actions</p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!!syncing}
                onClick={() => runSync("woo-sync-products", { direction: "pull" })}
              >
                {syncing === "woo-sync-products" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
                Pull Products
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!syncing}
                onClick={() => runSync("woo-sync-products", { direction: "push" })}
              >
                {syncing === "woo-sync-products" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4 mr-1" />}
                Push Products
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!syncing}
                onClick={() => runSync("woo-sync-orders", {})}
              >
                {syncing === "woo-sync-orders" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
                Import Orders
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!syncing}
                onClick={() => runSync("woo-sync-stock", { direction: "push" })}
              >
                {syncing === "woo-sync-stock" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sync Stock
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="block font-medium text-foreground">Products</span>
                {formatDate(wooConfig.last_product_sync)}
              </div>
              <div>
                <span className="block font-medium text-foreground">Orders</span>
                {formatDate(wooConfig.last_order_sync)}
              </div>
              <div>
                <span className="block font-medium text-foreground">Stock</span>
                {formatDate(wooConfig.last_stock_sync)}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-1">Webhook URL (for real-time sync)</p>
              <code className="text-xs bg-muted p-2 rounded block break-all">
                {`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/woo-webhook`}
              </code>
              <p className="text-xs text-muted-foreground mt-1">Add this in WooCommerce → Settings → Advanced → Webhooks for order.created, product.updated events.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
