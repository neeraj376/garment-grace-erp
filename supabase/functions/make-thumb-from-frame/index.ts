// Clean a stored video frame into a polished e-commerce product photo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  framePath: z.string().min(1).max(500),
  outputPath: z.string().min(1).max(500),
  productName: z.string().max(200).optional().default(""),
  storeId: z.string().uuid(),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const safeGatewayMessage = (status: number, text: string) => {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message;
    if (message) return String(message).slice(0, 300);
  } catch { /* plain-text response */ }
  if (status === 401) return "Product photo cleanup is not configured.";
  if (status === 402) return "AI credits are currently unavailable.";
  if (status === 429) return "Photo cleanup is busy. The original video frame was kept.";
  return `Photo cleanup failed (${status}).`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid product photo request" }, 400);
    const { framePath, outputPath, productName, storeId } = parsed.data;
    const storePrefix = `${storeId}/`;
    if (!framePath.startsWith(storePrefix) || !outputPath.startsWith(storePrefix)) {
      return json({ error: "Photo path does not belong to this store" }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !lovableKey) {
      return json({ error: "Product photo cleanup is not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: profile } = await userClient.from("profiles").select("store_id").eq("user_id", userData.user.id).maybeSingle();
    if (profile?.store_id !== storeId) return json({ error: "Store access denied" }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: source, error: downloadError } = await admin.storage.from("product-media").download(framePath);
    if (downloadError || !source) return json({ error: "Could not read the selected video frame" }, 404);

    const prompt = `Edit the supplied video frame into one polished e-commerce catalog photograph${productName ? ` of "${productName}"` : ""}. Show only the product from the source frame, fully visible, perfectly centred and upright, filling about 85% of a vertical 3:4 frame, on a pure white (#FFFFFF) seamless studio background. Present it neatly like a premium online-store listing: laid flat and symmetrical (or on an invisible ghost mannequin for tops), sleeves and legs straightened, fabric smooth, pressed and wrinkle-free, collar and hem neat. Remove people, hands, hangers, shelves, packaging, price tags held beside the item, floor clutter, and all other distractions. Correct perspective and motion blur, use soft even studio lighting with accurate white balance, true-to-life colour, sharp high-resolution fabric texture, and only a faint natural shadow. Preserve the exact real garment from the source: identical colour, pattern, logos, print, stitching, pockets, buttons, shape, proportions, and visible product details. Do not redesign, invent, recolour, add branding, add text, or change the garment.`;

    const form = new FormData();
    form.append("model", "openai/gpt-image-2.5-sunburst");
    form.append("prompt", prompt);
    form.append("image", new File([source], "video-frame.jpg", { type: source.type || "image/jpeg" }));
    form.append("size", "1024x1536");
    form.append("quality", "high");
    form.append("output_format", "jpeg");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}` },
      body: form,
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      return json({ error: safeGatewayMessage(aiResp.status, t) }, aiResp.status);
    }
    const j = await aiResp.json();
    const encoded = j.data?.[0]?.b64_json;
    if (!encoded) return json({ error: "Photo cleanup returned no image" }, 502);

    const bin = atob(encoded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const { error: upErr } = await admin.storage.from("product-media")
      .upload(outputPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = admin.storage.from("product-media").getPublicUrl(outputPath);

    return json({ url: pub.publicUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Photo cleanup failed" }, 500);
  }
});
