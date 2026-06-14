// Send an order confirmation email to the customer via Gmail SMTP.
// Triggered automatically after successful payment (PayU / Razorpay).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM = "originee.store@gmail.com";
const BCC_ADMINS = ["hrithiksuri2000@gmail.com"];

async function sendEmailViaSMTP(to: string, subject: string, body: string, bcc: string[] = []): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });

  async function readResponse(): Promise<string> {
    const buf = new Uint8Array(2048);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n || 0));
  }
  async function sendCommand(cmd: string): Promise<string> {
    await conn.write(encoder.encode(cmd + "\r\n"));
    return await readResponse();
  }

  await readResponse();
  await sendCommand("EHLO localhost");
  await sendCommand("AUTH LOGIN");
  await sendCommand(btoa(FROM));
  const authResult = await sendCommand(btoa(password));
  if (!authResult.startsWith("235")) {
    conn.close();
    throw new Error("SMTP authentication failed");
  }
  await sendCommand(`MAIL FROM:<${FROM}>`);
  await sendCommand(`RCPT TO:<${to}>`);
  for (const b of bcc) {
    await sendCommand(`RCPT TO:<${b}>`);
  }
  await sendCommand("DATA");

  const message = [
    `From: Originee Store <${FROM}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    body,
    `.`,
  ].join("\r\n");

  const dataResult = await sendCommand(message);
  await sendCommand("QUIT");
  conn.close();
  if (!dataResult.startsWith("250")) throw new Error("Failed to send: " + dataResult);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, total_amount, subtotal, shipping_amount, tax_amount, payment_method, payment_id, customer_id, shipping_address_id, created_at")
      .eq("id", order_id)
      .maybeSingle();

    if (!order) throw new Error("Order not found");

    const [{ data: items }, { data: customer }, { data: addr }] = await Promise.all([
      supabase.from("order_items").select("quantity, unit_price, total, product_id").eq("order_id", order_id),
      order.customer_id ? supabase.from("shop_customers").select("name, email, phone").eq("id", order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      order.shipping_address_id ? supabase.from("shipping_addresses").select("name, phone, address_line1, address_line2, city, state, pincode").eq("id", order.shipping_address_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const customerEmail = (customer as any)?.email?.trim();
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      // No valid email — silently skip (guest may not provide one)
      return new Response(JSON.stringify({ success: true, skipped: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const productIds = (items || []).map((i: any) => i.product_id);
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, name, sku, size, color").in("id", productIds)
      : { data: [] as any[] };
    const pMap = new Map((products || []).map((p: any) => [p.id, p]));

    const safe = (v: any) => String(v ?? "").replace(/[<>]/g, "");

    const itemsHtml = (items || []).map((i: any) => {
      const p: any = pMap.get(i.product_id) || {};
      const desc = [p.name, p.size, p.color].filter(Boolean).join(" / ");
      return `<tr><td style="padding:8px;border:1px solid #eee">${safe(desc)}<br/><small style="color:#888">${safe(p.sku || "")}</small></td><td style="padding:8px;border:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:8px;border:1px solid #eee;text-align:right">₹${Number(i.total).toFixed(2)}</td></tr>`;
    }).join("");

    const addrHtml = addr
      ? `${safe(addr.name)}<br/>${safe(addr.address_line1)}${addr.address_line2 ? ", " + safe(addr.address_line2) : ""}<br/>${safe(addr.city)}, ${safe(addr.state)} - ${safe(addr.pincode)}<br/>📞 ${safe(addr.phone)}`
      : "—";

    const subject = `Order Confirmed ✅ ${safe(order.order_number)} — Originee Store`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;background:#fff">
        <div style="background:#0a3d62;padding:24px;color:#fff;text-align:center">
          <h2 style="margin:0">Thank you for your order! 🎉</h2>
          <p style="margin:8px 0 0;opacity:0.9">Order ${safe(order.order_number)}</p>
        </div>
        <div style="padding:24px">
          <p>Hi ${safe((customer as any)?.name) || "Customer"},</p>
          <p>We've received your order and your payment was successful. We'll start processing it shortly and notify you once it ships.</p>

          <h3 style="margin-top:24px;color:#0a3d62">Order Summary</h3>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <thead><tr style="background:#f5f5f5">
              <th style="padding:8px;border:1px solid #eee;text-align:left">Item</th>
              <th style="padding:8px;border:1px solid #eee">Qty</th>
              <th style="padding:8px;border:1px solid #eee;text-align:right">Total</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <table style="margin:16px 0 0 auto;font-size:14px">
            <tr><td style="padding:4px 12px">Subtotal</td><td style="text-align:right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
            <tr><td style="padding:4px 12px">Shipping</td><td style="text-align:right">₹${Number(order.shipping_amount).toFixed(2)}</td></tr>
            <tr><td style="padding:4px 12px">Tax</td><td style="text-align:right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>
            <tr style="font-weight:bold;font-size:16px"><td style="padding:8px 12px;border-top:2px solid #222">Total Paid</td><td style="text-align:right;border-top:2px solid #222">₹${Number(order.total_amount).toFixed(2)}</td></tr>
          </table>

          <h3 style="margin-top:24px;color:#0a3d62">Shipping Address</h3>
          <p style="background:#f8f9fa;padding:12px;border-radius:6px">${addrHtml}</p>

          <p style="margin-top:24px;color:#666;font-size:13px">Payment: ${safe(order.payment_method?.toUpperCase() || "—")} · Ref: ${safe(order.payment_id || "—")}</p>

          <p style="margin-top:24px">Have a question? Reply to this email or WhatsApp us at +91 88828 66833.</p>
          <p>Thank you for shopping with us! 💙</p>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:12px;color:#888">
          Originee Store · originee-store.com
        </div>
      </div>`;

    await sendEmailViaSMTP(customerEmail, subject, html);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-order-confirmation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
