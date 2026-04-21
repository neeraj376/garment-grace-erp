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
      items,
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
      const p: any = productMap.get(item.product_id);
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

    // 4. Create order in DB
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
        payment_method: "razorpay",
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

    // 6. Create Razorpay order
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const auth = btoa(`${keyId}:${keySecret}`);

    const amountPaise = Math.round(totalAmount * 100);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: order!.id,
        notes: {
          order_id: order!.id,
          order_number: orderNumber,
          customer_phone: guest_phone,
        },
      }),
    });

    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) {
      throw new Error(`Razorpay error: ${JSON.stringify(rzpData)}`);
    }

    // Store razorpay order id on the order
    await supabase
      .from("orders")
      .update({ payment_id: rzpData.id })
      .eq("id", order!.id);

    return new Response(
      JSON.stringify({
        order_id: order!.id,
        order_number: orderNumber,
        razorpay: {
          key_id: keyId,
          razorpay_order_id: rzpData.id,
          amount: amountPaise,
          currency: "INR",
          name: guest_name,
          email: guest_email || "",
          phone: guest_phone,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
