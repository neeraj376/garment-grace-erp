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
    const { store_id, since } = await req.json();

    if (!store_id) throw new Error("store_id is required");

    const wooBase = `${wooUrl.replace(/\/$/, "")}/wp-json/wc/v3`;
    const authHeader = "Basic " + btoa(`${wooKey}:${wooSecret}`);

    // Get store settings for invoice prefix
    const { data: settings } = await supabase
      .from("store_settings")
      .select("invoice_prefix")
      .eq("store_id", store_id)
      .single();

    const prefix = settings?.invoice_prefix || "INV";

    let page = 1;
    let imported = 0;
    let hasMore = true;
    const afterParam = since ? `&after=${since}` : "";

    while (hasMore) {
      const res = await fetch(
        `${wooBase}/orders?page=${page}&per_page=50&status=completed,processing${afterParam}`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) throw new Error(`WooCommerce API error: ${res.status}`);

      const orders = await res.json();
      if (orders.length === 0) { hasMore = false; break; }

      for (const order of orders) {
        const invoiceNumber = `${prefix}-WOO-${order.id}`;

        // Check if already imported
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .eq("store_id", store_id)
          .maybeSingle();

        if (existing) continue;

        // Find or create customer
        let customerId = null;
        if (order.billing?.phone) {
          const phone = order.billing.phone.replace(/\D/g, "").slice(-10);
          const { data: customer } = await supabase
            .from("customers")
            .select("id")
            .eq("store_id", store_id)
            .eq("mobile", phone)
            .maybeSingle();

          if (customer) {
            customerId = customer.id;
          } else {
            const { data: newCust } = await supabase
              .from("customers")
              .insert({
                store_id,
                mobile: phone,
                name: `${order.billing.first_name || ""} ${order.billing.last_name || ""}`.trim() || null,
                email: order.billing.email || null,
              })
              .select("id")
              .single();
            customerId = newCust?.id || null;
          }
        }

        const subtotal = parseFloat(order.total) - parseFloat(order.total_tax || "0");
        const taxAmount = parseFloat(order.total_tax || "0");
        const discountTotal = parseFloat(order.discount_total || "0");

        // Create invoice
        const { data: invoice } = await supabase
          .from("invoices")
          .insert({
            store_id,
            invoice_number: invoiceNumber,
            customer_id: customerId,
            subtotal,
            tax_amount: taxAmount,
            discount_amount: discountTotal,
            total_amount: parseFloat(order.total),
            payment_method: order.payment_method_title || "online",
            source: "woocommerce",
            status: "completed",
            created_at: order.date_created,
          })
          .select("id")
          .single();

        if (invoice) {
          // Create invoice items
          for (const item of order.line_items || []) {
            const sku = item.sku || `WOO-${item.product_id}`;
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .eq("store_id", store_id)
              .eq("sku", sku)
              .maybeSingle();

            if (product) {
              await supabase.from("invoice_items").insert({
                invoice_id: invoice.id,
                product_id: product.id,
                quantity: item.quantity,
                unit_price: parseFloat(item.price),
                tax_amount: parseFloat(item.total_tax || "0"),
                discount: 0,
                total: parseFloat(item.total),
              });
            }
          }
        }
        imported++;
      }
      page++;
    }

    await supabase
      .from("woocommerce_config")
      .update({ last_order_sync: new Date().toISOString() })
      .eq("store_id", store_id);

    return new Response(JSON.stringify({ success: true, imported }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("woo-sync-orders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
