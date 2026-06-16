import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOtp(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

async function sendEmailViaSMTP(to: string, code: string): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");

  const from = "originee.store@gmail.com";
  const subject = "Your Originee Verification Code";
  const body = `Your one-time verification code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });

  async function readResponse(): Promise<string> {
    const buf = new Uint8Array(1024);
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
    `From: Originee <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, email } = await req.json();
    if (!name || !email) throw new Error("Name and email are required");

    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Invalid email address");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit: max 3 OTPs in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("shop_email_otps")
      .select("id", { count: "exact", head: true })
      .ilike("email", cleanEmail)
      .gte("created_at", tenMinAgo);
    if ((count ?? 0) >= 3) throw new Error("Too many OTP requests. Please try again later.");

    // Invalidate previous unused
    await supabase
      .from("shop_email_otps")
      .update({ used: true })
      .ilike("email", cleanEmail)
      .eq("used", false);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error: insErr } = await supabase
      .from("shop_email_otps")
      .insert({ email: cleanEmail, code, expires_at: expiresAt });
    if (insErr) throw insErr;

    await sendEmailViaSMTP(cleanEmail, code);

    return new Response(JSON.stringify({ success: true, email: cleanEmail }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-visitor-email-otp error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
