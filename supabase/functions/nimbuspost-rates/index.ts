import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NP_BASE = "https://api.nimbuspost.com/v1";

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.exp > now) return cachedToken.token;

  const email = Deno.env.get("NIMBUSPOST_EMAIL");
  const password = Deno.env.get("NIMBUSPOST_PASSWORD");
  if (!email || !password) throw new Error("Nimbuspost credentials not configured");

  const res = await fetch(`${NP_BASE}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data?.status || !data?.data) {
    throw new Error(`Nimbuspost login failed: ${JSON.stringify(data)}`);
  }
  cachedToken = { token: data.data, exp: now + 1000 * 60 * 60 * 6 }; // 6h
  return cachedToken.token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { destination_pincode, weight_kg, invoice_value, payment_type } = await req.json();

    if (!destination_pincode || !/^[1-9]\d{5}$/.test(String(destination_pincode))) {
      throw new Error("Valid 6-digit destination pincode required");
    }
    const origin = Deno.env.get("NIMBUSPOST_ORIGIN_PINCODE");
    if (!origin) throw new Error("Origin pincode not configured");

    const weight = Math.max(0.5, Number(weight_kg) || 0.5);
    const codType = (payment_type === "cod" || payment_type === "COD") ? "cod" : "prepaid";

    const token = await getToken();

    const params = new URLSearchParams({
      origin: String(origin),
      destination: String(destination_pincode),
      payment_type: codType,
      order_amount: String(invoice_value ?? 0),
      weight: String(Math.round(weight * 1000)), // grams
    });

    const ratesRes = await fetch(`${NP_BASE}/courier/serviceability?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ratesData = await ratesRes.json();

    if (!ratesData?.status) {
      return new Response(
        JSON.stringify({ serviceable: false, error: ratesData?.message || "Not serviceable", couriers: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const list: any[] = Array.isArray(ratesData.data) ? ratesData.data : [];
    const couriers = list
      .map((c) => ({
        courier_id: c.id ?? c.courier_id,
        courier_name: c.name ?? c.courier_name ?? "Courier",
        rate: Number(c.total_charges ?? c.freight_charge ?? c.rate ?? 0),
        estimated_days: c.estimated_delivery_days ?? c.edd ?? null,
      }))
      .filter((c) => c.rate > 0)
      .sort((a, b) => a.rate - b.rate);

    const cheapest = couriers[0] ?? null;

    return new Response(
      JSON.stringify({
        serviceable: couriers.length > 0,
        cheapest,
        couriers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message, serviceable: false, couriers: [] }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
