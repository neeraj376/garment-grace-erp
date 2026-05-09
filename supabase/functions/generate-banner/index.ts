// Generate AI banner for a product and save it to home_banners
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { productId, headline, subheadline, sortOrder } = await req.json();
    if (!productId) {
      return new Response(JSON.stringify({ error: "productId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles").select("store_id").eq("user_id", user.id).maybeSingle();
    if (!profile?.store_id) {
      return new Response(JSON.stringify({ error: "No store" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product } = await supabase
      .from("products").select("*").eq("id", productId).eq("store_id", profile.store_id).maybeSingle();
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalHeadline = headline || product.name;
    const finalSub = subheadline || `${product.category ?? ""} ${product.color ?? ""}`.trim() || "Discover the new collection";

    // Build prompt for AI banner. Reference the existing product photo if present.
    const promptText = `Design a luxurious, modern e-commerce hero banner (16:9, wide). Product: "${product.name}". Category: ${product.category ?? "fashion"}. Color: ${product.color ?? ""}. Style: premium menswear editorial, dramatic studio lighting, cinematic, elegant typography-friendly negative space on the left for text overlay. Showcase the product prominently on the right. Clean minimalist background with subtle gradient. High fashion magazine quality.`;

    const messages: any[] = [
      {
        role: "user",
        content: product.photo_url
          ? [
              { type: "text", text: promptText + " Use this product image as the hero subject." },
              { type: "image_url", image_url: { url: product.photo_url } },
            ]
          : promptText,
      },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const imageUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith("data:")) {
      console.error("No image in AI response", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "No image returned by AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode data URL & upload to storage
    const [meta, b64] = imageUrl.split(",");
    const mime = /data:(.*?);/.exec(meta)?.[1] ?? "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fileName = `banners/${profile.store_id}/${productId}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("product-media")
      .upload(fileName, bin, { contentType: mime, upsert: true });
    if (upErr) {
      console.error("Upload error", upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = supabase.storage.from("product-media").getPublicUrl(fileName);

    const { data: banner, error: insErr } = await supabase
      .from("home_banners")
      .insert({
        store_id: profile.store_id,
        product_id: productId,
        image_url: pub.publicUrl,
        headline: finalHeadline,
        subheadline: finalSub,
        sort_order: sortOrder ?? 0,
      })
      .select()
      .single();
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ banner }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
