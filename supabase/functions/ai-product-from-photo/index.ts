// Reads a product photo (with size tag/label visible) and extracts product details via Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    subcategory: { type: ["string", "null"] },
    size: { type: ["string", "null"] },
    color: { type: ["string", "null"] },
    material: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
  },
  required: ["name", "brand", "category", "subcategory", "size", "color", "material", "description"],
};

const PROMPT = `You are cataloguing a garment for an Indian clothing store inventory. Look at the photo carefully.
The size is written on the photo, a tag, or a label (e.g. S, M, L, XL, 32, 34, 40). Read it exactly; null if not visible.
Return: name (short retail title like "Brand Men's Slim Fit Cotton Shirt"), brand (from logo/tag, null if unknown),
category (one of: Shirts, T-Shirts, Polo T-Shirts, Jeans, Trousers, Lowers, Shorts, Jackets, Sweatshirts, Hoodies, Blazers, Kurtas, Dresses, Tops, Sets, Shoes, Accessories),
subcategory (e.g. Men, Women, Kids), color (main color name), material (if visible on tag), description (1-2 sentences).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const { imageUrl } = await req.json();
    if (!imageUrl) return json({ error: "imageUrl required" }, 400);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY")!,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "product", strict: true, schema: SCHEMA } },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: PROMPT },
            { type: "input_image", image_url: imageUrl },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      let msg = t.slice(0, 300);
      try { msg = JSON.parse(t)?.error?.message || JSON.parse(t)?.message || msg; } catch (_) { /* */ }
      if (resp.status === 402) msg = "AI credits exhausted. Add credits in Settings → Plans & credits.";
      if (resp.status === 429) msg = "AI is busy, please try again in a moment.";
      return json({ error: msg }, resp.status);
    }

    // Consume SSE stream and collect output text
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", refusal = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") text += ev.delta || "";
          else if (ev.type === "response.refusal.delta") refusal += ev.delta || "";
          else if (ev.type === "error" || ev.type === "response.failed")
            return json({ error: ev.error?.message || ev.response?.error?.message || "AI failed" }, 502);
        } catch (_) { /* partial */ }
      }
    }
    if (!text) return json({ error: refusal || "AI returned no details for this photo" }, 422);
    return json({ product: JSON.parse(text) });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
