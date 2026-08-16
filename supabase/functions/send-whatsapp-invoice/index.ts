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
    const isTrackingTemplate = WHATSAPP_TEMPLATE_NAME === "order_shipped" || WHATSAPP_TEMPLATE_NAME === "order_tracking_details";
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

    // Normalize phone number to Indian 10-digit + 91 country code
    let digits = String(phone).replace(/\D/g, "");
    digits = digits.replace(/^0+/, "");        // strip leading zeros
    if (digits.startsWith("91")) digits = digits.slice(2);
    digits = digits.replace(/^0+/, "");
    if (digits.length > 10) digits = digits.slice(-10); // drop stray leading digits
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error(`Invalid mobile number: ${digits.length} digits after normalization`);
    }
    const phoneNumber = "91" + digits;


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

    // The tracking template has two body variables and a dynamic URL button.
    // Interakt accepts an incomplete payload and queues it, but Meta later
    // rejects it with 131008 when the required button parameter is omitted.
    const orderStatus = sanitize(raw.orderStatus) || "Shipped";

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
    } else {
      template.buttonValues = {
        "0": [awbNo],
      };
    }

    const payload = {
      countryCode: phoneNumber.substring(0, 2),
      phoneNumber: phoneNumber.substring(2),
      callbackData: `invoice_${invoiceNumber}`,
      type: "Template",
      template,
    };

    console.log(
      `Template components: body=${(template.bodyValues as string[]).length}, header=0, buttons=${isTrackingTemplate ? 1 : 1}`,
    );

    // Fallback variable sets used only when Interakt rejects the call
    // synchronously (template shape differs from what we assume).
    const trackingVariants: Array<() => void> = isTrackingTemplate
      ? [
          () => {
            delete (payload.template as Record<string, unknown>).buttonValues;
          },
          () => {
            (payload.template as Record<string, unknown>).headerValues = [orderStatus];
          },
        ]
      : [];



    const maxAttempts = isTrackingTemplate ? 1 + trackingVariants.length : 2;

    // Attempt to send, retry on failure
    let firstError: string | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(WHATSAPP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${WHATSAPP_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const rawBody = JSON.stringify(data);
      console.log(`WhatsApp API attempt ${attempt + 1} response:`, rawBody);

      if (response.ok && data.result !== false) {
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      lastError = `WhatsApp API error [${response.status}]: ${rawBody}`;
      if (attempt === 0) firstError = lastError;
      console.warn(`Attempt ${attempt + 1} failed: ${lastError}`);

      // Account-level failures (wallet balance, auth, plan) will never be fixed
      // by retrying — surface them immediately with a clear message.
      if (/wallet|balance|recharge|insufficient/i.test(rawBody)) {
        throw new Error(
          "WhatsApp not sent: your Interakt wallet is out of balance. Please recharge the Interakt wallet, then resend the invoice."
        );
      }
      if (response.status === 403 || /not supported on your interakt account|upgrading your subscription/i.test(rawBody)) {
        throw new Error(
          "WhatsApp not sent: your Interakt plan doesn't include API access. Enable the Public/Messaging API in Interakt (Settings → Developer Setup) or ask Interakt support to activate it on your new subscription, then try again."
        );
      }
      if (response.status === 401) {
        throw new Error(
          "WhatsApp not sent: Interakt rejected the API key. Regenerate the Basic API key in Interakt and update it here."
        );
      }

      if (isTrackingTemplate) {
        const variant = trackingVariants[attempt];
        if (variant) {
          console.log(`Retrying tracking template with variable variant ${attempt + 1}...`);
          variant();
        }
      } else if (attempt === 0) {
        // On first failure, retry with the plain invoice link as the header media
        // instead of dropping the header (templates with a media header reject an
        // empty headerValues with "Media Url is missing").
        console.log("Retrying with original invoice media URL as header...");
        (payload.template as Record<string, unknown>).headerValues = [
          invoiceImageUrl || invoiceUrl,
        ];
      }
    }


    throw new Error(firstError || lastError || "Failed to send WhatsApp message after retries");
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
