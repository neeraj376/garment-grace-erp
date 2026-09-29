// Bulk AI photo cleanup for in-stock products
// Uses Lovable AI Gateway (Nano Banana) to remove background, enhance lighting, place on clean white studio backdrop
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = "Professional ecommerce product photo: remove the existing background completely, place the garment on a clean pure white studio backdrop, enhance the lighting to be soft and even, boost color accuracy and fabric detail, sharpen edges, no shadows except a subtle natural ground shadow, centered composition, retail catalog quality. Keep the garment exactly as-is — do not change its color, shape, pattern or details.";

function firstPhotoUrl(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
    } catch (_) { /* fall through */ }
  }
  return s;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "image/jpeg";
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${ct};base64,${btoa(bin)}`;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("bad data url");
  const contentType = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const productIds: string[] | undefined = body.product_ids;
  const dryRun: boolean = !!body.dry_run;

  let products: any[] = [];
  if (productIds && productIds.length > 0) {
    const { data } = await supabase.from("products").select("id, store_id, photo_url, sku").in("id", productIds);
    products = data || [];
  } else {
    // Default: all active products with a photo and stock > 0
    const { data: stockIds, error: rpcErr } = await supabase.rpc("get_in_stock_product_ids", { p_store_id: body.store_id });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: `rpc: ${rpcErr.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const ids: string[] = (stockIds || []).map((r: any) => (typeof r === "string" ? r : r.get_in_stock_product_ids ?? r.id ?? r));
    const idSet = new Set(ids);
    const { data: allWithPhoto, error: prodErr } = await supabase
      .from("products")
      .select("id, store_id, photo_url, sku")
      .eq("is_active", true)
      .not("photo_url", "is", null);
    if (prodErr) {
      return new Response(JSON.stringify({ error: `products: ${prodErr.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    products = (allWithPhoto || []).filter((p: any) => idSet.has(p.id));
  }

  if (dryRun) {
    return new Response(JSON.stringify({ count: products.length, products: products.map((p) => p.sku) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cleanOne = async (p: any) => {
    try {
      const sourceUrl = firstPhotoUrl(p.photo_url);
      const src = await fetch(sourceUrl);
      if (!src.ok) return { id: p.id, sku: p.sku, ok: false, error: `fetch ${src.status}` };
      const blob = await src.blob();

      const form = new FormData();
      form.append("model", "openai/gpt-image-2.5-sunburst");
      form.append("prompt", PROMPT);
      form.append("image", new File([blob], "source.jpg", { type: blob.type || "image/jpeg" }));
      form.append("size", "1024x1536");
      form.append("quality", "medium");
      form.append("output_format", "jpeg");

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: form,
      });
      if (!aiResp.ok) {
        const t = await aiResp.text();
        return { id: p.id, sku: p.sku, ok: false, status: aiResp.status, error: `AI ${aiResp.status}: ${t.slice(0, 200)}` };
      }
      const j = await aiResp.json();
      const encoded = j.data?.[0]?.b64_json;
      if (!encoded) return { id: p.id, sku: p.sku, ok: false, error: "no image in response" };
      const { bytes, contentType } = dataUrlToBytes(`data:image/jpeg;base64,${encoded}`);
      const path = `${p.store_id}/cleaned/${p.id}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("product-media").upload(path, bytes, { contentType, upsert: true });
      if (upErr) return { id: p.id, sku: p.sku, ok: false, error: `upload: ${upErr.message}` };
      const newUrl = supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supabase.from("products").update({ photo_url: newUrl }).eq("id", p.id);
      if (updErr) return { id: p.id, sku: p.sku, ok: false, error: `update: ${updErr.message}` };
      return { id: p.id, sku: p.sku, ok: true, url: newUrl };
    } catch (e) {
      return { id: p.id, sku: p.sku, ok: false, error: (e as Error).message };
    }
  };

  const results: any[] = [];
  for (let i = 0; i < products.length; i += 3) {
    const chunk = await Promise.all(products.slice(i, i + 3).map(cleanOne));
    results.push(...chunk);
    if (chunk.some((r) => r.status === 402 || r.status === 403)) break;
  }

  const okCount = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({ processed: results.length, ok: okCount, failed: results.length - okCount, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
