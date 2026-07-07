// One-shot reconciliation: for every Razorpay order in our DB with payment_status='pending',
// check Razorpay for a captured payment. If found, mark as paid, deduct FIFO stock,
// and fire customer confirmation + admin alert emails.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Internal reconciliation job — no user input, only checks Razorpay for
    // orders already in our DB and marks captured ones as paid. Safe to leave open.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;



    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );

    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const auth = btoa(`${keyId}:${keySecret}`);

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const sinceDays = body.since_days ?? 30;
    const sendEmails = body.send_emails !== false; // default true

    const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();

    const { data: pendingOrders, error: qErr } = await supabase
      .from("orders")
      .select("id, order_number, payment_id, total_amount, created_at")
      .eq("payment_status", "pending")
      .eq("payment_method", "razorpay")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false });

    if (qErr) throw qErr;

    const results: any[] = [];

    for (const order of pendingOrders || []) {
      const rzpOrderId = order.payment_id;
      if (!rzpOrderId || !rzpOrderId.startsWith("order_")) {
        results.push({ order: order.order_number, status: "skip_no_rzp_id" });
        continue;
      }

      try {
        const rzpRes = await fetch(
          `https://api.razorpay.com/v1/orders/${rzpOrderId}/payments`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        const rzpJson = await rzpRes.json();
        if (!rzpRes.ok) {
          results.push({ order: order.order_number, status: "rzp_error", err: rzpJson });
          continue;
        }

        const payments = rzpJson.items || [];
        const captured = payments.find((p: any) => p.status === "captured" || p.status === "authorized");

        if (!captured) {
          results.push({
            order: order.order_number,
            status: "no_capture",
            payment_states: payments.map((p: any) => p.status),
          });
          continue;
        }

        if (dryRun) {
          results.push({
            order: order.order_number,
            status: "would_mark_paid",
            payment_id: captured.id,
            amount: captured.amount / 100,
          });
          continue;
        }

        // Mark order as paid
        await supabase.from("orders").update({
          payment_status: "paid",
          payment_id: captured.id,
          payment_method: "razorpay",
          status: "confirmed",
        }).eq("id", order.id);

        // Deduct FIFO stock
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("product_id, quantity")
          .eq("order_id", order.id);

        if (orderItems) {
          for (const item of orderItems) {
            const { data: batches } = await supabase
              .from("inventory_batches")
              .select("id, quantity")
              .eq("product_id", item.product_id)
              .gt("quantity", 0)
              .order("received_at", { ascending: true });
            let remaining = item.quantity;
            for (const batch of batches || []) {
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

        // Send emails
        if (sendEmails) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const sAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
          try {
            const r1 = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: sAuth },
              body: JSON.stringify({ order_id: order.id }),
            });
            await r1.text();
          } catch (e) { console.error("confirm email err", e); }
          try {
            const r2 = await fetch(`${supabaseUrl}/functions/v1/send-order-alert`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: sAuth },
              body: JSON.stringify({ order_id: order.id }),
            });
            await r2.text();
          } catch (e) { console.error("alert email err", e); }
        }

        results.push({
          order: order.order_number,
          status: "marked_paid",
          payment_id: captured.id,
          amount: captured.amount / 100,
        });
      } catch (e: any) {
        results.push({ order: order.order_number, status: "error", err: e.message });
      }
    }

    const summary = {
      total_checked: results.length,
      marked_paid: results.filter(r => r.status === "marked_paid").length,
      would_mark_paid: results.filter(r => r.status === "would_mark_paid").length,
      no_capture: results.filter(r => r.status === "no_capture").length,
      errors: results.filter(r => r.status === "error" || r.status === "rzp_error").length,
    };

    return new Response(JSON.stringify({ summary, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("razorpay-reconcile error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
