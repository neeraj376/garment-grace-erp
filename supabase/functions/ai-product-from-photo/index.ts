// Reads frames from a product video and extracts every distinct product (with size & quantity) via Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PRODUCT = {
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
    quantity: { type: "integer" },
    best_frame: { type: "integer" },
  },
  required: ["name", "brand", "category", "subcategory", "size", "color", "material", "description", "quantity", "best_frame"],
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { products: { type: "array", items: PRODUCT } },
  required: ["products"],
};

const PROMPT = (n: number) => `You are cataloguing garments for an Indian clothing store inventory. The ${n} images are frames (numbered 0 to ${n - 1}, in order) taken from ONE video in which products are shown one after another.
Identify every DISTINCT product (a distinct product = same item, same colour, same size). The same piece seen in several frames counts once.
If several identical pieces (same design, colour AND size) are shown, count them in quantity. Different sizes of the same design are separate entries.
Size is written on a tag, label, sticker or paper (e.g. S, M, L, XL, 32, 34, 40). Read it exactly; null if not visible.
For each product return: name (short retail title like "Brand Men's Slim Fit Cotton Shirt"), brand (from logo/tag, null if unknown),
category (one of: Shirts, T-Shirts, Polo T-Shirts, Jeans, Trousers, Lowers, Shorts, Jackets, Sweatshirts, Hoodies, Blazers, Kurtas, Dresses, Tops, Sets, Shoes, Accessories),
subcategory (e.g. Men, Women, Kids), color, material (if visible on tag), description (1-2 sentences), quantity (pieces seen, minimum 1),
best_frame (index of the frame showing the product most clearly, sharp, unobstructed and fully visible, for its photo).`;

const SPEECH = (segs: { start: number; end: number; text: string }[]) => `
The person in the video also speaks. Here is what they said, with the time (in seconds) it was said:
${segs.map(s => `[${s.start.toFixed(0)}s-${s.end.toFixed(0)}s] ${s.text}`).join("\n")}
Each frame label shows its time. When the speaker says a quantity (in English or Hindi, e.g. "5 pieces", "is ke 10 hai", "paanch", "dozen") for a product,
match it to the product shown at or just before that time (or the product they name/describe) and USE THE SPOKEN QUANTITY instead of your visual count.
Also use spoken sizes, brands or colours if the tag isn't readable. Otherwise count visually.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const frames: string[] = Array.isArray(body.frameUrls) ? body.frameUrls.slice(0, 40) : body.imageUrl ? [body.imageUrl] : [];
    if (!frames.length) return json({ error: "frameUrls required" }, 400);
    const times: number[] = Array.isArray(body.frameTimes) ? body.frameTimes.map(Number) : [];
    const segs = (Array.isArray(body.transcript) ? body.transcript : [])
      .filter((t: any) => t && typeof t.text === "string" && t.text.trim())
      .slice(0, 60)
      .map((t: any) => ({ start: Number(t.start) || 0, end: Number(t.end) || 0, text: String(t.text).slice(0, 2000) }));

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
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "products", strict: true, schema: SCHEMA } },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: PROMPT(frames.length) + (segs.length ? SPEECH(segs) : "") },
            ...frames.flatMap((f, i) => [
              { type: "input_text", text: Number.isFinite(times[i]) ? `Frame ${i} (at ${times[i].toFixed(1)}s):` : `Frame ${i}:` },
              { type: "input_image", image_url: f },
            ]),
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
    if (!text) return json({ error: refusal || "AI returned no products for this video" }, 422);
    return json({ products: JSON.parse(text).products || [] });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
