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

function buildEmailHtml(opts: {
  recipientName: string;
  storeName: string;
  isOwner: boolean;
  invoices: Array<{
    invoice_number: string;
    customer: string;
    creator: string;
    total: number;
    pending: number;
    created_at: string;
  }>;
}): string {
  const totalPending = opts.invoices.reduce((s, i) => s + i.pending, 0);
  const rows = opts.invoices
    .map((inv) => {
      const date = new Date(inv.created_at).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inv.invoice_number}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inv.customer}</td>
          ${opts.isOwner ? `<td style="padding:8px 12px;border-bottom:1px solid #eee;">${inv.creator}</td>` : ""}
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${date}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${inv.total.toLocaleString("en-IN")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#b45309;">₹${inv.pending.toLocaleString("en-IN")}</td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;">
      <div style="background:#1a1a2e;color:#fff;padding:20px 25px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;">⚠️ Wholesale Pending Reminder</h1>
        <p style="margin:5px 0 0;color:#ccc;font-size:14px;">${opts.storeName}</p>
      </div>
      <div style="background:#fffbeb;padding:20px 25px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="margin:0 0 5px;font-size:14px;color:#666;">
          Hi <strong>${opts.recipientName}</strong>, the following wholesale invoices still have pending amounts to collect:
        </p>
        <div style="background:#fff;border-radius:8px;padding:15px 20px;margin-top:15px;text-align:center;border:1px solid #fde68a;">
          <p style="margin:0;font-size:12px;color:#888;">Total Pending</p>
          <p style="margin:5px 0 0;font-size:28px;font-weight:bold;color:#b45309;">₹${totalPending.toLocaleString("en-IN")}</p>
        </div>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Invoice #</th>
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Customer</th>
              ${opts.isOwner ? `<th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Created By</th>` : ""}
              <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Date</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Invoice Total</th>
              <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Pending</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="color:#888;font-size:12px;margin-top:15px;text-align:center;">Daily reminder from Originee. Please follow up with customers to collect outstanding amounts.</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const testEmail = body.testEmail as string | undefined;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: stores } = await supabaseAdmin.from("stores").select("id, name");
    if (!stores?.length) {
      return new Response(JSON.stringify({ success: true, message: "No stores" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;

    for (const store of stores) {
      // Fetch all wholesale invoices with pending amounts for this store
      const { data: pendingInvoices } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, total_amount, pending_amount, created_by, created_at, customers(name, mobile)")
        .eq("store_id", store.id)
        .eq("source", "wholesale")
        .gt("pending_amount", 0)
        .order("created_at", { ascending: false });

      if (!pendingInvoices?.length) continue;

      // Get all profiles in the store (for creator names + emails)
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("store_id", store.id);

      const profileMap = new Map<string, { name: string; role: string }>();
      (profiles ?? []).forEach((p: any) => {
        profileMap.set(p.user_id, { name: p.full_name || "User", role: p.role });
      });

      // Get auth emails
      const userIds = Array.from(new Set([
        ...(profiles ?? []).map((p: any) => p.user_id),
        ...pendingInvoices.map((i: any) => i.created_by).filter(Boolean),
      ]));
      const emailMap = new Map<string, string>();
      for (const uid of userIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      }

      // Group invoices by creator
      const byCreator = new Map<string, typeof pendingInvoices>();
      pendingInvoices.forEach((inv: any) => {
        const key = inv.created_by || "unknown";
        if (!byCreator.has(key)) byCreator.set(key, [] as any);
        byCreator.get(key)!.push(inv);
      });

      const buildList = (invs: any[]) =>
        invs.map((inv: any) => ({
          invoice_number: inv.invoice_number,
          customer: inv.customers?.name || inv.customers?.mobile || "Walk-in",
          creator: profileMap.get(inv.created_by)?.name || "Unknown",
          total: Number(inv.total_amount),
          pending: Number(inv.pending_amount),
          created_at: inv.created_at,
        }));

      // Send to each creator (their own invoices)
      for (const [creatorId, invs] of byCreator.entries()) {
        const creatorEmail = emailMap.get(creatorId);
        const creatorInfo = profileMap.get(creatorId);
        if (!creatorEmail) continue;
        if (testEmail && creatorEmail !== testEmail) continue;

        const html = buildEmailHtml({
          recipientName: creatorInfo?.name || "Team",
          storeName: store.name,
          isOwner: false,
          invoices: buildList(invs as any[]),
        });

        try {
          await sendEmailViaSMTP(
            creatorEmail,
            `⚠️ ${invs.length} wholesale invoice${invs.length > 1 ? "s" : ""} pending — ${store.name}`,
            html
          );
          emailsSent++;
          console.log(`Sent creator reminder to ${creatorEmail}: ${invs.length} invoices`);
        } catch (e) {
          console.error(`Failed to send to creator ${creatorEmail}:`, e);
        }
      }

      // Send consolidated email to store owners
      const owners = (profiles ?? []).filter((p: any) => p.role === "owner");
      for (const owner of owners) {
        const ownerEmail = emailMap.get(owner.user_id);
        if (!ownerEmail) continue;
        if (testEmail && ownerEmail !== testEmail) continue;

        const html = buildEmailHtml({
          recipientName: owner.full_name || "Owner",
          storeName: store.name,
          isOwner: true,
          invoices: buildList(pendingInvoices as any[]),
        });

        try {
          await sendEmailViaSMTP(
            ownerEmail,
            `⚠️ ${pendingInvoices.length} wholesale invoice${pendingInvoices.length > 1 ? "s" : ""} pending — ${store.name}`,
            html
          );
          emailsSent++;
          console.log(`Sent owner reminder to ${ownerEmail}: ${pendingInvoices.length} invoices`);
        } catch (e) {
          console.error(`Failed to send to owner ${ownerEmail}:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("daily-pending-reminder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
