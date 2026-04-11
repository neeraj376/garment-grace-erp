import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
    if (!WHATSAPP_API_KEY) {
      throw new Error("WHATSAPP_API_KEY is not configured");
    }

    const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");
    if (!WHATSAPP_API_URL) {
      throw new Error("WHATSAPP_API_URL is not configured");
    }

    const WHATSAPP_TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "originee_invoice_new";

    const raw = await req.json();
    const sanitize = (v: string) => (v || "").replace(/[\t\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const { phone, invoiceUrl, invoiceImageUrl } = raw;
    const customerName = sanitize(raw.customerName);
    const invoiceNumber = sanitize(raw.invoiceNumber);
    const totalAmount = sanitize(String(raw.totalAmount || "0"));

    if (!phone || !invoiceUrl) {
      throw new Error("Missing required fields: phone, invoiceUrl");
    }

    // Clean phone number - ensure country code
    let cleanPhone = phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+91" + cleanPhone;
    }
    const phoneNumber = cleanPhone.replace("+", "");

    // Convert SVG image URL to PNG via svg2png proxy for WhatsApp compatibility
    // Verify the proxy URL is reachable before using it
    let headerMediaUrl = invoiceImageUrl || invoiceUrl;
    if (headerMediaUrl && headerMediaUrl.includes("format=image")) {
      const proxyUrl = `https://svg2png.deno.dev/${headerMediaUrl}`;
      try {
        // Quick HEAD check to verify proxy is reachable (3s timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const probeRes = await fetch(proxyUrl, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (probeRes.ok) {
          headerMediaUrl = proxyUrl;
        } else {
          console.warn(`SVG proxy returned ${probeRes.status}, using direct SVG URL`);
          // Fall back to direct SVG — WhatsApp may still render it
        }
      } catch (probeErr) {
        console.warn("SVG proxy unreachable, using direct URL:", probeErr);
      }
    }

    console.log(`Sending WhatsApp to ${phoneNumber}, template=${WHATSAPP_TEMPLATE_NAME}, image=${headerMediaUrl}`);

    const payload = {
      countryCode: phoneNumber.substring(0, 2),
      phoneNumber: phoneNumber.substring(2),
      callbackData: `invoice_${invoiceNumber}`,
      type: "Template",
      template: {
        name: WHATSAPP_TEMPLATE_NAME,
        languageCode: "en",
        headerValues: [headerMediaUrl],
        bodyValues: [
          customerName || "Customer",
          invoiceNumber || "N/A",
          `₹${totalAmount || "0"}`,
        ],
        buttonValues: {
          "0": [invoiceUrl],
        },
      },
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
      if (attempt === 0) {
        console.log("Retrying without image header...");
        payload.template.headerValues = [];
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
