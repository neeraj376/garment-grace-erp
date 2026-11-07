import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { templateBodyExamples } from "../_shared/whatsappTemplateBody.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Interakt's message endpoint is https://api.interakt.ai/v1/public/message/
// Template endpoints sit under the same /v1/public base.
function interaktBase(messageUrl: string): string {
  return messageUrl.replace(/\/message\/?$/, "").replace(/\/+$/, "");
}

const NAME_RE = /^[a-z0-9_]{2,40}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const API_KEY = Deno.env.get("WHATSAPP_API_KEY");
    const API_URL = Deno.env.get("WHATSAPP_API_URL");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server configuration missing" }, 500);

    if (!API_KEY || !API_URL) return json({ error: "WhatsApp API not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile } = await admin
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.store_id) return json({ error: "Store access denied" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "get";
    const base = interaktBase(API_URL);

    // ---- Read a template's current wording + approval status ----
    if (action === "get") {
      const name =
        String(body.name || "").trim() ||
        (Deno.env.get("WHATSAPP_GROUP_TEMPLATE_NAME") || "group_invite");
      if (!name) return json({ error: "name required" }, 400);
      const res = await fetch(
        `${base}/track/organization/templates?offset=0&template_name=${encodeURIComponent(name)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );
      const text = await res.text();
      if (!res.ok) {
        return json({ error: `Interakt ${res.status}`, details: text.slice(0, 500) }, res.status);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return json({ ok: true, template: parsed });
    }

    // ---- Submit a new template for Meta approval ----
    if (action === "create") {
      if (profile.role !== "owner") {
        return json({ error: "Only the store owner can create WhatsApp templates" }, 403);
      }

      const name = String(body.name || "").trim().toLowerCase();
      const message = String(body.body || "").trim();
      const categoryRaw = String(body.category || "Marketing").trim();
      const category = categoryRaw.toLowerCase() === "utility" ? "Utility" : "Marketing";
      const footer = String(body.footer || "").trim();
      const buttonLabel = String(body.buttonLabel || "").trim();
      const urlPattern = String(body.urlPattern || "").trim();
      const urlExample = String(body.urlExample || "").trim();
      const nameExample = String(body.bodyExample || "Customer").trim() || "Customer";
      const withButton = Boolean(buttonLabel || urlPattern);

      if (!NAME_RE.test(name)) {
        return json({ error: "Template name must be 2-40 chars, lowercase letters, numbers or underscores" }, 400);
      }
      if (!message) return json({ error: "Message body is required" }, 400);
      if (message.length > 700) return json({ error: "Message body is too long (max 700 chars)" }, 400);
      if (withButton) {
        if (!buttonLabel) return json({ error: "Button label is required" }, 400);
        if (buttonLabel.length > 20) return json({ error: "Button label must be 20 chars or fewer" }, 400);
        if (!urlPattern.startsWith("https://") || !urlPattern.includes("{{1}}")) {
          return json({ error: "Link must start with https:// and contain {{1}} for the group link" }, 400);
        }
        if (!urlExample) return json({ error: "A sample link value is required for review" }, 400);
      }
      if (footer.length > 60) return json({ error: "Footer must be 60 chars or fewer" }, 400);

      const payload = {
        display_name: name,
        language: "English",
        category,
        header_format: null,
        body: message,
        body_text: templateBodyExamples(message, nameExample),
        ...(footer ? { footer } : {}),
        ...(withButton
          ? {
              button_type: "Call To Action",
              buttons: [{ type: "URL", text: buttonLabel, url: urlPattern }],
              button_text: urlExample,
            }
          : {}),
      };

      const res = await fetch(`${base}/track/templates/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      if (!res.ok) {
        return json({ error: `Interakt ${res.status}`, details: parsed }, res.status);
      }
      return json({ ok: true, created: name, response: parsed });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("whatsapp-template-admin error:", error);
    return json({ error: msg }, 500);
  }
});
