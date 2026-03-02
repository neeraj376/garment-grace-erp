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

    const { phone, invoiceUrl, invoiceImageUrl, customerName, invoiceNumber, totalAmount } = await req.json();

    if (!phone || !invoiceUrl) {
      throw new Error("Missing required fields: phone, invoiceUrl");
    }

    // Clean phone number - ensure country code
    let cleanPhone = phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+91" + cleanPhone; // Default to India
    }
    // Remove the + for API
    const phoneNumber = cleanPhone.replace("+", "");

    // Convert SVG image URL to PNG via svg2png proxy for WhatsApp compatibility
    let headerMediaUrl = invoiceImageUrl || invoiceUrl;
    if (headerMediaUrl && headerMediaUrl.includes("format=image")) {
      // Use svg2png.deno.dev proxy to convert SVG to PNG with proper font rendering
      headerMediaUrl = `https://svg2png.deno.dev/${headerMediaUrl}`;
    }

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

    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${WHATSAPP_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `WhatsApp API error [${response.status}]: ${JSON.stringify(data)}`
      );
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("WhatsApp send error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
