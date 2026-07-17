// Generate a 12h address-collection token for an invoice, save it, and
// (optionally) email the link. Also sends a WhatsApp Business API template
// message using the configured Meta template (default: "get_orderaddress").
// Returns the link + a wa.me deep link fallback so staff can still share manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM = "originee.store@gmail.com";
const SITE_URL = "https://originee-store.com";
const WHATSAPP_TEMPLATE_NAME = "getuseraddress";

async function sendEmailViaSMTP(to: string, subject: string, body: string): Promise<void> {
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
  if (!authResult.startsWith("235")) { conn.close(); throw new Error("SMTP auth failed"); }
  await sendCommand(`MAIL FROM:<${FROM}>`);
  await sendCommand(`RCPT TO:<${to}>`);
  await sendCommand("DATA");
  const message = [
    `From: Originee Store <${FROM}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``, body, `.`,
  ].join("\r\n");
  const r = await sendCommand(message);
  await sendCommand("QUIT"); conn.close();
  if (!r.startsWith("250")) throw new Error("Failed to send: " + r);
}

async function sendWhatsAppTemplate(phone: string, url: string): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const apiKey = Deno.env.get("WHATSAPP_API_KEY");
  const apiUrl = Deno.env.get("WHATSAPP_API_URL");
  if (!apiKey || !apiUrl) return { ok: false, error: "WhatsApp API not configured" };

  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;
  if (cleanPhone.length < 12) return { ok: false, error: `Invalid phone number: ${phone}` };
  const countryCode = `+${cleanPhone.slice(0, cleanPhone.length - 10)}`;
  const phoneNumber = cleanPhone.slice(-10);

  // The approved get_orderaddress template has exactly one body variable:
  // the complete secure address URL. Do not send button/name parameters —
  // Interakt can accept and queue a mismatched payload before Meta rejects it.
  const payload = {
    countryCode,
    phoneNumber,
    callbackData: `address_${Date.now()}`,
    type: "Template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      languageCode: "en",
      bodyValues: [url],
    },
  };

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${apiKey}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log(`WhatsApp address template to ${countryCode}${phoneNumber}:`, JSON.stringify(data));
    if (res.ok && data.result !== false) {
      const messageId = typeof data.id === "string" ? data.id : undefined;
      if (!messageId) {
        return { ok: false, error: `WhatsApp provider did not return a message ID: ${JSON.stringify(data).slice(0, 240)}` };
      }
      // Interakt only confirms that the message was queued here. Actual
      // Sent/Delivered/Failed state arrives asynchronously through its webhook.
      return { ok: true, messageId };
    }
    return { ok: false, error: `${res.status}: ${JSON.stringify(data).slice(0, 240)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { invoice_id, email, phone } = await req.json();
    if (!invoice_id) throw new Error("Missing invoice_id");

    const { data: profile } = await admin
      .from("profiles").select("store_id").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.store_id) throw new Error("Forbidden");

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, store_id, invoice_number, shipping_email, shipping_phone, customer_id")
      .eq("id", invoice_id).maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");
    if (inv.store_id !== profile.store_id) throw new Error("Forbidden");

    // Generate token + 12h expiry
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await admin
      .from("invoices")
      .update({ address_token: token, address_token_expires_at: expiresAt })
      .eq("id", invoice_id);
    if (upErr) throw upErr;

    const url = `${SITE_URL}/address/${token}`;
    const emailTo = (email || inv.shipping_email || "").toString().trim();
    const phoneTo = (phone || inv.shipping_phone || "").toString().replace(/\D/g, "");

    let emailed = false, emailError: string | null = null;
    if (emailTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222">
            <div style="background:#0a3d62;padding:20px;color:#fff">
              <h2 style="margin:0">Please share your delivery address</h2>
            </div>
            <div style="padding:24px;background:#fff">
              <p>Hi,</p>
              <p>Thanks for your order <strong>${inv.invoice_number}</strong>. To ship it out, we need your delivery address. Please click the button below and fill in the details.</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${url}" style="background:#0a3d62;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Add delivery address</a>
              </p>
              <p style="color:#666;font-size:13px">This link is valid for 12 hours. If it expires, reply to this email and we'll send a new one.</p>
              <p style="margin-top:24px">— Originee Store</p>
            </div>
          </div>`;
        await sendEmailViaSMTP(emailTo, `Delivery address needed for order ${inv.invoice_number}`, html);
        emailed = true;
      } catch (e: any) {
        emailError = e?.message || "Email failed";
        console.error("address-link email failed:", emailError);
      }
    }

    // WhatsApp Business API template message. A successful API response means
    // queued by Interakt, not delivered to the customer's phone.
    let waSent = false, waError: string | null = null, waMessageId: string | null = null;
    if (phoneTo) {
      const wa = await sendWhatsAppTemplate(phoneTo, url);
      waSent = wa.ok;
      waError = wa.error || null;
      waMessageId = wa.messageId || null;
      if (!wa.ok) console.warn("WhatsApp template send failed:", wa.error);
    }

    // Fallback wa.me deep link (opens WA on staff's device with prefilled message)
    let waLink: string | null = null;
    if (phoneTo) {
      let p = phoneTo;
      if (p.length === 10) p = "91" + p;
      const text = encodeURIComponent(
        `Hi! Please share your delivery address for your new order with Originee using this secure link (valid 12 hours): ${url}.`
      );
      waLink = `https://wa.me/${p}?text=${text}`;
    }

    return new Response(JSON.stringify({
      success: true,
      url,
      waLink,
      waSent,
      waStatus: waSent ? "queued" : "failed",
      waError,
      waMessageId,
      emailed,
      emailError,
      expires_at: expiresAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-address-link error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

