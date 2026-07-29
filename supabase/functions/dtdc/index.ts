import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DTDC official API base URLs (Plug-N-Play / softdata)
const SOFTDATA_BASE = "https://dtdcapi.shipsy.io/api/customer/integration";
const TRACK_BASE = "https://blktracksvc.dtdc.com/dtdc-api";
const SERVICE_TYPE = Deno.env.get("DTDC_SERVICE_TYPE_ID") || "B2C SMART EXPRESS";
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

// Softdata auth: DTDC issues merchants a static `api-key` header value.
// Prefer that. Only fall back to username/password authenticate if no key is set.
let softdataToken: { token: string; exp: number } | null = null;
async function getSoftdataToken(): Promise<string> {
  const envKey = Deno.env.get("DTDC_API_KEY");
  if (envKey) return envKey;
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
    throw new Error(`DTDC softdata authenticate failed: ${text}`);
  }
  softdataToken = { token, exp: Date.now() + 1000 * 60 * 60 * 6 };
  return token;
}


async function checkServiceability(pincode: string) {
  const token = need("DTDC_ACCESS_TOKEN");
  const res = await fetch(`${TRACK_BASE}/rest/JSONCnTrk/pinCodeServiceable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": token },
    body: JSON.stringify({ pincode }),
  });
  const data = await res.json().catch(() => ({}));
  const serviceable = data?.serviceable === true || data?.SERVICEABLE === "Y" || data?.status === "OK";
  return { serviceable, raw: data };
}

// Retail markup applied on top of DTDC's quoted price
const RATE_MARKUP = 1.2;

async function getRate(params: {
  destination_pincode: string;
  weight_kg: number;
  invoice_value: number;
  payment_type: string;
  service_type_id?: string;
}) {
  const token = await getRateToken();
  const customerCode = need("DTDC_CUSTOMER_CODE");
  const origin = need("DTDC_ORIGIN_PINCODE");
  const serviceType = params.service_type_id || SERVICE_TYPE;
  const body = {
    customer_code: customerCode,
    consignments: [
      {
        customer_code: customerCode,
        service_type_id: serviceType,
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
    return { serviceable: false, cost: 0, service_type_id: serviceType, raw: data };
  }
  const baseCost = Math.round(Number(charges));
  return {
    serviceable: true,
    base_cost: baseCost,
    cost: Math.round(baseCost * RATE_MARKUP),
    service_type_id: serviceType,
    raw: data,
  };
}

// Quote every live service type so the customer can pick a courier option
async function getRates(params: {
  destination_pincode: string;
  weight_kg: number;
  invoice_value: number;
  payment_type: string;
}) {
  const results = await Promise.all(
    SERVICE_TYPES.map(async (s) => {
      try {
        const r = await getRate({ ...params, service_type_id: s.id });
        if (!r.serviceable || !r.cost) return null;
        return {
          service_type_id: s.id,
          label: s.label,
          eta: s.eta,
          cost: r.cost,
          base_cost: r.base_cost,
        };
      } catch {
        return null;
      }
    })
  );
  const options = results.filter(Boolean);
  return { serviceable: options.length > 0, options };
}

// DTDC service options offered at shipment creation (live account)
const SERVICE_TYPES = [
  { id: "B2C SMART EXPRESS", label: "B2C Smart Express (Surface)", eta: "3-6 days" },
  { id: "B2C PRIORITY", label: "B2C Priority (Air)", eta: "2-4 days" },
];


function resolveServiceType(input?: string) {
  const wanted = (input || "").trim().toUpperCase();
  const match = SERVICE_TYPES.find((s) => s.id === wanted);
  return match?.id || SERVICE_TYPE;
}

type Destination = {
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  pincode: string;
  city: string;
  state: string;
};

async function pushConsignment(opts: {
  reference: string;
  serviceType: string;
  weightKg: number;
  declaredValue: number;
  cod: boolean;
  destination: Destination;
  awbNo?: string;
}) {
  const apiKey = await getSoftdataToken();
  const customerCode = need("DTDC_CUSTOMER_CODE");

  const consignment: Record<string, unknown> = {
    customer_code: customerCode,
    service_type_id: opts.serviceType,
    load_type: "NON-DOCUMENT",
    description: "Apparel",
    dimension_unit: "cm",
    length: "20",
    width: "15",
    height: "5",
    weight_unit: "kg",
    weight: String(opts.weightKg),
    declared_value: String(opts.declaredValue || 0),
    num_pieces: "1",
    cod_collection_mode: opts.cod ? "cash" : "",
    cod_amount: opts.cod ? String(opts.declaredValue || 0) : "0",
    customer_reference_number: opts.reference,
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
      ...opts.destination,
      address_line_2: opts.destination.address_line_2 || "",
    },
    pieces_detail: [
      {
        description: "Apparel",
        declared_value: String(opts.declaredValue || 0),
        weight: String(opts.weightKg),
        height: "5",
        length: "20",
        width: "15",
      },
    ],
  };

  // If DTDC has allotted a pre-assigned AWB, pass it through; otherwise DTDC
  // allocates one from the customer's number series.
  if (opts.awbNo) consignment.reference_number = opts.awbNo;

  const res = await fetch(`${SOFTDATA_BASE}/consignment/softdata`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ consignments: [consignment] }),
  });
  const data = await res.json().catch(() => ({}));
  const row = data?.data?.[0] ?? data?.consignments?.[0] ?? {};
  const awb = row?.reference_number || row?.cnNumber || null;
  if (!awb || row?.success === false) {
    const msg = row?.message || row?.reason || JSON.stringify(data);
    throw new Error(`DTDC consignment create failed: ${msg}`);
  }
  return String(awb);
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function createConsignment(orderId: string, serviceTypeInput?: string, awbNo?: string) {
  const supabase = adminClient();
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
  const serviceType = resolveServiceType(serviceTypeInput);

  const awb = await pushConsignment({
    reference: `ORD${String(order.order_number || order.id).replace(/[^A-Z0-9]/gi, "").slice(0, 20)}`,
    serviceType,
    weightKg,
    awbNo: awbNo?.trim() || undefined,
    declaredValue: Number(order.total_amount || 0),
    cod: order.payment_method === "cod",
    destination: {
      name: addr.name,
      phone: addr.phone,
      address_line_1: addr.address_line1,
      address_line_2: addr.address_line2 || "",
      pincode: addr.pincode,
      city: addr.city,
      state: addr.state,
    },
  });

  await supabase
    .from("orders")
    .update({ tracking_number: awb, courier_name: "DTDC", status: "shipped" })
    .eq("id", orderId);

  return { awb_no: awb, courier_name: "DTDC", service_type_id: serviceType };
}

async function createConsignmentForInvoice(invoiceId: string, serviceTypeInput?: string, awbNo?: string) {
  const supabase = adminClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(quantity), customers(name, mobile)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !invoice) throw new Error(`Invoice not found: ${invoiceId}`);

  const inv = invoice as any;
  const name = inv.shipping_name || inv.customers?.name;
  const phone = inv.shipping_phone || inv.customers?.mobile;
  if (!name || !phone || !inv.shipping_address_line1 || !inv.shipping_pincode || !inv.shipping_city || !inv.shipping_state) {
    throw new Error("Invoice is missing a complete shipping address");
  }

  const totalQty = (inv.invoice_items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
  const weightKg = Math.max(0.5, totalQty * 0.4);
  const serviceType = resolveServiceType(serviceTypeInput);

  const awb = await pushConsignment({
    reference: `INV${String(inv.invoice_number || inv.id).replace(/[^A-Z0-9]/gi, "").slice(0, 20)}`,
    serviceType,
    weightKg,
    awbNo: awbNo?.trim() || undefined,
    declaredValue: Number(inv.total_amount || 0),
    cod: false,
    destination: {
      name,
      phone,
      address_line_1: inv.shipping_address_line1,
      address_line_2: inv.shipping_address_line2 || "",
      pincode: inv.shipping_pincode,
      city: inv.shipping_city,
      state: inv.shipping_state,
    },
  });

  await supabase
    .from("invoices")
    .update({ awb_no: awb, courier_name: "DTDC" })
    .eq("id", invoiceId);

  return { awb_no: awb, courier_name: "DTDC", service_type_id: serviceType };
}


async function trackShipment(awbNo: string) {
  const token = need("DTDC_ACCESS_TOKEN");
  const res = await fetch(`${TRACK_BASE}/rest/JSONCnTrk/getTrackDetails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": token },
    body: JSON.stringify({ trkType: "cnno", strcnno: awbNo, addtnlDtl: "Y" }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.statusFlag === false) {
    const msg = data?.errorDetails?.find((e: any) => e.name === "strError")?.value || "Tracking failed";
    return { status: "Not Found", message: msg, scans: [] };
  }
  const header = data?.trackHeader || {};
  const scans = (data?.trackDetails || []).map((d: any) => ({
    date: d.strActionDate,
    time: d.strActionTime,
    location: d.strOrigin || d.strDestination || "",
    activity: d.strAction || d.strManifestNo || "",
  }));
  return {
    status: header?.strStatus || header?.strStatusTransOn || "In Transit",
    origin: header?.strOrigin,
    destination: header?.strDestination,
    expected_delivery: header?.strExpectedDeliveryDate,
    scans,
    raw: data,
  };
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
      case "service_types":
        result = { service_types: SERVICE_TYPES };
        break;
      case "create_consignment":
        result = await createConsignment(body.order_id, body.service_type_id, body.awb_no);
        break;
      case "create_consignment_invoice":
        result = await createConsignmentForInvoice(body.invoice_id, body.service_type_id, body.awb_no);
        break;

      case "track":
        result = await trackShipment(body.awb_no);
        break;
      case "test_softdata": {
        const awb = await pushConsignment({
          reference: `TEST${Date.now()}`,
          serviceType: resolveServiceType(body.service_type_id),
          weightKg: 0.5,
          declaredValue: 100,
          cod: false,
          awbNo: body.awb_no,
          destination: {
            name: "Test User",
            phone: "9999999999",
            address_line_1: "MG Road",
            pincode: "682001",
            city: "Kochi",
            state: "Kerala",
          },
        });
        result = { awb };
        break;
      }
      case "debug_origin": {
        result = {
          pincode: Deno.env.get("DTDC_ORIGIN_PINCODE"),
          city: Deno.env.get("DTDC_ORIGIN_CITY"),
          state: Deno.env.get("DTDC_ORIGIN_STATE"),
          customer_code: Deno.env.get("DTDC_CUSTOMER_CODE"),
        };
        break;
      }
      case "debug_auth": {
        const username = need("DTDC_USERNAME");
        const password = need("DTDC_PASSWORD");
        const url = `${TRACK_BASE}/api/dtdc/authenticate?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const r = await fetch(url, { method: "GET" });
        result = { status: r.status, body: await r.text(), envApiKeyLen: (Deno.env.get("DTDC_API_KEY") || "").length };
        break;
      }
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
