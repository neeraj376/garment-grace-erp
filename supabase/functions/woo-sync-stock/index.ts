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
    const { store_id, direction = "push" } = await req.json();

    if (!store_id) throw new Error("store_id is required");

    const wooBase = `${wooUrl.replace(/\/$/, "")}/wp-json/wc/v3`;
    const authHeader = "Basic " + btoa(`${wooKey}:${wooSecret}`);

    // Get local products with stock
    const { data: products } = await supabase
      .from("products")
      .select("id, sku, name")
      .eq("store_id", store_id)
      .eq("is_active", true);

    let synced = 0;

    for (const product of products || []) {
      // Get total stock from inventory_batches
      const { data: batches } = await supabase
        .from("inventory_batches")
        .select("quantity")
        .eq("product_id", product.id)
        .eq("store_id", store_id);

      const totalStock = (batches || []).reduce((sum, b) => sum + b.quantity, 0);

      if (direction === "push") {
        // Push local stock to WooCommerce
        const searchRes = await fetch(`${wooBase}/products?sku=${encodeURIComponent(product.sku)}`, {
          headers: { Authorization: authHeader },
        });
        const searchResults = await searchRes.json();

        if (searchResults.length > 0) {
          await fetch(`${wooBase}/products/${searchResults[0].id}`, {
            method: "PUT",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
              manage_stock: true,
              stock_quantity: totalStock,
              stock_status: totalStock > 0 ? "instock" : "outofstock",
            }),
          });
          synced++;
        }
      } else if (direction === "pull") {
        // Pull WooCommerce stock into local DB
        const searchRes = await fetch(`${wooBase}/products?sku=${encodeURIComponent(product.sku)}`, {
          headers: { Authorization: authHeader },
        });
        const searchResults = await searchRes.json();

        if (searchResults.length > 0 && searchResults[0].manage_stock) {
          const wooStock = searchResults[0].stock_quantity || 0;
          const diff = wooStock - totalStock;

          if (diff !== 0) {
            await supabase.from("inventory_batches").insert({
              product_id: product.id,
              store_id,
              buying_price: 0,
              quantity: diff,
              batch_number: `WOO-SYNC-${Date.now()}`,
            });
          }
          synced++;
        }
      }
    }

    await supabase
      .from("woocommerce_config")
      .update({ last_stock_sync: new Date().toISOString() })
      .eq("store_id", store_id);

    return new Response(JSON.stringify({ success: true, synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("woo-sync-stock error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
