import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      order_id, // our internal DB order id
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new Error("Missing required fields");
    }

    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    // Verify signature: HMAC_SHA256(razorpay_order_id|razorpay_payment_id, key_secret)
    const expected = await hmacSha256Hex(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
    const isValid = expected === razorpay_signature;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!isValid) {
      await supabase.from("orders").update({
        payment_status: "failed",
        payment_method: "razorpay",
      }).eq("id", order_id);

      return new Response(
        JSON.stringify({ success: false, error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update order
    await supabase.from("orders").update({
      payment_status: "paid",
      payment_id: razorpay_payment_id,
      payment_method: "razorpay",
      status: "confirmed",
    }).eq("id", order_id);

    // Deduct stock FIFO
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", order_id);

    if (orderItems && orderItems.length > 0) {
      for (const item of orderItems) {
        const { data: batches } = await supabase
          .from("inventory_batches")
          .select("id, quantity")
          .eq("product_id", item.product_id)
          .gt("quantity", 0)
          .order("received_at", { ascending: true });

        let remaining = item.quantity;
        if (batches) {
          for (const batch of batches) {
            if (remaining <= 0) break;
            const deduct = Math.min(remaining, batch.quantity);
            await supabase
              .from("inventory_batches")
              .update({ quantity: batch.quantity - deduct })
              .eq("id", batch.id);
            remaining -= deduct;
          }
        }
      }
    }

    // Fire-and-forget order alert email
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      fetch(`${supabaseUrl}/functions/v1/send-order-alert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ order_id }),
      }).catch((e) => console.error("alert email failed:", e));
    } catch (e) {
      console.error("alert email dispatch error:", e);
    }

    return new Response(
      JSON.stringify({ success: true, order_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
