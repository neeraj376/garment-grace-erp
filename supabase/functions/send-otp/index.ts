import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

async function sendEmailViaSMTP(to: string, code: string): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");

  const from = "originee.store@gmail.com";
  const subject = "Your Originee Login OTP";
  const body = `Your one-time verification code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`;

  // Use Gmail SMTP via Deno's built-in SMTP support
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

  // Read greeting
  await readResponse();

  await sendCommand("EHLO localhost");
  
  // AUTH LOGIN
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Invalidate any existing unused OTPs for this email
    await supabaseAdmin
      .from("otp_codes")
      .update({ used: true })
      .eq("email", email)
      .eq("used", false);

    // Generate new OTP
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP
    const { error: insertError } = await supabaseAdmin
      .from("otp_codes")
      .insert({ email, code, expires_at: expiresAt });

    if (insertError) throw insertError;

    // Send email
    await sendEmailViaSMTP(email, code);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
