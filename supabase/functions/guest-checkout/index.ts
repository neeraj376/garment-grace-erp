import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      guest_name,
      guest_email,
      guest_phone,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      items, // [{ product_id, quantity }]
      store_id,
      courier_name,
      shipping_cost,
    } = body;

    if (!guest_name || !guest_phone || !address_line1 || !city || !state || !pincode || !items?.length || !store_id) {
      throw new Error("Missing required fields");
    }

    // 1. Create or find guest shop_customer by phone
    let { data: customer } = await supabase
      .from("shop_customers")
      .select("id")
      .eq("phone", guest_phone)
      .maybeSingle();

    if (!customer) {
      // Use a deterministic UUID-like user_id for guests based on phone
      const guestUserId = crypto.randomUUID();
      const { data: created, error: custErr } = await supabase
        .from("shop_customers")
        .insert({
          user_id: guestUserId,
          name: guest_name,
          email: guest_email || null,
          phone: guest_phone,
        })
        .select("id")
        .single();
      if (custErr) throw custErr;
      customer = created;
    }

    // 2. Save shipping address
    const { data: addr, error: addrErr } = await supabase
      .from("shipping_addresses")
      .insert({
        customer_id: customer!.id,
        name: guest_name,
        phone: guest_phone,
        address_line1,
        address_line2: address_line2 || null,
        city,
        state,
        pincode,
      })
      .select("id")
      .single();
    if (addrErr) throw addrErr;

    // 3. Fetch product details
    const productIds = items.map((i: any) => i.product_id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, selling_price, tax_rate, name")
      .in("id", productIds);
    if (prodErr) throw prodErr;

    const productMap = new Map(products!.map((p: any) => [p.id, p]));

    let subtotal = 0;
    let taxTotal = 0;
    const orderItemsData: any[] = [];

    for (const item of items) {
      const p = productMap.get(item.product_id);
      if (!p) throw new Error(`Product ${item.product_id} not found`);
      const lineTotal = p.selling_price * item.quantity;
      const lineTax = (p.selling_price * item.quantity * p.tax_rate) / (100 + p.tax_rate);
      subtotal += lineTotal;
      taxTotal += lineTax;
      orderItemsData.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: p.selling_price,
        tax_amount: lineTax,
        total: lineTotal,
      });
    }

    const shippingAmount = shipping_cost || 0;
    const totalAmount = subtotal + shippingAmount;
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    // 4. Create order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customer!.id,
        store_id,
        shipping_address_id: addr!.id,
        subtotal,
        tax_amount: Math.round(taxTotal),
        shipping_amount: shippingAmount,
        total_amount: totalAmount,
        status: "pending",
        payment_status: "pending",
        payment_method: "payu",
        courier_name: courier_name || null,
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;

    // 5. Create order items
    const finalItems = orderItemsData.map((oi: any) => ({
      ...oi,
      order_id: order!.id,
    }));
    const { error: oiErr } = await supabase.from("order_items").insert(finalItems);
    if (oiErr) throw oiErr;

    // 6. Get PayU hash
    const key = Deno.env.get("PAYU_MERCHANT_KEY")!;
    const salt = Deno.env.get("PAYU_MERCHANT_SALT")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const txnid = order!.id;
    const amount = totalAmount.toFixed(2);
    const productinfo = `Order ${orderNumber}`;
    const firstname = guest_name;
    const email = guest_email || "guest@originee.in";
    const phone = guest_phone;
    const surl = `${supabaseUrl}/functions/v1/payu-verify`;
    const furl = `${supabaseUrl}/functions/v1/payu-verify`;

    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-512", encoder.encode(hashString));
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return new Response(
      JSON.stringify({
        order_id: order!.id,
        order_number: orderNumber,
        payu: {
          key,
          txnid,
          amount,
          productinfo,
          firstname,
          email,
          phone,
          surl,
          furl,
          hash,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
