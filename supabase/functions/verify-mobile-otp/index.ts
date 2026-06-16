import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, phone, code } = await req.json();
    if (!name || !phone || !code) throw new Error("Name, phone and code are required");

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Invalid phone number");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: rows, error: fetchErr } = await supabase
      .from("shop_mobile_otps")
      .select("*")
      .eq("phone", normalized)
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
      await supabase.from("shop_mobile_otps").update({ used: true }).eq("id", otp.id);
      return new Response(JSON.stringify({ valid: false, error: "Too many attempts. Request a new OTP." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (otp.code !== String(code).trim()) {
      await supabase.from("shop_mobile_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return new Response(JSON.stringify({ valid: false, error: "Invalid OTP" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("shop_mobile_otps").update({ used: true }).eq("id", otp.id);

    // Upsert visitor (one row per phone)
    const cleanName = String(name).trim().slice(0, 100);
    const { data: existing } = await supabase
      .from("shop_visitors")
      .select("id, verified_at")
      .eq("phone", normalized)
      .maybeSingle();

    let visitor;
    if (existing) {
      const { data } = await supabase
        .from("shop_visitors")
        .update({ name: cleanName, last_seen_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, name, phone, verified_at")
        .single();
      visitor = data;
    } else {
      const { data, error: insErr } = await supabase
        .from("shop_visitors")
        .insert({ name: cleanName, phone: normalized })
        .select("id, name, phone, verified_at")
        .single();
      if (insErr) throw insErr;
      visitor = data;
    }

    return new Response(JSON.stringify({ valid: true, visitor }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("verify-mobile-otp error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
