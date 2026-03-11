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
    const body = await req.text();
    const params = new URLSearchParams(body);

    const status = params.get("status");
    const txnid = params.get("txnid");
    const amount = params.get("amount");
    const productinfo = params.get("productinfo");
    const firstname = params.get("firstname");
    const email = params.get("email");
    const payuMoneyId = params.get("payuMoneyId") || params.get("mihpayid");
    const hash = params.get("hash");

    const key = Deno.env.get("PAYU_MERCHANT_KEY")!;
    const salt = Deno.env.get("PAYU_MERCHANT_SALT")!;

    // Reverse hash verification: sha512(salt|status|||||||||||email|firstname|productinfo|amount|txnid|key)
    const reverseHashString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(reverseHashString);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const isValid = computedHash === hash;
    const isSuccess = status === "success" && isValid;

    // Update order payment status
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // txnid format: order_id
    const orderId = txnid;

    if (isSuccess) {
      await supabase.from("orders").update({
        payment_status: "paid",
        payment_id: payuMoneyId,
        payment_method: "payu",
        status: "confirmed",
      }).eq("id", orderId);

      // Deduct stock from inventory_batches after successful payment
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", orderId);

      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          // Get the oldest batch with available stock (FIFO)
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
    } else {
      await supabase.from("orders").update({
        payment_status: "failed",
        payment_method: "payu",
      }).eq("id", orderId);
    }

    // Redirect to frontend — origin/referer headers come from PayU, not the user's browser
    const frontendBase = Deno.env.get("SITE_URL") || "https://garment-grace-erp.lovable.app";
    const redirectUrl = `${frontendBase}/payment-result?status=${isSuccess ? "success" : "failed"}&order_id=${orderId}`;

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
