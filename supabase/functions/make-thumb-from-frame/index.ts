// Take a base64 frame, ask Lovable AI to make it a polished e-commerce thumbnail,
// upload to product-media storage, return the public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { frameDataUrl, storagePath, productName } = await req.json();
    if (!frameDataUrl || !storagePath) {
      return new Response(JSON.stringify({ error: "frameDataUrl and storagePath required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const prompt = `Transform this video frame into a polished e-commerce product thumbnail${productName ? ` for "${productName}"` : ""}. Center the garment in frame, place it on a clean pure white studio backdrop, remove any background distractions, enhance lighting to be soft and even, boost color accuracy and fabric detail, sharpen edges, add a subtle natural ground shadow, vertical 3:4 portrait composition, retail catalog quality. Keep the garment exactly as-is — same color, pattern, shape and details.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: frameDataUrl } },
        ]}],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI ${aiResp.status}: ${t.slice(0,200)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await aiResp.json();
    const out = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!out) {
      return new Response(JSON.stringify({ error: "no image in AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const m = out.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error("bad data url");
    const contentType = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: upErr } = await supabase.storage.from("product-media")
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("product-media").getPublicUrl(storagePath);

    return new Response(JSON.stringify({ url: pub.publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
