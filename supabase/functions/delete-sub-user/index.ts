import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) throw new Error("Unauthorized: " + (userErr?.message ?? "no user"));
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use admin client to read profiles (bypass RLS edge cases)
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) throw new Error("Profile lookup failed: " + profileErr.message);
    if (!profile) throw new Error("Your profile was not found");
    if (profile.role !== "owner") throw new Error("Only store owners can delete staff");
    if (!profile.store_id) throw new Error("Owner has no store assigned");

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    if (!userId) throw new Error("userId required in request body");
    if (userId === user.id) throw new Error("You cannot delete yourself");

    const { data: targetProfile, error: targetErr } = await admin
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (targetErr) throw new Error("Target lookup failed: " + targetErr.message);
    if (!targetProfile) throw new Error("Target user profile not found");
    if (targetProfile.store_id !== profile.store_id) throw new Error("Target user belongs to a different store");
    if (targetProfile.role === "owner") throw new Error("Cannot delete another owner");

    // Delete dependent data first
    const { error: permErr } = await admin.from("user_permissions").delete().eq("user_id", userId);
    if (permErr) throw new Error("Failed to remove permissions: " + permErr.message);

    const { error: profDelErr } = await admin.from("profiles").delete().eq("user_id", userId);
    if (profDelErr) throw new Error("Failed to remove profile: " + profDelErr.message);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error("Failed to delete auth user: " + delErr.message);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[delete-sub-user]", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
