import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Best-effort parser for common WhatsApp provider webhook payloads
function parseInbound(payload: any): { fromPhone: string | null; text: string | null } {
  let fromPhone: string | null = null;
  let text: string | null = null;

  // Meta WhatsApp Cloud API
  try {
    const change = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (msg) {
      fromPhone = msg.from ?? null;
      text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? null;
    }
  } catch (_) {}

  // Interakt / generic
  if (!fromPhone) {
    fromPhone = payload?.from ?? payload?.phone_number ?? payload?.data?.customer?.phone_number ?? payload?.message?.from ?? null;
  }
  if (!text) {
    text = payload?.message?.text ?? payload?.text ?? payload?.data?.message?.message ?? payload?.body ?? null;
  }

  if (fromPhone) fromPhone = String(fromPhone).replace(/[^0-9]/g, "");
  return { fromPhone, text };
}

function parseDeliveryStatus(payload: any): {
  isStatus: boolean;
  phone: string | null;
  status: string | null;
  messageId: string | null;
  reason: string | null;
} {
  const eventType = String(payload?.type || payload?.event || "").toLowerCase();
  const message = payload?.data?.message || payload?.message || {};
  const rawStatus = message?.message_status || message?.status || payload?.status || null;
  const isStatus = eventType.startsWith("message_api_") || Boolean(rawStatus && message?.id);
  const phone = payload?.data?.customer?.phone_number || payload?.phone_number || null;
  const reason = message?.channel_failure_reason || message?.failure_reason || payload?.error?.message || null;
  return {
    isStatus,
    phone: phone ? String(phone).replace(/[^0-9]/g, "") : null,
    status: rawStatus ? String(rawStatus) : eventType.replace(/^message_api_/, "") || null,
    messageId: message?.id ? String(message.id) : null,
    reason: reason ? String(reason) : null,
  };
}

async function forwardToAgent(num: any, fromPhone: string, text: string) {
  if (!num.api_url || !num.api_key) {
    return { ok: false, error: "Number missing api_url or api_key" };
  }
  const agentPhone = String(num.phone).replace(/[^0-9]/g, "");
  const customerNote = `📩 New customer message from +${fromPhone}:\n\n${text || "(no text)"}`;

  // Default to Interakt-style template payload, fall back to a generic one
  try {
    if (num.provider === "interakt" || !num.provider) {
      const body = {
        countryCode: agentPhone.substring(0, 2),
        phoneNumber: agentPhone.substring(2),
        callbackData: `rotation_${fromPhone}`,
        type: num.template_name ? "Template" : "Text",
        ...(num.template_name
          ? {
              template: {
                name: num.template_name,
                languageCode: "en",
                bodyValues: [fromPhone, text?.slice(0, 500) || "(no text)"],
              },
            }
          : { message: { text: customerNote } }),
      };
      const r = await fetch(num.api_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${num.api_key}` },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: `Interakt ${r.status}: ${JSON.stringify(data)}` };
      return { ok: true };
    }

    // Meta WhatsApp Cloud API
    if (num.provider === "meta") {
      const r = await fetch(num.api_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${num.api_key}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: agentPhone,
          type: "text",
          text: { body: customerNote },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: `Meta ${r.status}: ${JSON.stringify(data)}` };
      return { ok: true };
    }

    // Generic: POST { to, text }
    const r = await fetch(num.api_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${num.api_key}` },
      body: JSON.stringify({ to: agentPhone, text: customerNote }),
    });
    if (!r.ok) return { ok: false, error: `Generic ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const storeId = url.searchParams.get("store_id");
  if (!storeId) {
    return new Response(JSON.stringify({ error: "Missing store_id query param" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Meta verification handshake
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { status: 200 });
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: any = {};
  try { payload = await req.json(); } catch (_) {}

  // Interakt sends Sent / Delivered / Read / Failed asynchronously. Record
  // these before inbound-message routing so failed templates are diagnosable.
  const delivery = parseDeliveryStatus(payload);
  if (delivery.isStatus) {
    const summary = [
      `WhatsApp ${delivery.status || "status"}`,
      delivery.messageId ? `message ${delivery.messageId}` : null,
      delivery.reason ? `reason: ${delivery.reason}` : null,
    ].filter(Boolean).join(" · ");
    await supabase.from("whatsapp_inbound_log").insert({
      store_id: storeId,
      from_phone: delivery.phone,
      message_text: summary,
      raw_payload: payload,
      forwarded_ok: delivery.status?.toLowerCase() !== "failed",
      error: delivery.status?.toLowerCase() === "failed" ? (delivery.reason || "WhatsApp delivery failed") : null,
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { fromPhone, text } = parseInbound(payload);

  // Always log
  const logBase = { store_id: storeId, from_phone: fromPhone, message_text: text, raw_payload: payload };

  if (!fromPhone) {
    await supabase.from("whatsapp_inbound_log").insert({ ...logBase, forwarded_ok: false, error: "Could not parse from phone" });
    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Sticky: existing assignment?
  const { data: existing } = await supabase
    .from("whatsapp_assignments")
    .select("number_id")
    .eq("store_id", storeId)
    .eq("customer_phone", fromPhone)
    .maybeSingle();

  let numberId = existing?.number_id ?? null;

  // Verify the assigned number is still active
  if (numberId) {
    const { data: n } = await supabase.from("whatsapp_numbers").select("is_active").eq("id", numberId).maybeSingle();
    if (!n?.is_active) numberId = null;
  }

  // Pick next active number using round-robin by last_used_at then sort_order
  if (!numberId) {
    const { data: actives } = await supabase
      .from("whatsapp_numbers")
      .select("*")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!actives || actives.length === 0) {
      await supabase.from("whatsapp_inbound_log").insert({ ...logBase, forwarded_ok: false, error: "No active numbers" });
      return new Response(JSON.stringify({ ok: false, error: "No active numbers" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pick number with smallest message_count, tie-break by oldest last_used_at, then sort_order
    actives.sort((a: any, b: any) => {
      if (a.message_count !== b.message_count) return a.message_count - b.message_count;
      const at = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bt = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      if (at !== bt) return at - bt;
      return a.sort_order - b.sort_order;
    });
    numberId = actives[0].id;

    await supabase.from("whatsapp_assignments").upsert(
      { store_id: storeId, customer_phone: fromPhone, number_id: numberId, last_message_at: new Date().toISOString() },
      { onConflict: "store_id,customer_phone" }
    );
  } else {
    await supabase.from("whatsapp_assignments")
      .update({ last_message_at: new Date().toISOString() })
      .eq("store_id", storeId).eq("customer_phone", fromPhone);
  }

  const { data: num } = await supabase.from("whatsapp_numbers").select("*").eq("id", numberId).single();
  const result = await forwardToAgent(num, fromPhone, text || "");

  await supabase.from("whatsapp_numbers")
    .update({ last_used_at: new Date().toISOString(), message_count: (num.message_count || 0) + 1 })
    .eq("id", numberId);

  await supabase.from("whatsapp_inbound_log").insert({
    ...logBase,
    assigned_number_id: numberId,
    forwarded_ok: result.ok,
    error: result.ok ? null : result.error,
  });

  return new Response(JSON.stringify({ ok: result.ok, assigned_number_id: numberId, error: result.ok ? null : result.error }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
