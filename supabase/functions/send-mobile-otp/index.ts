import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return null;
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone } = await req.json();
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Enter a valid 10-digit Indian mobile number");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit: max 1 OTP per 30s, 5 per hour
    const { data: recent } = await supabase
      .from("shop_mobile_otps")
      .select("created_at")
      .eq("phone", normalized)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    if (recent && recent.length > 0) {
      const last = new Date(recent[0].created_at).getTime();
      if (Date.now() - last < 30_000) {
        throw new Error("Please wait 30 seconds before requesting another OTP");
      }
      if (recent.length >= 5) {
        throw new Error("Too many OTP requests. Try again later.");
      }
    }

    const code = genCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase
      .from("shop_mobile_otps")
      .insert({ phone: normalized, code, expires_at: expiresAt, attempts: 0, used: false });
    if (insErr) throw insErr;

    // MSG91 Flow API
    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
    const senderId = Deno.env.get("MSG91_SENDER_ID");
    if (!authKey || !templateId) throw new Error("SMS service not configured");

    // Use MSG91 Flow API and fill every common variable name so the template's
    // placeholder (##OTP##, ##otp##, ##var1##, ##1##) gets substituted correctly.
    const flowBody: any = {
      template_id: templateId,
      short_url: "0",
      recipients: [
        {
          mobiles: normalized,
          OTP: code,
          otp: code,
          var: code,
          var1: code,
          "1": code,
        },
      ],
    };
    if (senderId) flowBody.sender = senderId;

    const resp = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authkey: authKey,
      },
      body: JSON.stringify(flowBody),
    });
    const txt = await resp.text();
    if (!resp.ok) {
      console.error("MSG91 Flow API error:", resp.status, txt);
      throw new Error("Failed to send SMS. Please try again.");
    }
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch {}
    if (parsed && parsed.type && parsed.type !== "success") {
      console.error("MSG91 Flow returned non-success:", txt);
      throw new Error(parsed.message || "SMS provider rejected the request");
    }
    console.log("MSG91 OTP sent via Flow:", txt);

    return new Response(JSON.stringify({ success: true, phone: normalized }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-mobile-otp error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
