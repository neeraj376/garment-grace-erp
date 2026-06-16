import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return digits;
}

async function notifyAdminNewVisitor(name: string, email: string, phone: string | null): Promise<void> {
  try {
    const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!rawPassword) return;
    const password = rawPassword.replace(/\s/g, "");
    const from = "originee.store@gmail.com";
    const to = "originee.store@gmail.com";
    const subject = `New shop visitor: ${name}`;
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const body = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <h2 style="color:#1a1a2e">New visitor registered</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 12px;color:#666">Name</td><td style="padding:6px 12px"><b>${name}</b></td></tr>
        <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${email}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Mobile</td><td style="padding:6px 12px">${phone ? "+" + phone : "—"}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Time (IST)</td><td style="padding:6px 12px">${when}</td></tr>
      </table>
    </div>`;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
    const read = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return decoder.decode(b.subarray(0, n || 0)); };
    const cmd = async (c: string) => { await conn.write(encoder.encode(c + "\r\n")); return await read(); };
    await read();
    await cmd("EHLO localhost");
    await cmd("AUTH LOGIN");
    await cmd(btoa(from));
    const auth = await cmd(btoa(password));
    if (!auth.startsWith("235")) { conn.close(); return; }
    await cmd(`MAIL FROM:<${from}>`);
    await cmd(`RCPT TO:<${to}>`);
    await cmd("DATA");
    const msg = [
      `From: Originee Alerts <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      body,
      `.`,
    ].join("\r\n");
    await cmd(msg);
    await cmd("QUIT");
    conn.close();
  } catch (e) {
    console.error("notifyAdminNewVisitor error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, email, phone, code } = await req.json();
    if (!name || !email || !code) throw new Error("Name, email and code are required");

    const cleanEmail = String(email).trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: rows, error: fetchErr } = await supabase
      .from("shop_email_otps")
      .select("*")
      .ilike("email", cleanEmail)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (fetchErr) throw fetchErr;

    const otp = rows?.[0];
    if (!otp) {
      return new Response(JSON.stringify({ valid: false, error: "OTP expired. Please request a new one." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.attempts >= 5) {
      await supabase.from("shop_email_otps").update({ used: true }).eq("id", otp.id);
      return new Response(JSON.stringify({ valid: false, error: "Too many attempts. Request a new OTP." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.code !== String(code).trim()) {
      await supabase.from("shop_email_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return new Response(JSON.stringify({ valid: false, error: "Invalid OTP" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("shop_email_otps").update({ used: true }).eq("id", otp.id);

    const cleanName = String(name).trim().slice(0, 100);
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // Lookup existing by email
    const { data: existing } = await supabase
      .from("shop_visitors")
      .select("id, verified_at")
      .ilike("email", cleanEmail)
      .maybeSingle();

    let visitor;
    if (existing) {
      const { data } = await supabase
        .from("shop_visitors")
        .update({
          name: cleanName,
          last_seen_at: new Date().toISOString(),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        })
        .eq("id", existing.id)
        .select("id, name, email, phone, verified_at")
        .single();
      visitor = data;
    } else {
      const { data, error: insErr } = await supabase
        .from("shop_visitors")
        .insert({ name: cleanName, email: cleanEmail, phone: normalizedPhone })
        .select("id, name, email, phone, verified_at")
        .single();
      if (insErr) throw insErr;
      visitor = data;
      await notifyAdminNewVisitor(cleanName, cleanEmail, normalizedPhone);
    }

    return new Response(JSON.stringify({ valid: true, visitor }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("verify-visitor-email-otp error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
