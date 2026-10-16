// Public product feed (CSV) for Meta Commerce Manager / WhatsApp catalog.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const SITE = "https://originee-store.com";

function firstPhoto(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (s.startsWith("[")) {
    try { const a = JSON.parse(s); return Array.isArray(a) && a[0] ? String(a[0]) : null; } catch { return null; }
  }
  return s || null;
}
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rows: any[] = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await sb.rpc("get_in_stock_shop_products_page", {
      p_store_id: STORE_ID, p_category: null, p_limit: 1000, p_offset: off,
    });
    if (error) return new Response(error.message, { status: 500 });
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const header = ["id","title","description","availability","condition","price","sale_price","link","image_link","brand","google_product_category","size","color","item_group_id"];
  const lines = [header.join(",")];
  for (const p of rows) {
    const img = firstPhoto(p.photo_url);
    if (!img || !/^https?:\/\//.test(img)) continue;
    const price = Number(p.selling_price) || 0;
    if (price <= 0) continue;
    const mrp = Number(p.mrp) || 0;
    const showMrp = mrp > price;
    const title = [p.brand, p.name].filter(Boolean).join(" ").slice(0, 150) || p.name;
    lines.push([
      p.sku || p.id, title,
      (p.description || `${p.name}${p.size ? `, size ${p.size}` : ""}${p.color ? `, ${p.color}` : ""}`).slice(0, 5000),
      "in stock", "new",
      `${(showMrp ? mrp : price).toFixed(2)} INR`,
      showMrp ? `${price.toFixed(2)} INR` : "",
      `${SITE}/product/${p.id}`, img, p.brand || "Originee", "Apparel & Accessories",
      p.size || "", p.color || "", [p.brand, p.name].filter(Boolean).join("|").toLowerCase(),
    ].map(esc).join(","));
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
});
