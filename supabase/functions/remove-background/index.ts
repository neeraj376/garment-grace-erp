// Showroom photo cleanup: replaces background with a clean studio backdrop and
// fixes lighting via the Lovable AI Gateway image-edit endpoint.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PROMPT =
  "Turn this into a professional showroom-quality ecommerce product photo. Remove the existing background completely and place the product on a seamless pure white studio backdrop. Relight it with soft, even, diffused studio lighting: fix dim, yellow or uneven light, correct white balance, remove harsh shadows and glare, keep only a subtle natural ground shadow. Sharpen edges and fabric detail, center the product with comfortable margins. Keep the product exactly as-is: do not change its colour, shape, pattern, logo, text or details, and do not add props or people.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BUCKET_MARK = "/storage/v1/object/public/product-media/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Please sign in again." }, 401);
    const { data: u } = await supabase.auth.getUser(auth.slice(7));
    if (!u?.user) return json({ error: "Please sign in again." }, 401);
    const { data: profile } = await supabase.from("profiles").select("store_id").eq("user_id", u.user.id).maybeSingle();
    const storeId = profile?.store_id;
    if (!storeId) return json({ error: "Store access denied" }, 403);

    const body = await req.json().catch(() => ({}));
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
    if (!imageUrl || !storagePath || storagePath.includes("..")) return json({ error: "imageUrl and storagePath are required" }, 400);

    // Only the caller's own store media may be read or written.
    const idx = imageUrl.indexOf(BUCKET_MARK);
    const sourcePath = idx >= 0 ? decodeURIComponent(imageUrl.slice(idx + BUCKET_MARK.length).split("?")[0]) : "";
    if (!sourcePath.startsWith(`${storeId}/`) || !storagePath.startsWith(`${storeId}/`)) {
      return json({ error: "This photo does not belong to your store." }, 403);
    }

    const { data: src, error: dlErr } = await supabase.storage.from("product-media").download(sourcePath);
    if (dlErr || !src) return json({ error: "Could not read the uploaded photo." }, 400);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured" }, 500);

    const form = new FormData();
    form.append("model", "openai/gpt-image-2.5-sunburst");
    form.append("prompt", PROMPT);
    form.append("image", new File([src], "source.jpg", { type: src.type || "image/jpeg" }));
    form.append("size", "1024x1536");
    form.append("quality", "medium");
    form.append("output_format", "jpeg");

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
    });
    if (!ai.ok) {
      const t = await ai.text();
      console.error("AI gateway error", ai.status, t.slice(0, 300));
      let msg = "AI photo cleanup failed.";
      try { msg = JSON.parse(t)?.error?.message || JSON.parse(t)?.message || msg; } catch (_) { /* ignore */ }
      if (ai.status === 429) msg = "Too many photos at once — try again in a minute.";
      if (ai.status === 402) msg = "AI credits are used up. Add credits to continue.";
      return json({ error: msg }, ai.status);
    }
    const out = await ai.json();
    const b64 = out?.data?.[0]?.b64_json;
    if (!b64) return json({ error: "AI did not return an image." }, 502);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const outPath = storagePath.replace(/\.[^.\/]+$/, "") + ".jpg";
    const { error: upErr } = await supabase.storage.from("product-media").upload(outPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;
    return json({ url: supabase.storage.from("product-media").getPublicUrl(outPath).data.publicUrl });
  } catch (e) {
    console.error("remove-background error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
