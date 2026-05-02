// Send a tracking-details email via Gmail SMTP.
// Triggered manually from the admin UI when courier + AWB are available
// and the customer has an email on file.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM = "originee.store@gmail.com";

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
  if (!authResult.startsWith("235")) {
    conn.close();
    throw new Error("SMTP authentication failed");
  }
  await sendCommand(`MAIL FROM:<${FROM}>`);
  await sendCommand(`RCPT TO:<${to}>`);
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
    const {
      to,
      customerName,
      orderNumber,
      courierName,
      awbNo,
      trackingUrl,
    } = await req.json();

    if (!to || !courierName || !awbNo) {
      throw new Error("Missing required fields: to, courierName, awbNo");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
      throw new Error("Invalid email address");
    }

    const safe = (v: any) => String(v ?? "").replace(/[<>]/g, "");
    const subject = `Your order ${safe(orderNumber) || ""} has shipped — tracking details`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222">
        <div style="background:#0a3d62;padding:20px;color:#fff">
          <h2 style="margin:0">Your order is on the way! 🚚</h2>
        </div>
        <div style="padding:24px;background:#fff">
          <p>Hi ${safe(customerName) || "Customer"},</p>
          <p>Great news — your order <strong>${safe(orderNumber) || ""}</strong> has been shipped. Here are your tracking details:</p>

          <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
            <tr>
              <td style="padding:10px;border:1px solid #eee;background:#f8f9fa;width:40%"><strong>Courier</strong></td>
              <td style="padding:10px;border:1px solid #eee">${safe(courierName)}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #eee;background:#f8f9fa"><strong>AWB / Tracking No.</strong></td>
              <td style="padding:10px;border:1px solid #eee;font-family:monospace">${safe(awbNo)}</td>
            </tr>
          </table>

          ${trackingUrl ? `<p style="text-align:center;margin:24px 0">
            <a href="${safe(trackingUrl)}" style="background:#0a3d62;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Track your shipment</a>
          </p>` : ""}

          <p style="color:#666;font-size:13px">If you have any questions, reply to this email or message us on WhatsApp at +91 88828 66833.</p>
          <p style="margin-top:24px">Thank you for shopping with Originee Store!</p>
        </div>
        <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:12px;color:#888">
          Originee Store · originee-store.com
        </div>
      </div>`;

    await sendEmailViaSMTP(String(to).trim(), subject, html);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-tracking-email error:", err);
    return new Response(
      JSON.stringify({ ok: false, success: false, error: err.message || "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
