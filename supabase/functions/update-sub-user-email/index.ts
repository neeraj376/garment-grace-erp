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
      throw new Error("Only store owners can update sub-user emails");
    }

    const { userId, newEmail } = await req.json();
    if (!userId || !newEmail) throw new Error("User ID and new email required");

    const normalizedEmail = String(newEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) throw new Error("Invalid email address");

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the target user belongs to the same store
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("store_id, role")
      .eq("user_id", userId)
      .single();

    if (!targetProfile || targetProfile.store_id !== profile.store_id || targetProfile.role !== "staff") {
      throw new Error("Cannot update email for this user");
    }

    // Check email isn't taken by another auth user
    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw listErr;
    const conflict = list.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail && u.id !== userId
    );
    if (conflict) throw new Error("This email is already in use by another account");

    // Update auth email (auto-confirm so user can sign in / receive OTP immediately)
    const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, {
      email: normalizedEmail,
      email_confirm: true,
    });
    if (updErr) throw updErr;

    // If this user is an OTP-only employee, update the employee_auth_passwords email too
    const { data: empAuth } = await adminClient
      .from("employee_auth_passwords")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (empAuth) {
      await adminClient
        .from("employee_auth_passwords")
        .update({ email: normalizedEmail })
        .eq("id", empAuth.id);
    }

    return new Response(
      JSON.stringify({ success: true, email: normalizedEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("update-sub-user-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
