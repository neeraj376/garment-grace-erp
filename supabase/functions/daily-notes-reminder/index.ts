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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all stores with their owner profiles (to get email)
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, store_id, full_name, role")
      .eq("role", "owner");

    if (profileError) throw profileError;
    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No owners found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;

    for (const profile of profiles) {
      if (!profile.store_id) continue;

      // Get owner's email from auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
      if (authError || !authUser?.user?.email) continue;
      const ownerEmail = authUser.user.email;

      // Get invoices with notes for this store
      const { data: invoices, error: invError } = await supabaseAdmin
        .from("invoices")
        .select("invoice_number, total_amount, payment_method, status, notes, created_at, customers(name, mobile)")
        .eq("store_id", profile.store_id)
        .not("notes", "is", null)
        .neq("notes", "")
        .order("created_at", { ascending: false });

      if (invError) {
        console.error(`Error fetching invoices for store ${profile.store_id}:`, invError);
        continue;
      }

      if (!invoices || invoices.length === 0) continue;

      // Build HTML email
      const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      const invoiceRows = invoices.map((inv: any) => {
        const customer = inv.customers?.name || "Walk-in";
        const mobile = inv.customers?.mobile || "—";
        const date = new Date(inv.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const amount = Number(inv.total_amount).toLocaleString("en-IN");
        const note = inv.notes || "";
        const statusColor = inv.status === "completed" ? "#16a34a" : inv.status === "partially_returned" ? "#d97706" : "#dc2626";

        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;">${inv.invoice_number}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;">${customer}<br><span style="color:#888;font-size:12px;">${mobile}</span></td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;">${date}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;">₹${amount}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;"><span style="background:${statusColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">${inv.status}</span></td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;background:#fff8f0;color:#b45309;font-style:italic;">📝 ${note}</td>
          </tr>`;
      }).join("");

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;">
          <div style="background:#1a1a2e;color:#fff;padding:20px 25px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;font-size:20px;">📋 Daily Invoice Notes Reminder</h1>
            <p style="margin:5px 0 0;color:#ccc;font-size:14px;">${today} • ${invoices.length} invoice(s) with notes</p>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;">Invoice #</th>
                  <th style="padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;">Customer</th>
                  <th style="padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;">Date</th>
                  <th style="padding:12px;text-align:right;border-bottom:2px solid #e5e7eb;">Amount</th>
                  <th style="padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;">Status</th>
                  <th style="padding:12px;text-align:left;border-bottom:2px solid #e5e7eb;">Note</th>
                </tr>
              </thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </div>
          <p style="color:#888;font-size:12px;margin-top:15px;text-align:center;">This is an automated daily reminder from Originee.</p>
        </div>`;

      await sendEmailViaSMTP(
        ownerEmail,
        `📋 ${invoices.length} Invoice(s) with Notes — ${today}`,
        htmlBody
      );
      totalSent++;
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent: totalSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("daily-notes-reminder error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
