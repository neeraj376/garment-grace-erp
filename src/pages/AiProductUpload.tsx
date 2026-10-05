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
import { extractTimedVideoFrames } from "@/lib/videoFrames";
import { extractSpeechChunks } from "@/lib/videoAudio";
import { serializePhotoUrls } from "@/lib/photoUtils";

type Pricing = { selling_price: string; mrp: string; buying_price: string; quantity: string; size: string };
type Item = Pricing & {
  id: string;
  preview: string;
  url?: string;
  urls?: string[];
  status: "uploading" | "reading" | "cleaning" | "ready" | "error" | "saved";
  error?: string;
  photoWarning?: string;
  name: string; brand: string; category: string; subcategory: string;
  size: string; color: string; material: string; description: string;
};

const emptyPricing: Pricing = { selling_price: "", mrp: "", buying_price: "", quantity: "1", size: "" };

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
    // A new video starts a fresh batch — drop everything shown so far.
    setItems([]);
    let temporaryFramePaths: string[] = [];
    try {
      setVideoStatus("Reading video…");
      const timed = await extractTimedVideoFrames(file, { count: 16 });
      const blobs = timed.map(f => f.blob);
      if (!blobs.length) throw new Error("No frames could be read from this video");
      setVideoStatus(`Uploading ${blobs.length} frames…`);
      const stamp = Date.now();
      const uploaded: { path: string; url: string }[] = [];
      for (let i = 0; i < blobs.length; i += 1) {
        const b = blobs[i];
        const path = `${storeId}/ai-video-${stamp}-${i}.jpg`;
        const { error } = await supabase.storage.from("product-media").upload(path, b, { upsert: true, contentType: "image/jpeg" });
        if (error) throw error;
        temporaryFramePaths.push(path);
        uploaded.push({ path, url: supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl });
      }
      const urls = uploaded.map(frame => frame.url);
      // Listen for spoken quantities; audio is transcribed in small chunks and never stored.
      const transcript: { start: number; end: number; text: string }[] = [];
      const chunks = await extractSpeechChunks(file).catch(() => []);
      for (let i = 0; i < chunks.length; i += 1) {
        setVideoStatus(`Listening to the video (${i + 1} of ${chunks.length})…`);
        const fd = new FormData();
        fd.append("file", new File([chunks[i].blob], "speech.wav", { type: "audio/wav" }));
        const { data: tr, error: trErr } = await supabase.functions.invoke("transcribe-audio", { body: fd });
        if (trErr || tr?.error) {
          let msg = tr?.error || trErr?.message;
          try { const b = await (trErr as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
          const status = (trErr as any)?.context?.status;
          if (status === 402 || status === 403) throw new Error(msg || "AI is unavailable");
          break; // keep going with visual counting
        }
        if (tr?.text) transcript.push({ start: chunks[i].start, end: chunks[i].end, text: tr.text });
      }
      setVideoStatus("AI finding products, sizes and quantities…");
      const { data, error: fnErr } = await supabase.functions.invoke("ai-product-from-photo", { body: { frameUrls: urls, frameTimes: timed.map(f => f.time), transcript } });
      if (fnErr || data?.error) {
        let msg = data?.error || fnErr?.message;
        try { const b = await (fnErr as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
        throw new Error(msg || "AI could not read this video");
      }
      const products: any[] = data.products || [];
      if (!products.length) throw new Error("AI didn't find any products in this video");
      const newItems: Item[] = products.map(p => {
        const frameIndex = Math.min(Math.max(0, Number(p.best_frame) || 0), urls.length - 1);
        const url = urls[frameIndex];
        const aiQty = Math.max(1, Number(p.quantity) || 1);
        return {
          id: crypto.randomUUID(), preview: url, url, status: "cleaning",
          selling_price: pricing.selling_price, mrp: pricing.mrp, buying_price: pricing.buying_price,
          size: applyAll && pricing.size.trim() ? pricing.size.trim() : (p.size || ""),
          quantity: applyAll && Number(pricing.quantity) > 0 ? pricing.quantity : String(aiQty),
          name: p.name || "", brand: p.brand || "", category: p.category || "", subcategory: p.subcategory || "",
          color: p.color || "", material: p.material || "", description: p.description || "",
        };
      });
      setItems(newItems);
      setVideoStatus(`Cleaning ${newItems.length} product photo${newItems.length === 1 ? "" : "s"}…`);

      let fallbackCount = 0;
      const clampFrame = (v: any) => Math.min(Math.max(0, Number(v) || 0), uploaded.length - 1);
      for (let index = 0; index < newItems.length; index += 1) {
        const item = newItems[index];
        const product = products[index];
        const best = clampFrame(product.best_frame);
        const frames = [best];
        for (const f of Array.isArray(product.angle_frames) ? product.angle_frames : []) {
          const fi = clampFrame(f);
          if (!frames.includes(fi) && frames.length < 3) frames.push(fi);
        }
        const finalUrls: string[] = [];
        let warning: string | undefined;
        let lastError: string | undefined;
        for (let v = 0; v < frames.length; v += 1) {
          const frameIndex = frames[v];
          setVideoStatus(`Cleaning product ${index + 1} of ${newItems.length} — photo ${v + 1} of ${frames.length}…`);
          const outputPath = `${storeId}/ai-products/${stamp}-${index}-${v}-${item.id}.jpg`;
          const { data: cleaned, error: cleanError } = await supabase.functions.invoke("make-thumb-from-frame", {
            body: { framePath: uploaded[frameIndex].path, outputPath, productName: item.name, storeId },
          });
          if (!cleanError && !cleaned?.error && cleaned?.url) { finalUrls.push(cleaned.url); continue; }
          let message = cleaned?.error || cleanError?.message || "Photo cleanup failed";
          try {
            const details = await (cleanError as any)?.context?.json?.();
            if (details?.error) message = details.error;
          } catch { /* response body unavailable */ }
          let fallbackError: any = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const res = await supabase.storage.from("product-media").upload(
              outputPath, blobs[frameIndex], { contentType: "image/jpeg", upsert: true },
            );
            fallbackError = res.error;
            if (!fallbackError) break;
            await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          }
          if (fallbackError) { lastError = fallbackError.message; continue; }
          fallbackCount += 1;
          warning = `${message} Original frame kept for some photos.`;
          finalUrls.push(supabase.storage.from("product-media").getPublicUrl(outputPath).data.publicUrl);
        }
        if (!finalUrls.length) {
          patch(item.id, { status: "error", error: lastError || "Photo upload failed", url: undefined, urls: undefined, photoWarning: "Temporary frames will still be deleted." });
        } else {
          patch(item.id, { status: "ready", url: finalUrls[0], urls: finalUrls, photoWarning: warning });
        }
      }
      toast({
        title: `AI found ${newItems.length} product${newItems.length === 1 ? "" : "s"}`,
        description: fallbackCount > 0 ? `${fallbackCount} original video frame${fallbackCount === 1 ? " was" : "s were"} kept because cleanup was unavailable.` : "Product photos are cleaned and ready for review.",
      });
    } catch (e: any) {
      setVideoError(e?.message || "Failed");
    } finally {
      if (temporaryFramePaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from("product-media").remove(temporaryFramePaths);
        if (cleanupError) {
          toast({
            title: "Temporary video frames could not be deleted",
            description: cleanupError.message,
            variant: "destructive",
          });
        }
      }
      setVideoStatus("");
    }
  };

  const applyPricingToAll = () => {
    const filled = Object.fromEntries(Object.entries(pricing).filter(([, v]) => v !== "")) as Partial<Pricing>;
    setItems(prev => prev.map(it => (it.status === "saved" ? it : { ...it, ...filled })));
    toast({ title: "Prices, size & quantity applied to all photos" });
  };

  const saveAll = async () => {
    if (!storeId) return;
    const toSave = items.filter(it => it.status === "ready");
    if (toSave.some(it => !it.url)) {
      toast({ title: "Some products have no photo yet — remove them or upload the video again", variant: "destructive" });
      return;
    }
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
        const rand = Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 5).toUpperCase()).join("");
        const sku = `AI-${Date.now().toString(36).toUpperCase()}${rand}${sizeCode ? "-" + sizeCode : ""}`;
        const buying = parseFloat(it.buying_price);
        const { data: product, error } = await supabase.from("products").insert({
          store_id: storeId, sku, name: it.name.trim(),
          brand: it.brand || null, category: it.category || null, subcategory: it.subcategory || null,
          size: it.size || null, color: it.color || null, material: it.material || null,
          description: it.description || null,
          selling_price: parseFloat(it.selling_price),
          mrp: it.mrp ? parseFloat(it.mrp) : null,
          buying_price: buying, tax_rate: 1, photo_url: serializePhotoUrls(it.urls?.length ? it.urls : it.url ? [it.url] : []),
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
  const busy = items.some(i => i.status === "uploading" || i.status === "reading" || i.status === "cleaning");

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
        <p className="text-sm text-muted-foreground">Upload a video showing your products (with size tags visible). AI fills the details and turns the clearest frame into a clean e-commerce photo.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Step 1 — Prices for this batch</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(["selling_price", "mrp", "buying_price", "quantity", "size"] as const).map(k => (
              <div key={k}>
                <Label>{{ selling_price: "Selling Price ₹ *", mrp: "MRP ₹", buying_price: "Buying Price ₹ *", quantity: "Quantity (blank = AI count)", size: "Size (blank = AI reads tags)" }[k]}</Label>
                <Input type={k === "size" ? "text" : "number"} value={pricing[k]} onChange={e => setPricing({ ...pricing, [k]: e.target.value })} />
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
          <p className="text-xs text-muted-foreground">Leave quantity blank to use the number of pieces AI counts in the video. Leave size blank to use the size AI reads from each tag.</p>
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
          <p className="text-xs text-muted-foreground">Tip: show each product slowly for 2–3 seconds with its size tag facing the camera, and say the quantity out loud (e.g. "blue shirt, size L, 5 pieces").</p>
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
                   <img src={it.url || it.preview} alt={it.name || "Product preview"} className="w-full md:w-32 aspect-[3/4] object-contain bg-muted rounded border" />
                  {it.urls && it.urls.length > 1 && (
                    <div className="flex gap-1 mt-1">
                      {it.urls.map((u, n) => <img key={u} src={u} alt={`${it.name} view ${n + 1}`} className="w-9 aspect-[3/4] object-contain bg-muted rounded border" />)}
                    </div>
                  )}
                  {it.status !== "saved" && (
                    <button onClick={() => setItems(p => p.filter(x => x.id !== it.id))}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-xs flex items-center gap-1">
                     {(it.status === "uploading" || it.status === "reading" || it.status === "cleaning") && <><Loader2 className="h-3 w-3 animate-spin" /> {it.status === "uploading" ? "Uploading…" : it.status === "cleaning" ? "Creating clean e-commerce photo…" : "AI reading product…"}</>}
                    {it.status === "ready" && <span className="text-primary">Ready — check details</span>}
                    {it.status === "saved" && <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /> Added to inventory</span>}
                    {it.status === "error" && <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {it.error}</span>}
                  </div>
                   {it.photoWarning && <p className="text-xs text-muted-foreground flex items-start gap-1"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {it.photoWarning}</p>}
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
