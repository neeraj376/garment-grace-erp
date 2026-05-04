import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
