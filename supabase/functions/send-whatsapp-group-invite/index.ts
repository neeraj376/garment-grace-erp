import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InviteResult {
  customer_id: string | null;
  phone: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

async function sendOne(opts: {
  apiUrl: string;
  apiKey: string;
  template: string;
  phone: string;
  customerName: string;
  groupLink: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Clean phone — assume +91 default
  let cleanPhone = opts.phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
  if (!cleanPhone.startsWith("+")) cleanPhone = "+91" + cleanPhone;
  const phoneNumber = cleanPhone.replace("+", "");
  if (phoneNumber.length < 10) return { ok: false, error: "Invalid phone" };

  const payload = {
    countryCode: phoneNumber.substring(0, phoneNumber.length - 10),
    phoneNumber: phoneNumber.substring(phoneNumber.length - 10),
    callbackData: `group_invite_${Date.now()}`,
    type: "Template",
    template: {
      name: opts.template,
      languageCode: "en",
      bodyValues: [opts.customerName || "Customer"],
      buttonValues: { "0": [opts.groupLink] },
    },
  };

  try {
    const res = await fetch(opts.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${opts.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.result !== false) return { ok: true };
    return { ok: false, error: `API ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
    const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");
    const TEMPLATE = Deno.env.get("WHATSAPP_GROUP_TEMPLATE_NAME") || "group_invite";
    const GROUP_LINK = Deno.env.get("WHATSAPP_GROUP_LINK");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!WHATSAPP_API_KEY || !WHATSAPP_API_URL) throw new Error("WhatsApp API not configured");
    if (!GROUP_LINK) throw new Error("WHATSAPP_GROUP_LINK not configured");

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("store_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const storeId = profile?.store_id;
    if (!storeId) throw new Error("No store");

    const body = await req.json();
    const mode: "single" | "bulk" | "selected" = body.mode || "single";
    const skipInvited: boolean = body.skipInvited !== false; // default true

    // Build target list
    let targets: Array<{ id: string | null; phone: string; name: string }> = [];

    if (mode === "single") {
      if (!body.phone) throw new Error("phone required");
      targets.push({
        id: body.customerId || null,
        phone: body.phone,
        name: body.customerName || "Customer",
      });
    } else if (mode === "selected") {
      const ids: string[] = Array.isArray(body.customerIds) ? body.customerIds : [];
      if (ids.length === 0) throw new Error("customerIds required");
      let q = admin
        .from("customers")
        .select("id, mobile, name, group_invite_sent_at")
        .eq("store_id", storeId)
        .in("id", ids)
        .not("mobile", "is", null);
      if (skipInvited) q = q.is("group_invite_sent_at", null);
      const { data: customers, error } = await q;
      if (error) throw error;
      targets = (customers || []).map((c) => ({
        id: c.id,
        phone: c.mobile,
        name: c.name || "Customer",
      }));
    } else {
      // bulk: all customers in store with mobile, not yet invited
      const { data: customers, error } = await admin
        .from("customers")
        .select("id, mobile, name, group_invite_sent_at")
        .eq("store_id", storeId)
        .not("mobile", "is", null)
        .is("group_invite_sent_at", null);
      if (error) throw error;
      targets = (customers || []).map((c) => ({
        id: c.id,
        phone: c.mobile,
        name: c.name || "Customer",
      }));
    }

    const results: InviteResult[] = [];
    for (const t of targets) {
      const r = await sendOne({
        apiUrl: WHATSAPP_API_URL,
        apiKey: WHATSAPP_API_KEY,
        template: TEMPLATE,
        phone: t.phone,
        customerName: t.name,
        groupLink: GROUP_LINK,
      });

      results.push({
        customer_id: t.id,
        phone: t.phone,
        status: r.ok ? "sent" : "failed",
        error: r.error,
      });

      // Log + mark customer
      await admin.from("marketing_messages").insert({
        store_id: storeId,
        customer_id: t.id,
        phone: t.phone,
        campaign: "group_invite",
        status: r.ok ? "sent" : "failed",
        error: r.error || null,
        created_by: userData.user.id,
      });
      if (r.ok && t.id) {
        await admin
          .from("customers")
          .update({ group_invite_sent_at: new Date().toISOString() })
          .eq("id", t.id);
      }

      // Soft delay to avoid provider rate limits
      if (mode === "bulk") await new Promise((res) => setTimeout(res, 200));
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("group-invite error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
