import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user is an owner
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await userClient
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "owner") {
      throw new Error("Only store owners can create sub-users");
    }

    const { email, password, fullName, permissions } = await req.json();
    if (!email || !password) throw new Error("Email and password required");

    // Create user with admin API
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email },
    });

    if (createError) throw createError;

    // Update their profile with store_id and role='staff'
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ store_id: profile.store_id, role: "staff", full_name: fullName || email })
      .eq("user_id", newUser.user.id);

    if (profileError) throw profileError;

    // Create permissions
    const { error: permError } = await adminClient
      .from("user_permissions")
      .insert({
        user_id: newUser.user.id,
        store_id: profile.store_id,
        can_invoicing: permissions?.can_invoicing ?? true,
        can_inventory: permissions?.can_inventory ?? false,
        can_photos: permissions?.can_photos ?? false,
        can_customers: permissions?.can_customers ?? false,
      });

    if (permError) throw permError;

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
