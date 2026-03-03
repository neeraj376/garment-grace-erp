import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-topic",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const topic = req.headers.get("x-wc-webhook-topic");
    const body = await req.json();

    console.log(`WooCommerce webhook received: ${topic}`, JSON.stringify(body).slice(0, 200));

    // Find the store linked to this WooCommerce instance
    const wooUrl = Deno.env.get("WOO_STORE_URL")!;
    const { data: config } = await supabase
      .from("woocommerce_config")
      .select("store_id")
      .eq("woo_store_url", wooUrl)
      .maybeSingle();

    if (!config) {
      // Try first config available
      const { data: anyConfig } = await supabase
        .from("woocommerce_config")
        .select("store_id")
        .limit(1)
        .single();
      if (!anyConfig) throw new Error("No WooCommerce config found");
      config = anyConfig;
    }

    const store_id = config.store_id;

    if (topic === "order.created" || topic === "order.updated") {
      // Trigger order sync for this specific order
      const projectId = Deno.env.get("SUPABASE_URL")!.match(/https:\/\/(.+)\.supabase/)?.[1];
      await fetch(`${supabaseUrl}/functions/v1/woo-sync-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ store_id }),
      });
    } else if (topic === "product.created" || topic === "product.updated") {
      await fetch(`${supabaseUrl}/functions/v1/woo-sync-products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ store_id, direction: "pull" }),
      });
    } else if (topic === "product.deleted") {
      const sku = body.sku || `WOO-${body.id}`;
      await supabase
        .from("products")
        .update({ is_active: false })
        .eq("store_id", store_id)
        .eq("sku", sku);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("woo-webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
