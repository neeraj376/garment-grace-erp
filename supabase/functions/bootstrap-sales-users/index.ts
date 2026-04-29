// One-time bootstrap to create sales-employee sub-user accounts with OTP-only login.
// Idempotent: re-running rotates internal passwords and re-applies permissions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const EMPLOYEES = [
  { name: "Hrithik", email: "hrithiksuri2000@gmail.com" },
  { name: "SK Roful", email: "skroful190@gmail.com" },
  { name: "Vishu", email: "subimjoelgaming@gmail.com" },
  { name: "Pooja", email: "murmupooja2006@gmail.com" },
  { name: "Chaya Rani", email: "singhchhaya695@gmail.com" },
  { name: "Raunak", email: "ronakskumar12345678910@gmail.com" },
  { name: "Anshika", email: "anshikagoyal79@gmail.com" },
];

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

  // Fetch all auth users once
  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const emp of EMPLOYEES) {
    try {
      const password = randomPassword();
      let authUser = usersList.users.find(
        (u) => u.email?.toLowerCase() === emp.email.toLowerCase()
      );

      if (authUser) {
        await admin.auth.admin.updateUserById(authUser.id, { password });
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: emp.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: emp.name },
        });
        if (error) throw error;
        authUser = created.user;
      }

      // profile
      await admin.from("profiles").upsert(
        { user_id: authUser!.id, store_id: STORE_ID, role: "staff", full_name: emp.name },
        { onConflict: "user_id" }
      );

      // permissions: invoicing only
      const permData = {
        user_id: authUser!.id, store_id: STORE_ID,
        can_invoicing: true, can_inventory: false, can_photos: false, can_customers: false,
        can_dashboard: false, can_reports: false, can_loyalty: false, can_employees: false,
        can_stock_summary: false, can_settings: false,
        can_edit_invoices: false, can_upload_inventory: false,
      };
      const { data: existing } = await admin.from("user_permissions")
        .select("id").eq("user_id", authUser!.id).eq("store_id", STORE_ID).maybeSingle();
      if (existing) {
        await admin.from("user_permissions").update(permData).eq("id", existing.id);
      } else {
        await admin.from("user_permissions").insert(permData);
      }

      // store internal password for OTP-only login
      await admin.from("employee_auth_passwords").upsert(
        { user_id: authUser!.id, email: emp.email.toLowerCase(), password },
        { onConflict: "email" }
      );

      results.push({ email: emp.email, status: "ok", user_id: authUser!.id });
    } catch (err: any) {
      results.push({ email: emp.email, status: "error", error: err.message });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
