import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail-smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOtp(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

function otpEmailHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 8px 0;color:#0f172a">Your Originee verification code</h2>
    <p style="margin:0 0 16px 0;color:#475569">Use the code below to verify your email. It expires in 5 minutes.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:14px 0;text-align:center;color:#0f172a">${code}</div>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px">If you didn't request this, you can ignore this email.</p>
  </div></body></html>`;
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

    try {
      await sendGmail({
        to: cleanEmail,
        subject: "Your Originee Verification Code",
        html: otpEmailHtml(code),
      });
    } catch (mailErr: any) {
      console.error("Gmail SMTP send failed:", mailErr?.message || mailErr);
      throw new Error("Could not send verification email. Please try again in a minute.");
    }

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
