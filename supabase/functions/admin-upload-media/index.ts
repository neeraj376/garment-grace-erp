import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Require an authenticated staff user (must belong to a store)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Confirm user belongs to a store (staff/owner)
    const { data: profile } = await supabase
      .from("profiles").select("store_id").eq("user_id", userData.user.id).maybeSingle();
    if (!profile?.store_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    if (body.action === "sign") {
      const { path } = body;
      const { data, error } = await supabase.storage.from("product-media").createSignedUploadUrl(path, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
      return new Response(JSON.stringify({ ...data, publicUrl: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // small base64 upload fallback
    const { path, base64, contentType } = body;
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage.from("product-media").upload(path, bin, { upsert: true, contentType: contentType || "application/octet-stream" });
    if (error) throw error;
    const { data } = supabase.storage.from("product-media").getPublicUrl(path);
    return new Response(JSON.stringify({ url: data.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
