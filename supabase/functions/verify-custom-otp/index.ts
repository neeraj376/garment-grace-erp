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

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;

    const authUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    );

    let storeId: string | null = null;
    if (authUser) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("store_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;
      storeId = profile?.store_id ?? null;
    }

    // Mark OTP as used
    await supabaseAdmin
      .from("otp_codes")
      .update({ used: true })
      .eq("id", otpRecords[0].id);

    // For OTP-only employee accounts, return the internal password so the
    // client can complete signInWithPassword. Email-control was just proven
    // by the OTP, so this is a safe handoff for accounts the user does not
    // know the password for.
    const { data: empAuth } = await supabaseAdmin
      .from("employee_auth_passwords")
      .select("password")
      .eq("email", normalizedEmail)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        valid: true,
        email,
        storeId,
        otpOnly: !!empAuth,
        otpOnlyPassword: empAuth?.password ?? null,
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
