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
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return null;
}

async function sendMsg91(phone: string, otp: string): Promise<{ requestId?: string; raw: any }> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  const senderId = Deno.env.get("MSG91_SENDER_ID");
  if (!authKey || !templateId) throw new Error("MSG91 not configured");

  const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${phone}&authkey=${authKey}&otp=${otp}${senderId ? `&sender=${senderId}` : ""}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  console.log("MSG91 send response:", JSON.stringify(data));
  if (!res.ok || data?.type === "error") {
    throw new Error(`MSG91 send error: ${JSON.stringify(data)}`);
  }
  return { requestId: data?.request_id, raw: data };
}

async function checkMsg91Delivery(requestId: string): Promise<any> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey || !requestId) return null;
  try {
    // Wait briefly so MSG91 has a delivery status to report
    await new Promise((r) => setTimeout(r, 2500));
    const url = `https://control.msg91.com/api/v5/report/logs/p/sms?request_id=${requestId}`;
    const res = await fetch(url, { headers: { authkey: authKey } });
    const data = await res.json().catch(() => ({}));
    console.log("MSG91 delivery report:", JSON.stringify(data));
    return data;
  } catch (e) {
    console.error("Delivery report fetch failed:", e);
    return null;
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

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("shop_mobile_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone", normalized)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      throw new Error("Too many OTP requests. Try again in a few minutes.");
    }

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

    console.log(`Sending OTP to ${normalized}`);
    const { requestId, raw } = await sendMsg91(normalized, code);

    // Best-effort: fetch delivery status so we can surface carrier-level failures
    const delivery = requestId ? await checkMsg91Delivery(requestId) : null;
    const deliveryRow = Array.isArray(delivery?.data) ? delivery.data[0] : null;
    const carrierStatus = deliveryRow?.status || deliveryRow?.description || null;

    return new Response(
      JSON.stringify({
        success: true,
        phone: normalized,
        msg91RequestId: requestId,
        msg91Response: raw,
        carrierStatus,
        delivery: deliveryRow,
      }),
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
