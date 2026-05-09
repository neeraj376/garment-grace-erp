// Backfill: register all 'staff' profiles in the store as OTP-only by
// rotating their internal password and storing it in employee_auth_passwords.
// Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

function randomPassword(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return "EmpAuth!" + btoa(String.fromCharCode(...arr)).replace(/[^A-Za-z0-9]/g, "").slice(0, 28);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results: any[] = [];

  // All staff profiles in this store
  const { data: staff, error: staffErr } = await admin
    .from("profiles")
    .select("user_id, full_name")
    .eq("store_id", STORE_ID)
    .eq("role", "staff");
  if (staffErr) {
    return new Response(JSON.stringify({ error: staffErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Already-registered OTP-only users
  const { data: existing } = await admin
    .from("employee_auth_passwords")
    .select("user_id");
  const registered = new Set((existing ?? []).map((r: any) => r.user_id));

  // Fetch all auth users once
  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const s of staff ?? []) {
    if (registered.has(s.user_id)) {
      results.push({ user_id: s.user_id, status: "skipped" });
      continue;
    }
    try {
      const authUser = usersList.users.find((u) => u.id === s.user_id);
      if (!authUser?.email) {
        results.push({ user_id: s.user_id, status: "no-email" });
        continue;
      }
      const password = randomPassword();
      await admin.auth.admin.updateUserById(authUser.id, { password });
      await admin.from("employee_auth_passwords").upsert(
        { user_id: authUser.id, email: authUser.email.toLowerCase(), password },
        { onConflict: "email" }
      );
      results.push({ email: authUser.email, status: "ok" });
    } catch (err: any) {
      results.push({ user_id: s.user_id, status: "error", error: err.message });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
