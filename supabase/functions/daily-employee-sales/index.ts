import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmailViaSMTP(to: string, subject: string, htmlBody: string): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");

  const from = "originee.store@gmail.com";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });

  async function readResponse(): Promise<string> {
    const buf = new Uint8Array(4096);
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

  const boundary = "----boundary" + Date.now();
  const message = [
    `From: Originee <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
    `.`,
  ].join("\r\n");

  const dataResult = await sendCommand(message);
  await sendCommand("QUIT");
  conn.close();

  if (!dataResult.startsWith("250")) {
    throw new Error("Failed to send email: " + dataResult);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const testEmail = body.testEmail as string | undefined;
    const testPreviousDay = body.testPreviousDay as boolean | undefined;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get date range in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    
    // If testPreviousDay, go back 1 day
    if (testPreviousDay) {
      istNow.setDate(istNow.getDate() - 1);
    }
    
    const todayStart = new Date(istNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(istNow);
    todayEnd.setHours(23, 59, 59, 999);

    const utcStart = new Date(todayStart.getTime() - istOffset).toISOString();
    const utcEnd = new Date(todayEnd.getTime() - istOffset).toISOString();

    const todayDate = istNow.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });

    const { data: stores } = await supabaseAdmin.from("stores").select("id, name");
    if (!stores?.length) {
      return new Response(JSON.stringify({ success: true, message: "No stores" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;

    for (const store of stores) {
      const { data: employees } = await supabaseAdmin
        .from("employees")
        .select("id, name, email")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .not("email", "is", null);

      if (!employees?.length) continue;

      const { data: invoices } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, total_amount, employee_id, payment_method, created_at, customers(name)")
        .eq("store_id", store.id)
        .gte("created_at", utcStart)
        .lte("created_at", utcEnd);

      if (!invoices?.length) continue;

      for (const emp of employees) {
        if (!emp.email) continue;

        const empInvoices = invoices.filter((inv: any) => inv.employee_id === emp.id);
        const totalSales = empInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0);
        const invoiceCount = empInvoices.length;

        if (invoiceCount === 0) continue;

        const invoiceRows = empInvoices.map((inv: any) => {
          const customer = (inv as any).customers?.name || "Walk-in";
          const time = new Date(inv.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
          const amount = Number(inv.total_amount).toLocaleString("en-IN");
          return `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inv.invoice_number}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${customer}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${time}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inv.payment_method}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">₹${amount}</td>
            </tr>`;
        }).join("");

        const htmlBody = `
          <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;">
            <div style="background:#1a1a2e;color:#fff;padding:20px 25px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;font-size:20px;">📊 Daily Sales Summary</h1>
              <p style="margin:5px 0 0;color:#ccc;font-size:14px;">${todayDate} • ${store.name}</p>
            </div>
            <div style="background:#f0fdf4;padding:20px 25px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 5px;font-size:14px;color:#666;">Hi <strong>${emp.name}</strong>, here's your sales summary for today:</p>
              <div style="display:flex;gap:20px;margin-top:15px;">
                <div style="background:#fff;border-radius:8px;padding:15px 20px;flex:1;text-align:center;border:1px solid #dcfce7;">
                  <p style="margin:0;font-size:12px;color:#888;">Total Invoices</p>
                  <p style="margin:5px 0 0;font-size:28px;font-weight:bold;color:#16a34a;">${invoiceCount}</p>
                </div>
                <div style="background:#fff;border-radius:8px;padding:15px 20px;flex:1;text-align:center;border:1px solid #dcfce7;">
                  <p style="margin:0;font-size:12px;color:#888;">Total Sales</p>
                  <p style="margin:5px 0 0;font-size:28px;font-weight:bold;color:#16a34a;">₹${totalSales.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>
            <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Invoice #</th>
                    <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Customer</th>
                    <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Time</th>
                    <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Payment</th>
                    <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Amount</th>
                  </tr>
                </thead>
                <tbody>${invoiceRows}</tbody>
                <tfoot>
                  <tr style="background:#f0fdf4;">
                    <td colspan="4" style="padding:10px 12px;font-weight:bold;">Total</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:16px;">₹${totalSales.toLocaleString("en-IN")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p style="color:#888;font-size:12px;margin-top:15px;text-align:center;">This is an automated daily summary from Originee. Keep up the great work! 👏</p>
          </div>`;

        try {
          await sendEmailViaSMTP(
            emp.email,
            `📊 Daily Sales: ${invoiceCount} invoices, ₹${totalSales.toLocaleString("en-IN")} — ${todayDate}`,
            htmlBody
          );
          emailsSent++;
          console.log(`Sent sales email to ${emp.name} (${emp.email}): ${invoiceCount} invoices, ₹${totalSales}`);
        } catch (sendErr) {
          console.error(`Error sending to ${emp.name}:`, sendErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("daily-employee-sales error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
