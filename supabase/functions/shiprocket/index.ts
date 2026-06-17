import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

// Actions that mutate the store's Shiprocket account / consume credits — staff only
const STAFF_ONLY_ACTIONS = new Set(["create_order", "generate_awb", "generate_pickup"]);

async function getToken(): Promise<string> {
  const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: Deno.env.get("SHIPROCKET_EMAIL"),
      password: Deno.env.get("SHIPROCKET_PASSWORD"),
    }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Shiprocket auth failed");
  return data.token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Caller authentication — any signed-in user
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    // Mutating actions require staff (must have a store profile)
    if (STAFF_ONLY_ACTIONS.has(action)) {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: profile } = await admin
        .from("profiles").select("store_id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile?.store_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const token = await getToken();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    let result: any;

    switch (action) {
      case "check_serviceability": {
        const qs = new URLSearchParams({
          pickup_postcode: params.pickup_pincode || "110001",
          delivery_postcode: params.delivery_pincode,
          weight: params.weight || "0.5",
          cod: "0",
        });
        const res = await fetch(`${SHIPROCKET_BASE}/courier/serviceability?${qs}`, { headers });
        result = await res.json();
        break;
      }
      case "list_pickup_locations": {
        const res = await fetch(`${SHIPROCKET_BASE}/settings/company/pickup`, { headers });
        result = await res.json();
        break;
      }
      case "create_order": {
        const res = await fetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
          method: "POST", headers, body: JSON.stringify(params.order_data),
        });
        result = await res.json();
        break;
      }
      case "track_order": {
        const res = await fetch(`${SHIPROCKET_BASE}/courier/track/shipment/${params.shipment_id}`, { headers });
        result = await res.json();
        break;
      }
      case "track_by_order_id": {
        const res = await fetch(`${SHIPROCKET_BASE}/courier/track?order_id=${params.order_id}`, { headers });
        result = await res.json();
        break;
      }
      case "generate_awb": {
        const res = await fetch(`${SHIPROCKET_BASE}/courier/assign/awb`, {
          method: "POST", headers,
          body: JSON.stringify({ shipment_id: params.shipment_id, courier_id: params.courier_id }),
        });
        result = await res.json();
        break;
      }
      case "generate_pickup": {
        const res = await fetch(`${SHIPROCKET_BASE}/courier/generate/pickup`, {
          method: "POST", headers,
          body: JSON.stringify({ shipment_id: [params.shipment_id] }),
        });
        result = await res.json();
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
