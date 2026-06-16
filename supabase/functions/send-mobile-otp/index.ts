import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  // Accept 10-digit Indian, or with country code 91
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return null;
}

async function sendMsg91(phone: string, otp: string) {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  const senderId = Deno.env.get("MSG91_SENDER_ID");
  if (!authKey || !templateId) throw new Error("MSG91 not configured");

  // MSG91 v5 OTP API — uses your DLT-approved template that contains ##OTP##
  const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${phone}&authkey=${authKey}&otp=${otp}${senderId ? `&sender=${senderId}` : ""}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.type === "error") {
    throw new Error(`MSG91 error: ${JSON.stringify(data)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, phone } = await req.json();
    if (!name || !phone) throw new Error("Name and phone are required");
    if (String(name).trim().length < 2) throw new Error("Please enter a valid name");

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Enter a valid 10-digit Indian mobile number");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate-limit: max 3 OTPs per phone per 10 minutes
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("shop_mobile_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone", normalized)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      throw new Error("Too many OTP requests. Try again in a few minutes.");
    }

    // Invalidate prior unused codes
    await supabase
      .from("shop_mobile_otps")
      .update({ used: true })
      .eq("phone", normalized)
      .eq("used", false);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error: insErr } = await supabase
      .from("shop_mobile_otps")
      .insert({ phone: normalized, code, expires_at: expiresAt });
    if (insErr) throw insErr;

    await sendMsg91(normalized, code);

    return new Response(
      JSON.stringify({ success: true, phone: normalized }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-mobile-otp error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
