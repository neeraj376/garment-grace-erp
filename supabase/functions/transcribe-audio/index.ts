// Transcribes one short WAV chunk of a product video's voice-over via Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const inForm = await req.formData();
    const file = inForm.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) return json({ error: "Invalid audio" }, 400);

    const form = new FormData();
    form.append("model", "google/gemini-3.5-transcribe");
    form.append("file", new File([file], "speech.wav", { type: "audio/wav" }));
    form.append("response_format", "json");
    form.append("stream", "true");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      signal: req.signal,
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}` },
      body: form,
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
    let buf = "", text = "", done = "";
    while (true) {
      const { done: end, value } = await reader.read();
      if (end) break;
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
          if (ev.type === "transcript.text.delta") text += ev.delta || "";
          else if (ev.type === "transcript.text.done") done = ev.text || "";
          else if (ev.type === "error") return json({ error: ev.error?.message || "Transcription failed" }, 502);
        } catch (_) { /* partial */ }
      }
    }
    return json({ text: (done || text).trim() });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
