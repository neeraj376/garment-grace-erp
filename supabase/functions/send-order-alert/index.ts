import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_TO = "originee.store@gmail.com";

async function sendEmailViaSMTP(to: string, subject: string, body: string): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");
  const from = "originee.store@gmail.com";

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
  await sendCommand(btoa(from));
  const authResult = await sendCommand(btoa(password));
  if (!authResult.startsWith("235")) {
    conn.close();
    throw new Error("SMTP authentication failed");
  }
  await sendCommand(`MAIL FROM:<${from}>`);
  await sendCommand(`RCPT TO:<${to}>`);
  await sendCommand("DATA");

  const message = [
    `From: Originee Orders <${from}>`,
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

    const productIds = (items || []).map((i: any) => i.product_id);
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, name, sku, size, color").in("id", productIds)
      : { data: [] as any[] };
    const pMap = new Map((products || []).map((p: any) => [p.id, p]));

    const itemsHtml = (items || []).map((i: any) => {
      const p = pMap.get(i.product_id) || {};
      const desc = [p.name, p.size, p.color].filter(Boolean).join(" / ");
      return `<tr><td style="padding:6px 8px;border:1px solid #eee">${desc}<br/><small>${p.sku || ""}</small></td><td style="padding:6px 8px;border:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:6px 8px;border:1px solid #eee;text-align:right">₹${Number(i.unit_price).toFixed(2)}</td><td style="padding:6px 8px;border:1px solid #eee;text-align:right">₹${Number(i.total).toFixed(2)}</td></tr>`;
    }).join("");

    const addrHtml = addr
      ? `${addr.name}<br/>${addr.address_line1}${addr.address_line2 ? ", " + addr.address_line2 : ""}<br/>${addr.city}, ${addr.state} - ${addr.pincode}<br/>📞 ${addr.phone}`
      : "—";

    const subject = `🛒 New Order ${order.order_number} — ₹${Number(order.total_amount).toFixed(2)}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222">
        <h2 style="color:#0a3d62">New Order Received</h2>
        <p><strong>Order #:</strong> ${order.order_number}<br/>
        <strong>Date:</strong> ${new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}<br/>
        <strong>Payment:</strong> ${order.payment_method?.toUpperCase() || "—"} (${order.payment_id || "—"})</p>

        <h3>Customer</h3>
        <p>${customer?.name || "—"}<br/>${customer?.email || ""} ${customer?.phone ? "• " + customer.phone : ""}</p>

        <h3>Shipping Address</h3>
        <p>${addrHtml}</p>

        <h3>Items</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <thead><tr style="background:#f5f5f5">
            <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Product</th>
            <th style="padding:6px 8px;border:1px solid #eee">Qty</th>
            <th style="padding:6px 8px;border:1px solid #eee;text-align:right">Price</th>
            <th style="padding:6px 8px;border:1px solid #eee;text-align:right">Total</th>
          </tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <table style="margin-top:12px;margin-left:auto;font-size:14px">
          <tr><td style="padding:4px 12px">Subtotal</td><td style="text-align:right">₹${Number(order.subtotal).toFixed(2)}</td></tr>
          <tr><td style="padding:4px 12px">Shipping</td><td style="text-align:right">₹${Number(order.shipping_amount).toFixed(2)}</td></tr>
          <tr><td style="padding:4px 12px">Tax</td><td style="text-align:right">₹${Number(order.tax_amount).toFixed(2)}</td></tr>
          <tr style="font-weight:bold;font-size:16px"><td style="padding:6px 12px;border-top:2px solid #222">Total</td><td style="text-align:right;border-top:2px solid #222">₹${Number(order.total_amount).toFixed(2)}</td></tr>
        </table>
      </div>`;

    await sendEmailViaSMTP(ALERT_TO, subject, html);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-order-alert error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
