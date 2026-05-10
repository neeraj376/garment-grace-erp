import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmailViaSMTP(to: string, subject: string, body: string, fromName = "Originee Invoices"): Promise<void> {
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
    `From: ${fromName} <${from}>`,
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
    const { invoice_id, to_email } = await req.json();
    if (!invoice_id) throw new Error("invoice_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invoice } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, total_amount, subtotal, tax_amount, discount_amount, payment_method, created_at,
        stores!invoices_store_id_fkey(name, address, phone, gst_number),
        customers!invoices_customer_id_fkey(name, mobile, email)
      `)
      .eq("id", invoice_id)
      .maybeSingle();

    if (!invoice) throw new Error("Invoice not found");

    const recipient = (to_email || (invoice.customers as any)?.email || "").trim();
    if (!recipient) throw new Error("No email address available for this customer");

    const { data: items } = await supabase
      .from("invoice_items")
      .select("quantity, unit_price, total, products!invoice_items_product_id_fkey(name, sku, size, color)")
      .eq("invoice_id", invoice_id);

    const store = (invoice.stores as any) || {};
    const customer = (invoice.customers as any) || {};
    const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const date = new Date(invoice.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    const itemsHtml = (items || []).map((it: any, idx: number) => {
      const p = it.products || {};
      const desc = [p.name, p.size, p.color].filter(Boolean).join(" / ");
      const bg = idx % 2 === 0 ? "background:#f8f9fa" : "";
      return `<tr style="${bg}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px">${desc}${p.sku ? `<br/><small style="color:#888">${p.sku}</small>` : ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">${it.quantity}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right">${fmt(it.unit_price)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600">${fmt(it.total)}</td>
      </tr>`;
    }).join("");

    const invoiceUrl = `https://garment-grace-erp.lovable.app/invoice/${invoice_id}`;
    const subject = `Invoice ${invoice.invoice_number} from ${store.name || "Originee"}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222">
        <div style="background:#1a1a2e;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:20px">${store.name || "Originee"}</h2>
          ${store.address ? `<p style="margin:4px 0 0;font-size:12px;opacity:.85">${store.address}</p>` : ""}
          ${store.phone ? `<p style="margin:2px 0 0;font-size:12px;opacity:.85">Ph: ${store.phone}</p>` : ""}
          ${store.gst_number ? `<p style="margin:2px 0 0;font-size:12px;opacity:.85">GSTIN: ${store.gst_number}</p>` : ""}
        </div>
        <div style="padding:20px 24px;background:#fff;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
          <p style="margin:0 0 4px"><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
          <p style="margin:0 0 4px"><strong>Date:</strong> ${date}</p>
          <p style="margin:0 0 4px"><strong>Customer:</strong> ${customer.name || "Customer"}${customer.mobile ? ` &middot; ${customer.mobile}` : ""}</p>
          <p style="margin:0 0 16px"><strong>Payment:</strong> ${(invoice.payment_method || "").toUpperCase()}</p>

          <table style="border-collapse:collapse;width:100%;margin-top:8px">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:10px;text-align:left;font-size:12px">ITEM</th>
              <th style="padding:10px;text-align:center;font-size:12px">QTY</th>
              <th style="padding:10px;text-align:right;font-size:12px">PRICE</th>
              <th style="padding:10px;text-align:right;font-size:12px">TOTAL</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <table style="margin-top:16px;margin-left:auto;font-size:13px">
            <tr><td style="padding:4px 12px">Subtotal</td><td style="text-align:right">${fmt(invoice.subtotal)}</td></tr>
            <tr><td style="padding:4px 12px">Tax</td><td style="text-align:right">${fmt(invoice.tax_amount)}</td></tr>
            ${Number(invoice.discount_amount) > 0 ? `<tr><td style="padding:4px 12px">Discount</td><td style="text-align:right;color:#d32f2f">- ${fmt(invoice.discount_amount)}</td></tr>` : ""}
            <tr style="font-weight:bold;font-size:15px"><td style="padding:8px 12px;border-top:2px solid #222">Total</td><td style="text-align:right;border-top:2px solid #222">${fmt(invoice.total_amount)}</td></tr>
          </table>

          <p style="margin-top:24px;text-align:center">
            <a href="${invoiceUrl}" style="background:#1a1a2e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px">View Invoice Online</a>
          </p>
          <p style="margin-top:24px;font-size:11px;color:#999;text-align:center">Thank you for your purchase!</p>
        </div>
      </div>`;

    await sendEmailViaSMTP(recipient, subject, html, store.name || "Originee");

    return new Response(JSON.stringify({ success: true, sent_to: recipient }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-invoice-email error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
