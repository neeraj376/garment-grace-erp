import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Unknown error";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Internal-only: hash generation must not be callable by the public, otherwise an
    // attacker could craft a valid hash for an arbitrary (under-)amount and pay almost nothing.
    // The guest-checkout function already computes hashes server-side from the stored order total.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { txnid, amount, productinfo, firstname, email, phone, surl, furl } = await req.json();

    const key = Deno.env.get("PAYU_MERCHANT_KEY")!;
    const salt = Deno.env.get("PAYU_MERCHANT_SALT")!;

    // PayU hash formula: sha512(key|txnid|amount|productinfo|firstname|email|||||||||||salt)
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(hashString);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return new Response(
      JSON.stringify({
        hash,
        key,
        txnid,
        amount: String(amount),
        productinfo,
        firstname,
        email,
        phone,
        surl,
        furl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
