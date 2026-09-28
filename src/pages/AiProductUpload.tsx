import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Upload, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { extractVideoFrames } from "@/lib/videoFrames";

type Pricing = { selling_price: string; mrp: string; buying_price: string; quantity: string };
type Item = Pricing & {
  id: string;
  preview: string;
  url?: string;
  status: "uploading" | "reading" | "ready" | "error" | "saved";
  error?: string;
  name: string; brand: string; category: string; subcategory: string;
  size: string; color: string; material: string; description: string;
};

const emptyPricing: Pricing = { selling_price: "", mrp: "", buying_price: "", quantity: "1" };

export default function AiProductUpload() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pricing, setPricing] = useState<Pricing>(emptyPricing);
  const [applyAll, setApplyAll] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  const patch = (id: string, p: Partial<Item>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...p } : it)));

  const pricingValid = (p: Pricing) =>
    Number(p.selling_price) > 0 && Number(p.buying_price) > 0 && Number(p.quantity) > 0;

  const [videoStatus, setVideoStatus] = useState<string>("");
  const [videoError, setVideoError] = useState<string>("");

  const onVideo = async (file: File | null) => {
    if (!file || !storeId) return;
    if (!Number(pricing.selling_price) || !Number(pricing.buying_price)) {
      toast({ title: "Fill selling price and buying price first", variant: "destructive" });
      return;
    }
    setVideoError("");
    try {
      setVideoStatus("Reading video…");
      const blobs = await extractVideoFrames(file, { count: 16 });
      if (!blobs.length) throw new Error("No frames could be read from this video");
      setVideoStatus(`Uploading ${blobs.length} frames…`);
      const stamp = Date.now();
      const urls = await Promise.all(blobs.map(async (b, i) => {
        const path = `${storeId}/ai-video-${stamp}-${i}.jpg`;
        const { error } = await supabase.storage.from("product-media").upload(path, b, { upsert: true, contentType: "image/jpeg" });
        if (error) throw error;
        return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
      }));
      setVideoStatus("AI finding products, sizes and quantities…");
      const { data, error: fnErr } = await supabase.functions.invoke("ai-product-from-photo", { body: { frameUrls: urls } });
      if (fnErr || data?.error) {
        let msg = data?.error || fnErr?.message;
        try { const b = await (fnErr as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
        throw new Error(msg || "AI could not read this video");
      }
      const products: any[] = data.products || [];
      if (!products.length) throw new Error("AI didn't find any products in this video");
      const newItems: Item[] = products.map(p => {
        const url = urls[Math.min(Math.max(0, Number(p.best_frame) || 0), urls.length - 1)];
        const aiQty = Math.max(1, Number(p.quantity) || 1);
        return {
          id: crypto.randomUUID(), preview: url, url, status: "ready",
          selling_price: pricing.selling_price, mrp: pricing.mrp, buying_price: pricing.buying_price,
          quantity: applyAll && Number(pricing.quantity) > 0 ? pricing.quantity : String(aiQty),
          name: p.name || "", brand: p.brand || "", category: p.category || "", subcategory: p.subcategory || "",
          size: p.size || "", color: p.color || "", material: p.material || "", description: p.description || "",
        };
      });
      setItems(prev => [...prev, ...newItems]);
      toast({ title: `AI found ${newItems.length} product${newItems.length === 1 ? "" : "s"}` });
    } catch (e: any) {
      setVideoError(e?.message || "Failed");
    } finally {
      setVideoStatus("");
    }
  };

  const applyPricingToAll = () => {
    setItems(prev => prev.map(it => (it.status === "saved" ? it : { ...it, ...pricing })));
    toast({ title: "Prices & quantity applied to all photos" });
  };

  const saveAll = async () => {
    if (!storeId) return;
    const toSave = items.filter(it => it.status === "ready");
    const bad = toSave.find(it => !it.name.trim() || !pricingValid(it));
    if (bad) {
      toast({ title: "Some products are missing name, selling price, buying price or quantity", variant: "destructive" });
      return;
    }
    setSaving(true);
    let ok = 0;
    for (const it of toSave) {
      try {
        const sizeCode = it.size.toUpperCase().replace(/[^A-Z0-9]+/g, "");
        const sku = `AI-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}${sizeCode ? "-" + sizeCode : ""}`;
        const buying = parseFloat(it.buying_price);
        const { data: product, error } = await supabase.from("products").insert({
          store_id: storeId, sku, name: it.name.trim(),
          brand: it.brand || null, category: it.category || null, subcategory: it.subcategory || null,
          size: it.size || null, color: it.color || null, material: it.material || null,
          description: it.description || null,
          selling_price: parseFloat(it.selling_price),
          mrp: it.mrp ? parseFloat(it.mrp) : null,
          buying_price: buying, tax_rate: 1, photo_url: it.url || null,
        }).select("id").single();
        if (error) throw error;
        const { error: bErr } = await supabase.from("inventory_batches").insert({
          product_id: product.id, store_id: storeId, buying_price: buying, quantity: parseInt(it.quantity),
        });
        if (bErr) throw bErr;
        patch(it.id, { status: "saved" });
        ok++;
      } catch (e: any) {
        patch(it.id, { status: "error", error: e?.message || "Save failed" });
      }
    }
    setSaving(false);
    toast({ title: `${ok} product${ok === 1 ? "" : "s"} added to inventory` });
  };

  const readyCount = items.filter(i => i.status === "ready").length;
  const busy = items.some(i => i.status === "uploading" || i.status === "reading");

  const field = (it: Item, key: keyof Item, label: string, type = "text") => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={it[key] as string} disabled={it.status === "saved"}
        onChange={e => patch(it.id, { [key]: e.target.value } as Partial<Item>)} className="h-8" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> AI Product Upload</h1>
        <p className="text-sm text-muted-foreground">Upload a video showing your products (with size tags visible). AI finds each product and fills in name, brand, category, size, colour and quantity.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Step 1 — Prices for this batch</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["selling_price", "mrp", "buying_price", "quantity"] as const).map(k => (
              <div key={k}>
                <Label>{{ selling_price: "Selling Price ₹ *", mrp: "MRP ₹", buying_price: "Buying Price ₹ *", quantity: "Quantity (blank = AI count)" }[k]}</Label>
                <Input type="number" value={pricing[k]} onChange={e => setPricing({ ...pricing, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={applyAll} onCheckedChange={setApplyAll} id="applyall" />
              <Label htmlFor="applyall">Apply to all products found in this video</Label>
            </div>
            {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={applyPricingToAll}>Apply to all products now</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Leave quantity blank to use the number of pieces AI counts in the video.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step 2 — Upload video</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={() => fileRef.current?.click()} disabled={!storeId || !!videoStatus}>
            {videoStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {videoStatus || "Choose video"}
          </Button>
          <input ref={fileRef} type="file" accept="video/*" className="hidden"
            onChange={e => { onVideo(e.target.files?.[0] || null); e.target.value = ""; }} />
          <p className="text-xs text-muted-foreground">Tip: show each product slowly for 2–3 seconds with its size tag facing the camera.</p>
          {videoError && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" /> {videoError}</p>}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Step 3 — Review ({items.length} products)</h2>
            <Button onClick={saveAll} disabled={saving || busy || readyCount === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {readyCount} to inventory
            </Button>
          </div>
          {items.map(it => (
            <Card key={it.id}>
              <CardContent className="p-3 flex flex-col md:flex-row gap-3">
                <div className="relative w-full md:w-32 shrink-0">
                  <img src={it.url || it.preview} alt="" className="w-full md:w-32 h-40 object-cover rounded border" />
                  {it.status !== "saved" && (
                    <button onClick={() => setItems(p => p.filter(x => x.id !== it.id))}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-xs flex items-center gap-1">
                    {(it.status === "uploading" || it.status === "reading") && <><Loader2 className="h-3 w-3 animate-spin" /> {it.status === "uploading" ? "Uploading…" : "AI reading photo…"}</>}
                    {it.status === "ready" && <span className="text-primary">Ready — check details</span>}
                    {it.status === "saved" && <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /> Added to inventory</span>}
                    {it.status === "error" && <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {it.error}</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="col-span-2">{field(it, "name", "Name *")}</div>
                    {field(it, "brand", "Brand")}
                    {field(it, "size", "Size")}
                    {field(it, "category", "Category")}
                    {field(it, "subcategory", "Sub-category")}
                    {field(it, "color", "Colour")}
                    {field(it, "material", "Material")}
                    {field(it, "selling_price", "Selling ₹ *", "number")}
                    {field(it, "mrp", "MRP ₹", "number")}
                    {field(it, "buying_price", "Buying ₹ *", "number")}
                    {field(it, "quantity", "Qty *", "number")}
                  </div>
                  {field(it, "description", "Description")}
                  {it.status === "error" && it.url && (
                    <Button size="sm" variant="outline" onClick={() => patch(it.id, { status: "ready", error: undefined })}>
                      Fill manually
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
