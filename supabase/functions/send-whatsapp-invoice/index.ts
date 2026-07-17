import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated staff user — never let the public spend the store's WhatsApp credits
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin
      .from("profiles").select("store_id").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.store_id) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
    if (!WHATSAPP_API_KEY) {
      throw new Error("WHATSAPP_API_KEY is not configured");
    }

    const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");
    if (!WHATSAPP_API_URL) {
      throw new Error("WHATSAPP_API_URL is not configured");
    }

    const raw = await req.json();
    const sanitize = (v: string) => (v || "").replace(/[\t\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const requestedTemplateName = sanitize(raw.templateName);
    const WHATSAPP_TEMPLATE_NAME = requestedTemplateName || Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "originee_invoice_new";
    const isTrackingTemplate = WHATSAPP_TEMPLATE_NAME === "order_tracking_details";
    const { phone, invoiceUrl, invoiceImageUrl } = raw;
    const customerName = sanitize(raw.customerName);
    const invoiceNumber = sanitize(raw.invoiceNumber);
    const totalAmount = sanitize(String(raw.totalAmount || "0"));
    const courierName = sanitize(raw.courierName);
    const awbNo = sanitize(raw.awbNo);

    if (!phone || (!isTrackingTemplate && !invoiceUrl)) {
      throw new Error(isTrackingTemplate ? "Missing required field: phone" : "Missing required fields: phone, invoiceUrl");
    }
    if (isTrackingTemplate && (!courierName || !awbNo)) {
      throw new Error("Missing required fields: courierName, awbNo");
    }

    // Clean phone number - ensure country code
    let cleanPhone = phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+91" + cleanPhone;
    }
    const phoneNumber = cleanPhone.replace("+", "");

    // Convert SVG → PNG for WhatsApp (Meta rejects SVG in template headers).
    // Try providers in order and use the first one that returns 200 with an image/* content-type.
    let headerMediaUrl = invoiceImageUrl || invoiceUrl;
    if (headerMediaUrl && headerMediaUrl.includes("format=image")) {
      const originalSvgUrl = headerMediaUrl;
      const candidates = [
        `https://images.weserv.nl/?url=${encodeURIComponent(originalSvgUrl.replace(/^https?:\/\//, ""))}&output=png&w=1080`,
        `https://wsrv.nl/?url=${encodeURIComponent(originalSvgUrl.replace(/^https?:\/\//, ""))}&output=png&w=1080`,
        `https://svg2png.deno.dev/${originalSvgUrl}`,
      ];
      for (const candidate of candidates) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const probeRes = await fetch(candidate, { method: "GET", signal: controller.signal });
          clearTimeout(timeoutId);
          const ct = probeRes.headers.get("content-type") || "";
          if (probeRes.ok && ct.startsWith("image/")) {
            headerMediaUrl = candidate;
            console.log(`Using SVG→PNG proxy: ${candidate.split("?")[0]} (${ct})`);
            try { await probeRes.body?.cancel(); } catch { /* ignore */ }
            break;
          }
          try { await probeRes.body?.cancel(); } catch { /* ignore */ }
          console.warn(`Proxy ${candidate.split("?")[0]} returned ${probeRes.status} ${ct}`);
        } catch (probeErr) {
          console.warn(`Proxy ${candidate.split("?")[0]} unreachable:`, probeErr);
        }
      }
      if (headerMediaUrl === originalSvgUrl) {
        console.warn("All SVG→PNG proxies failed; will retry without header image.");
      }
    }

    console.log(`Sending WhatsApp to ${phoneNumber}, template=${WHATSAPP_TEMPLATE_NAME}, image=${headerMediaUrl}`);

    const template: Record<string, unknown> = {
      name: WHATSAPP_TEMPLATE_NAME,
      languageCode: "en",
      bodyValues: isTrackingTemplate
        ? [courierName, awbNo]
        : [customerName || "Customer", invoiceNumber || "N/A", `₹${totalAmount || "0"}`],
    };

    if (!isTrackingTemplate) {
      template.headerValues = [headerMediaUrl];
      template.buttonValues = {
        "0": [invoiceUrl],
      };
    }

    const payload = {
      countryCode: phoneNumber.substring(0, 2),
      phoneNumber: phoneNumber.substring(2),
      callbackData: `invoice_${invoiceNumber}`,
      type: "Template",
      template,
    };

    // Attempt to send, retry once on failure
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(WHATSAPP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${WHATSAPP_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log(`WhatsApp API attempt ${attempt + 1} response:`, JSON.stringify(data));

      if (response.ok && data.result !== false) {
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      lastError = `WhatsApp API error [${response.status}]: ${JSON.stringify(data)}`;
      console.warn(`Attempt ${attempt + 1} failed: ${lastError}`);

      // On first failure, try without image header (plain template)
      if (attempt === 0 && !isTrackingTemplate) {
        console.log("Retrying without image header...");
        (payload.template as Record<string, unknown>).headerValues = [];
      }
    }

    throw new Error(lastError || "Failed to send WhatsApp message after retries");
  } catch (error: unknown) {
    console.error("WhatsApp send error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, success: false, error: errorMessage }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
