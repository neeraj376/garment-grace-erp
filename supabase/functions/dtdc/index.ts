import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DTDC official API base URLs (Plug-N-Play / softdata)
const SOFTDATA_BASE = "https://blktracksvc.dtdc.com/dtdc-api";
const RATE_BASE = "https://apidashboardservices.dtdc.com";

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

let rateToken: { token: string; exp: number } | null = null;
async function getRateToken(): Promise<string> {
  if (rateToken && rateToken.exp > Date.now()) return rateToken.token;
  const username = need("DTDC_USERNAME");
  const password = need("DTDC_PASSWORD");
  const res = await fetch(`${RATE_BASE}/ratecalapi/PricingCalculation/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  const token = data?.access_token || data?.token || data?.data?.token;
  if (!token) throw new Error(`DTDC rate login failed: ${JSON.stringify(data)}`);
  rateToken = { token, exp: Date.now() + 1000 * 60 * 60 * 6 };
  return token;
}

// Softdata token (api-key header value) — obtain by authenticating with username/password.
// DTDC issues a per-session JWT that must be passed in the `api-key` header.
let softdataToken: { token: string; exp: number } | null = null;
async function getSoftdataToken(): Promise<string> {
  if (softdataToken && softdataToken.exp > Date.now()) return softdataToken.token;
  const username = need("DTDC_USERNAME");
  const password = need("DTDC_PASSWORD");
  const url = `${SOFTDATA_BASE}/api/dtdc/authenticate?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const res = await fetch(url, { method: "GET" });
  const text = (await res.text()).trim();
  let token = text;
  if (token.startsWith("{")) {
    try {
      const j = JSON.parse(token);
      token = j?.token || j?.access_token || j?.data?.token || "";
    } catch { /* keep raw */ }
  }
  if (!token || /not authorized|unauthorized/i.test(token)) {
    const fallback = Deno.env.get("DTDC_API_KEY");
    if (fallback) return fallback;
    throw new Error(`DTDC softdata authenticate failed: ${text}`);
  }
  softdataToken = { token, exp: Date.now() + 1000 * 60 * 60 * 6 };
  return token;
}

async function checkServiceability(pincode: string) {
  const apiKey = await getSoftdataToken();
  const res = await fetch(`${SOFTDATA_BASE}/rest/JSONCnTrk/pinCodeServiceable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ pincode }),
  });
  const data = await res.json().catch(() => ({}));
  const serviceable = data?.serviceable === true || data?.SERVICEABLE === "Y" || data?.status === "OK";
  return { serviceable, raw: data };
}

async function getRate(params: {
  destination_pincode: string;
  weight_kg: number;
  invoice_value: number;
  payment_type: string;
}) {
  const token = await getRateToken();
  const customerCode = need("DTDC_CUSTOMER_CODE");
  const origin = need("DTDC_ORIGIN_PINCODE");
  const body = {
    customer_code: customerCode,
    consignments: [
      {
        customer_code: customerCode,
        service_type_id: "B2C SMART EXPRESS",
        load_type: "NON-DOCUMENT",
        description: "Apparel",
        dimension_unit: "cm",
        length: "20",
        width: "15",
        height: "5",
        weight_unit: "kg",
        weight: String(Math.max(0.5, params.weight_kg)),
        declared_value: String(params.invoice_value || 0),
        cod_collection_mode: params.payment_type === "cod" ? "cash" : "",
        cod_amount: params.payment_type === "cod" ? String(params.invoice_value || 0) : "0",
        commodity_id: "99",
        num_pieces: "1",
        origin_details: { pincode: origin },
        destination_details: { pincode: params.destination_pincode },
      },
    ],
  };
  const res = await fetch(`${RATE_BASE}/ratecalapi/PricingCalculation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // Parse common DTDC rate response shapes
  const charges =
    data?.[0]?.total_amount ??
    data?.data?.[0]?.total_amount ??
    data?.consignments?.[0]?.total_amount ??
    data?.totalAmount ??
    null;
  if (!charges) {
    return { serviceable: false, cost: 0, raw: data };
  }
  return {
    serviceable: true,
    cost: Math.round(Number(charges)),
    service_type_id: "B2C SMART EXPRESS",
    raw: data,
  };
}

async function createConsignment(orderId: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, shipping_addresses(*), order_items(quantity, unit_price, products(name, sku))")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error(`Order not found: ${orderId}`);

  const addr = (order as any).shipping_addresses;
  if (!addr) throw new Error("Order has no shipping address");

  const items = (order as any).order_items || [];
  const totalQty = items.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
  const weightKg = Math.max(0.5, totalQty * 0.4);

  const apiKey = need("DTDC_API_KEY");
  const customerCode = need("DTDC_CUSTOMER_CODE");
  const refNumber = `ORD${String(order.order_number || order.id).replace(/[^A-Z0-9]/gi, "").slice(0, 20)}`;

  const consignment = {
    customer_code: customerCode,
    service_type_id: "B2C SMART EXPRESS",
    load_type: "NON-DOCUMENT",
    description: "Apparel",
    dimension_unit: "cm",
    length: "20",
    width: "15",
    height: "5",
    weight_unit: "kg",
    weight: String(weightKg),
    declared_value: String(order.total_amount || 0),
    num_pieces: "1",
    cod_collection_mode: order.payment_method === "cod" ? "cash" : "",
    cod_amount: order.payment_method === "cod" ? String(order.total_amount || 0) : "0",
    reference_number: refNumber,
    commodity_id: "99",
    origin_details: {
      name: need("DTDC_ORIGIN_NAME"),
      phone: need("DTDC_ORIGIN_PHONE"),
      address_line_1: need("DTDC_ORIGIN_ADDRESS"),
      pincode: need("DTDC_ORIGIN_PINCODE"),
      city: need("DTDC_ORIGIN_CITY"),
      state: need("DTDC_ORIGIN_STATE"),
    },
    destination_details: {
      name: addr.name,
      phone: addr.phone,
      address_line_1: addr.address_line1,
      address_line_2: addr.address_line2 || "",
      pincode: addr.pincode,
      city: addr.city,
      state: addr.state,
    },
    pieces_detail: [
      {
        description: "Apparel",
        declared_value: String(order.total_amount || 0),
        weight: String(weightKg),
        height: "5",
        length: "20",
        width: "15",
      },
    ],
  };

  const res = await fetch(`${SOFTDATA_BASE}/rest/JSONCnROService/createConsignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ consignments: [consignment] }),
  });
  const data = await res.json().catch(() => ({}));
  const awb =
    data?.data?.[0]?.reference_number ??
    data?.data?.[0]?.cnNumber ??
    data?.consignments?.[0]?.reference_number ??
    null;
  if (!awb) throw new Error(`DTDC consignment create failed: ${JSON.stringify(data)}`);

  await supabase
    .from("orders")
    .update({ tracking_number: awb, courier_name: "DTDC", status: "shipped" })
    .eq("id", orderId);

  return { awb_no: awb, courier_name: "DTDC" };
}

async function trackShipment(awbNo: string) {
  const apiKey = need("DTDC_API_KEY");
  const res = await fetch(`${SOFTDATA_BASE}/rest/JSONCnTrk/getTrackDetails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ trkType: "cnno", strcnno: awbNo, addtnlDtl: "Y" }),
  });
  const data = await res.json().catch(() => ({}));
  const track = data?.trackDetails || data?.trackHeader || data;
  return { status: track?.statusType || track?.strStatus || "Unknown", scans: data?.trackDetails || [], raw: data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = body?.action;
    let result: unknown;
    switch (action) {
      case "serviceability":
        result = await checkServiceability(body.pincode);
        break;
      case "rate":
        result = await getRate(body);
        break;
      case "create_consignment":
        result = await createConsignment(body.order_id);
        break;
      case "track":
        result = await trackShipment(body.awb_no);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
