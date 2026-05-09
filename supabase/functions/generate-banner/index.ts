// Generate a standard composed banner (no AI credits) for a product.
// Builds an SVG with gradient background + product photo + name/size/price overlay,
// uploads to storage and inserts into home_banners.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const W = 800;
const H = 450;

// Curated palettes (deep, premium feel)
const PALETTES = [
  { from: "#0F172A", to: "#1E3A8A", accent: "#F8FAFC", muted: "#94A3B8" },
  { from: "#1A1A1A", to: "#3F1D1D", accent: "#F5E6CC", muted: "#C9A87C" },
  { from: "#0C2340", to: "#2D8A9E", accent: "#F0FDFA", muted: "#A7F3D0" },
  { from: "#1F1B2E", to: "#5B2A86", accent: "#FDE68A", muted: "#C4B5FD" },
  { from: "#0D0D0D", to: "#2D2D2D", accent: "#E8B84A", muted: "#A8A29E" },
];

function escapeXml(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function pickPalette(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch (e) {
    console.error("fetchAsDataUrl failed", e);
    return null;
  }
}

function buildSvg(opts: {
  name: string; price: number; mrp?: number | null; size?: string | null;
  color?: string | null; category?: string | null; photoDataUrl: string | null;
}) {
  const p = pickPalette(opts.name);
  const headline = opts.name.length > 38 ? opts.name.slice(0, 36) + "…" : opts.name;
  const sub = [opts.category, opts.color].filter(Boolean).join(" • ");
  const priceStr = `₹${Number(opts.price).toLocaleString("en-IN")}`;
  const mrpStr = opts.mrp && Number(opts.mrp) > Number(opts.price)
    ? `₹${Number(opts.mrp).toLocaleString("en-IN")}` : null;
  const sizeStr = opts.size ? `Size ${escapeXml(opts.size)}` : null;

  const photoBlock = opts.photoDataUrl
    ? `
      <defs>
        <clipPath id="pclip"><rect x="900" y="60" width="640" height="780" rx="24"/></clipPath>
      </defs>
      <rect x="900" y="60" width="640" height="780" rx="24" fill="${p.accent}" opacity="0.06"/>
      <image href="${opts.photoDataUrl}" x="900" y="60" width="640" height="780"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#pclip)"/>
      <rect x="900" y="60" width="640" height="780" rx="24" fill="none"
            stroke="${p.accent}" stroke-opacity="0.15" stroke-width="1"/>`
    : `<rect x="900" y="60" width="640" height="780" rx="24" fill="${p.accent}" opacity="0.08"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.from}"/>
      <stop offset="100%" stop-color="${p.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${p.accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- decorative line -->
  <line x1="80" y1="160" x2="200" y2="160" stroke="${p.muted}" stroke-width="2"/>
  <text x="220" y="166" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif"
        font-size="18" letter-spacing="6" font-weight="500">NEW ARRIVAL</text>

  <!-- headline -->
  <text x="80" y="340" fill="${p.accent}" font-family="Georgia, 'Times New Roman', serif"
        font-size="84" font-weight="600">${escapeXml(headline)}</text>

  ${sub ? `<text x="80" y="400" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif"
        font-size="26" letter-spacing="3">${escapeXml(sub.toUpperCase())}</text>` : ""}

  <!-- price block -->
  <text x="80" y="560" fill="${p.accent}" font-family="Helvetica, Arial, sans-serif"
        font-size="22" letter-spacing="4">PRICE</text>
  <text x="80" y="640" fill="${p.accent}" font-family="Georgia, serif"
        font-size="76" font-weight="700">${priceStr}</text>
  ${mrpStr ? `<text x="${80 + priceStr.length * 38}" y="640" fill="${p.muted}"
        font-family="Helvetica, Arial, sans-serif" font-size="32"
        text-decoration="line-through">${mrpStr}</text>` : ""}

  ${sizeStr ? `
  <rect x="80" y="700" width="${40 + sizeStr.length * 14}" height="56" rx="28"
        fill="none" stroke="${p.accent}" stroke-opacity="0.4" stroke-width="1.5"/>
  <text x="${100}" y="736" fill="${p.accent}" font-family="Helvetica, Arial, sans-serif"
        font-size="22" letter-spacing="2">${sizeStr}</text>` : ""}

  <!-- bottom CTA -->
  <line x1="80" y1="820" x2="200" y2="820" stroke="${p.muted}" stroke-width="2"/>
  <text x="220" y="826" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif"
        font-size="16" letter-spacing="4">SHOP NOW</text>

  ${photoBlock}
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { productId, headline, subheadline, sortOrder } = await req.json();
    if (!productId) {
      return new Response(JSON.stringify({ error: "productId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles").select("store_id").eq("user_id", user.id).maybeSingle();
    if (!profile?.store_id) {
      return new Response(JSON.stringify({ error: "No store" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product } = await supabase
      .from("products").select("*").eq("id", productId).eq("store_id", profile.store_id).maybeSingle();
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const photoDataUrl = product.photo_url ? await fetchAsDataUrl(product.photo_url) : null;

    const svg = buildSvg({
      name: headline || product.name,
      price: Number(product.selling_price ?? 0),
      mrp: product.mrp,
      size: product.size,
      color: product.color,
      category: product.category,
      photoDataUrl,
    });

    const fileName = `banners/${profile.store_id}/${productId}-${Date.now()}.svg`;
    const { error: upErr } = await supabase.storage
      .from("product-media")
      .upload(fileName, new TextEncoder().encode(svg), {
        contentType: "image/svg+xml", upsert: true,
      });
    if (upErr) {
      console.error("Upload error", upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = supabase.storage.from("product-media").getPublicUrl(fileName);

    const finalHeadline = headline || product.name;
    const finalSub = subheadline
      || [product.category, product.color].filter(Boolean).join(" • ")
      || "Discover the new collection";

    const { data: banner, error: insErr } = await supabase
      .from("home_banners")
      .insert({
        store_id: profile.store_id,
        product_id: productId,
        image_url: pub.publicUrl,
        headline: finalHeadline,
        subheadline: finalSub,
        sort_order: sortOrder ?? 0,
      })
      .select()
      .single();
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ banner }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
