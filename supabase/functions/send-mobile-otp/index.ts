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

// Cache the preflight result for the lifetime of this isolate to avoid hitting
// MSG91's template API on every OTP send. Keyed by templateId.
const templateCheckCache = new Map<string, { ok: true; at: number } | { ok: false; reason: string; at: number }>();
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function preflightTemplate(authKey: string, templateId: string): Promise<void> {
  const cached = templateCheckCache.get(templateId);
  if (cached && Date.now() - cached.at < TEMPLATE_CACHE_TTL_MS) {
    if (cached.ok) return;
    throw new Error(`MSG91 template invalid: ${cached.reason}`);
  }

  const url = `https://control.msg91.com/api/v5/otp/get-template?template_id=${encodeURIComponent(templateId)}`;
  let data: any = {};
  let httpOk = false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", authkey: authKey },
    });
    httpOk = res.ok;
    data = await res.json().catch(() => ({}));
  } catch (e) {
    console.error("MSG91 template preflight network error:", e);
    // Network failure shouldn't permanently block sends — let send proceed.
    return;
  }
  console.log("MSG91 template preflight:", JSON.stringify({ httpOk, data }));

  // MSG91 typically responds with { type: "success", data: { ... } } or
  // { type: "error", message: "..." } / { message: "...", code: 400 }.
  const isError = !httpOk || data?.type === "error" || (data?.message && !data?.data && data?.type !== "success");
  if (isError) {
    const reason = data?.message || data?.error || `HTTP ${httpOk ? 200 : "non-200"}`;
    templateCheckCache.set(templateId, { ok: false, reason, at: Date.now() });
    throw new Error(`MSG91 template check failed: ${reason}. Verify MSG91_TEMPLATE_ID is a valid OTP template in your MSG91 account.`);
  }

  const tpl = data?.data ?? data;
  // Status fields used by MSG91 vary: status / template_status / dlt_status.
  const status = String(tpl?.status ?? tpl?.template_status ?? tpl?.dlt_status ?? "").toLowerCase();
  const isActive = status === "" /* unknown shape, don't block */ ||
    status === "active" || status === "approved" || status === "1" || status === "enabled";
  if (!isActive) {
    const reason = `template not active (status: ${status})`;
    templateCheckCache.set(templateId, { ok: false, reason, at: Date.now() });
    throw new Error(`MSG91 template is not active. Current status: ${status}. Activate/approve the template in MSG91 and try again.`);
  }

  // Some responses expose template_type / category — only block if explicitly non-OTP.
  const templateType = String(tpl?.template_type ?? tpl?.category ?? "").toLowerCase();
  if (templateType && !["otp", "service_implicit", "service implicit", "transactional"].some((t) => templateType.includes(t))) {
    const reason = `template type is "${templateType}", expected OTP/Service Implicit`;
    templateCheckCache.set(templateId, { ok: false, reason, at: Date.now() });
    throw new Error(`MSG91 template cannot be used for OTP. ${reason}.`);
  }

  templateCheckCache.set(templateId, { ok: true, at: Date.now() });
}

async function sendMsg91(phone: string, otp: string): Promise<{ requestId?: string; raw: any }> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  const senderId = Deno.env.get("MSG91_SENDER_ID");
  if (!authKey || !templateId) throw new Error("MSG91 not configured");

  // Preflight: verify template exists, is active, and usable for OTP.
  await preflightTemplate(authKey, templateId);

  const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${phone}&authkey=${authKey}&otp=${otp}${senderId ? `&sender=${senderId}` : ""}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  console.log("MSG91 send response:", JSON.stringify(data));
  if (!res.ok || data?.type === "error") {
    throw new Error(`MSG91 send error: ${JSON.stringify(data)}`);
  }
  return { requestId: data?.request_id, raw: data };
}

async function checkMsg91Delivery(requestId: string, phone: string): Promise<any> {
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  if (!authKey || !requestId) return null;
  try {
    // Wait briefly so MSG91 has a delivery status to report
    await new Promise((r) => setTimeout(r, 2500));
    const now = new Date();
    const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().slice(0, 10);
    const url = `https://control.msg91.com/api/v5/report/logs/p/otp?startDate=${formatDate(start)}&endDate=${formatDate(now)}`;
    const res = await fetch(url, { headers: { accept: "application/json", authkey: authKey } });
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    const matchingRows = rows.filter((row: any) => {
      const rowText = JSON.stringify(row);
      return rowText.includes(requestId) || rowText.includes(phone);
    });
    console.log("MSG91 OTP delivery report:", JSON.stringify({ requestId, phone, matches: matchingRows, rawCount: rows.length }));
    return { ...data, matchingRows };
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
    const delivery = requestId ? await checkMsg91Delivery(requestId, normalized) : null;
    const deliveryRow = Array.isArray(delivery?.matchingRows) && delivery.matchingRows.length > 0
      ? delivery.matchingRows[0]
      : null;
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
