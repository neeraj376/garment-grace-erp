import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
      throw new Error("Only store owners can delete sub-users");
    }

    const { userId } = await req.json();
    if (!userId) throw new Error("userId required");
    if (userId === user.id) throw new Error("You cannot delete yourself");

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify target belongs to same store and is staff
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", userId)
      .single();

    if (!targetProfile || targetProfile.store_id !== profile.store_id || targetProfile.role !== "staff") {
      throw new Error("Cannot delete this user");
    }

    // Delete permissions, profile, and auth user
    await admin.from("user_permissions").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
