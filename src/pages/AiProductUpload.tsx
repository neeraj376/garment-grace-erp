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
import { optimizeImage } from "@/lib/imageOptimize";

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

  const processOne = async (file: File, id: string) => {
    try {
      const optimized = await optimizeImage(file, { maxDimension: 1600, quality: 0.85 });
      const ext = (optimized.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${storeId}/ai-upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from("product-media")
        .upload(path, optimized, { upsert: true, contentType: optimized.type });
      if (error) throw error;
      const url = supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
      patch(id, { url, status: "reading" });

      const { data, error: fnErr } = await supabase.functions.invoke("ai-product-from-photo", { body: { imageUrl: url } });
      if (fnErr || data?.error) {
        let msg = data?.error || fnErr?.message;
        try { const b = await (fnErr as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
        throw new Error(msg || "AI could not read this photo");
      }
      const p = data.product || {};
      patch(id, {
        status: "ready",
        name: p.name || "", brand: p.brand || "", category: p.category || "", subcategory: p.subcategory || "",
        size: p.size || "", color: p.color || "", material: p.material || "", description: p.description || "",
      });
    } catch (e: any) {
      patch(id, { status: "error", error: e?.message || "Failed" });
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !storeId) return;
    if (applyAll && !pricingValid(pricing)) {
      toast({ title: "Fill selling price, buying price and quantity first", variant: "destructive" });
      return;
    }
    const list = Array.from(files);
    const newItems: Item[] = list.map(f => ({
      id: crypto.randomUUID(), preview: URL.createObjectURL(f), status: "uploading",
      ...(applyAll ? pricing : emptyPricing),
      name: "", brand: "", category: "", subcategory: "", size: "", color: "", material: "", description: "",
    }));
    setItems(prev => [...prev, ...newItems]);
    // Process 3 at a time to stay within rate limits
    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map((f, j) => processOne(f, newItems[i + j].id)));
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
        <p className="text-sm text-muted-foreground">Upload product photos (with size visible). AI fills in name, brand, category, size and colour.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Step 1 — Prices & quantity for this batch</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["selling_price", "mrp", "buying_price", "quantity"] as const).map(k => (
              <div key={k}>
                <Label>{{ selling_price: "Selling Price ₹ *", mrp: "MRP ₹", buying_price: "Buying Price ₹ *", quantity: "Quantity *" }[k]}</Label>
                <Input type="number" value={pricing[k]} onChange={e => setPricing({ ...pricing, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={applyAll} onCheckedChange={setApplyAll} id="applyall" />
              <Label htmlFor="applyall">Apply to all uploaded photos in this batch</Label>
            </div>
            {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={applyPricingToAll}>Apply to all photos now</Button>
            )}
          </div>
          {!applyAll && <p className="text-xs text-muted-foreground">You'll enter prices and quantity for each photo below.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step 2 — Upload photos</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={() => fileRef.current?.click()} disabled={!storeId}>
            <Upload className="h-4 w-4 mr-2" /> Choose photos
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Step 3 — Review ({items.length} photos)</h2>
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
