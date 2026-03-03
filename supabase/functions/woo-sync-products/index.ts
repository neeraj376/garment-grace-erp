import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wooUrl = Deno.env.get("WOO_STORE_URL")!;
    const wooKey = Deno.env.get("WOO_CONSUMER_KEY")!;
    const wooSecret = Deno.env.get("WOO_CONSUMER_SECRET")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { store_id, direction = "pull" } = await req.json();

    if (!store_id) throw new Error("store_id is required");

    const wooBase = `${wooUrl.replace(/\/$/, "")}/wp-json/wc/v3`;
    const authHeader = "Basic " + btoa(`${wooKey}:${wooSecret}`);

    if (direction === "pull") {
      // Pull products from WooCommerce into local DB
      let page = 1;
      let imported = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(`${wooBase}/products?page=${page}&per_page=50`, {
          headers: { Authorization: authHeader },
        });
        if (!res.ok) throw new Error(`WooCommerce API error: ${res.status} ${await res.text()}`);

        const wooProducts = await res.json();
        if (wooProducts.length === 0) { hasMore = false; break; }

        for (const wp of wooProducts) {
          const sku = wp.sku || `WOO-${wp.id}`;
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("store_id", store_id)
            .eq("sku", sku)
            .maybeSingle();

          const productData = {
            store_id,
            sku,
            name: wp.name,
            selling_price: parseFloat(wp.price || wp.regular_price || "0"),
            mrp: wp.regular_price ? parseFloat(wp.regular_price) : null,
            category: wp.categories?.[0]?.name || null,
            photo_url: wp.images?.[0]?.src || null,
            is_active: wp.status === "publish",
            tax_rate: wp.tax_class === "zero-rate" ? 0 : 18,
          };

          if (existing) {
            await supabase.from("products").update(productData).eq("id", existing.id);
          } else {
            await supabase.from("products").insert(productData);
          }
          imported++;
        }
        page++;
      }

      // Update last sync timestamp
      await supabase
        .from("woocommerce_config")
        .update({ last_product_sync: new Date().toISOString() })
        .eq("store_id", store_id);

      return new Response(JSON.stringify({ success: true, imported }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (direction === "push") {
      // Push local products to WooCommerce
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store_id)
        .eq("is_active", true);

      let pushed = 0;
      for (const p of products || []) {
        const wooProduct = {
          name: p.name,
          sku: p.sku,
          regular_price: String(p.mrp || p.selling_price),
          sale_price: String(p.selling_price),
          status: "publish",
          manage_stock: true,
        };

        // Check if product exists in WooCommerce by SKU
        const searchRes = await fetch(`${wooBase}/products?sku=${encodeURIComponent(p.sku)}`, {
          headers: { Authorization: authHeader },
        });
        const searchResults = await searchRes.json();

        if (searchResults.length > 0) {
          await fetch(`${wooBase}/products/${searchResults[0].id}`, {
            method: "PUT",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(wooProduct),
          });
        } else {
          await fetch(`${wooBase}/products`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(wooProduct),
          });
        }
        pushed++;
      }

      await supabase
        .from("woocommerce_config")
        .update({ last_product_sync: new Date().toISOString() })
        .eq("store_id", store_id);

      return new Response(JSON.stringify({ success: true, pushed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid direction. Use 'pull' or 'push'.");
  } catch (error) {
    console.error("woo-sync-products error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
