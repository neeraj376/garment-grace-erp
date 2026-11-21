import { FormEvent, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { MessageCircle, RefreshCw, Send, ExternalLink, Image, Package, Layers, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CatalogStatus = {
  phone: string | null; products: number; categories: number; incoming_events: number;
  bot_active: boolean; sending_credentials_present: boolean; catalog_import_verified: boolean;
};
type Product = { id: string; sku: string; name: string; brand: string | null; size: string | null; color: string | null; price: number; images: string[]; path: string };
type Turn = { role: "user" | "assistant"; content: string; products?: Product[] };
type PreviewResult = { status: CatalogStatus; reply?: string; products?: Product[] };

async function requestShopping(body: object): Promise<PreviewResult> {
  const { data, error } = await supabase.functions.invoke<PreviewResult>("whatsapp-shopping-preview", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const text = await error.context.text();
      try {
        const result = JSON.parse(text);
        throw new Error(result.error || "WhatsApp shopping check failed");
      } catch (parsed) {
        if (parsed instanceof SyntaxError) throw new Error("WhatsApp shopping check failed");
        throw parsed;
      }
    }
    throw error;
  }
  if (!data) throw new Error("No catalog response received");
  return data;
}

export default function WhatsAppShoppingManager() {
  const { role } = usePermissions();
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");

  async function checkCatalog() {
    setChecking(true); setError("");
    try { const data = await requestShopping({ action: "catalog" }); setStatus(data.status); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not check catalog"); }
    finally { setChecking(false); }
  }
  useEffect(() => { if (role === "owner") void checkCatalog(); }, [role]);
  if (role !== "owner") return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = message.trim();
    if (!content || busy) return;
    setBusy(true); setError("");
    try {
      const data = await requestShopping({ action: "preview", message: content,
        history: turns.slice(-12).map(({ role, content }) => ({ role, content })),
      });
      setStatus(data.status);
      setTurns(previous => [...previous, { role: "user", content }, { role: "assistant", content: data.reply || "", products: data.products }]);
      setMessage("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not answer this request"); }
    finally { setBusy(false); }
  }

  return (
    <section className="border-y border-border py-6 space-y-5" aria-labelledby="whatsapp-shopping-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="whatsapp-shopping-heading" className="section-title flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" />WhatsApp Shopping</h2>
          <p className="text-sm text-muted-foreground mt-1">{status?.phone || "+91 9310904557"}</p>
        </div>
        <Button type="button" variant="outline" size="icon" disabled={checking || busy} onClick={checkCatalog} aria-label="Refresh catalog" title="Refresh catalog"><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /></Button>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Products with pictures", value: status?.products, icon: Package },
          { label: "Categories", value: status?.categories, icon: Layers },
          { label: "Incoming events", value: status?.incoming_events, icon: MessageCircle },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground flex items-start gap-1"><Icon className="w-3.5 h-3.5 shrink-0" />{label}</dt><dd className="text-xl font-semibold mt-1">{value === undefined ? "—" : value.toLocaleString("en-IN")}</dd></div>)}
      </dl>
      <div className="text-sm divide-y divide-border border-y border-border">
        <div className="flex justify-between gap-4 py-2"><span>Catalog connection</span><span className="text-muted-foreground text-right">{status?.catalog_import_verified ? "Verified" : "Not verified"}</span></div>
        <div className="flex justify-between gap-4 py-2"><span>Customer bot</span><span className="text-muted-foreground text-right">{status?.bot_active ? "Active" : "Not activated"}</span></div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Shopping assistant trial</h3>
        <Button type="button" variant="ghost" size="icon" disabled={busy || !turns.length} onClick={() => { setTurns([]); setError(""); }} aria-label="Clear trial conversation" title="Clear trial conversation"><RotateCcw className="h-4 w-4" /></Button>
      </div>
      {turns.length > 0 && <div className="space-y-4 max-h-[640px] overflow-y-auto" aria-live="polite">
        {turns.map((turn, index) => <div key={index} className="space-y-3">
          <div className={`border-l-2 pl-3 ${turn.role === "user" ? "border-primary" : "border-border"}`}>
            <p className="text-xs font-medium text-muted-foreground mb-1">{turn.role === "user" ? "Customer" : "Assistant"}</p>
            <p className="text-sm break-words">{turn.content}</p>
          </div>
          {turn.products && turn.products.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {turn.products.map(product => <article key={product.id} className="border border-border rounded-md overflow-hidden bg-background min-w-0">
              {product.images[0] ? <img src={product.images[0]} alt={product.name} className="aspect-[3/4] w-full object-contain bg-muted" loading="lazy" /> : <div className="aspect-[3/4] flex items-center justify-center bg-muted"><Image className="h-8 w-8 text-muted-foreground" /></div>}
              <div className="p-2 space-y-1">
                <h4 className="text-sm font-medium break-words">{product.name}</h4>
                <p className="text-xs text-muted-foreground break-words">{[product.size, product.color].filter(Boolean).join(" · ")}</p>
                <p className="font-semibold text-sm">₹{product.price.toLocaleString("en-IN")}</p>
                <Button asChild variant="ghost" size="sm" className="px-0 h-7"><Link to={product.path} target="_blank" rel="noopener noreferrer">View product<ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
              </div>
            </article>)}
          </div>}
        </div>)}
      </div>}
      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="whatsapp-customer-request">Customer request</Label>
        <div className="flex gap-2">
          <Input id="whatsapp-customer-request" value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} placeholder="Orange puffer vest, XL, under ₹1,500" disabled={busy} />
          <Button type="submit" size="icon" disabled={busy || !message.trim() || !status} aria-label="Test shopping reply" title="Test shopping reply">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </div>
        {busy && <p className="text-sm text-muted-foreground" role="status">Checking available products…</p>}
      </form>
      {error && <p className="text-sm text-destructive break-words" role="alert">{error}</p>}
    </section>
  );
}