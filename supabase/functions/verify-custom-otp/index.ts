import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "Email and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find valid OTP
    const { data: otpRecords, error: fetchError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!otpRecords || otpRecords.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid or expired OTP" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used
    await supabaseAdmin
      .from("otp_codes")
      .update({ used: true })
      .eq("id", otpRecords[0].id);

    // Generate a session for the user using admin API
    // First get user by email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) throw userError;

    const user = userData.users.find((u) => u.email === email);
    if (!user) {
      return new Response(
        JSON.stringify({ valid: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a magic link token that auto-signs in
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError) throw linkError;

    // Extract the token from the link properties
    const token = linkData.properties?.hashed_token;

    return new Response(
      JSON.stringify({
        valid: true,
        token_hash: token,
        email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("verify-custom-otp error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
