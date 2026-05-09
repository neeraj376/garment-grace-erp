import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Sparkles, Trash2, ArrowUp, ArrowDown } from "lucide-react";

const MAX_BANNERS = 5;
const PRODUCT_URL_RE = /\/product\/([0-9a-f-]{36})/i;

interface Banner {
  id: string;
  product_id: string;
  image_url: string;
  headline: string | null;
  subheadline: string | null;
  sort_order: number;
  is_active: boolean;
}

export default function HomeBannersManager() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ productInput: "", headline: "", subheadline: "" });
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("home_banners")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true });
    setBanners((data as Banner[]) ?? []);
  };

  useEffect(() => { load(); }, [storeId]);

  const resolveProductId = async (input: string): Promise<string | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const urlMatch = trimmed.match(PRODUCT_URL_RE);
    if (urlMatch) return urlMatch[1];
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
    // try by SKU or name
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("store_id", storeId!)
      .or(`sku.ilike.${trimmed},name.ilike.%${trimmed}%`)
      .limit(1);
    return data?.[0]?.id ?? null;
  };

  const handleGenerate = async () => {
    if (banners.length >= MAX_BANNERS) {
      toast({ title: `Max ${MAX_BANNERS} banners allowed`, variant: "destructive" });
      return;
    }
    const productId = await resolveProductId(form.productInput);
    if (!productId) {
      toast({ title: "Product not found", description: "Paste a product URL, ID, or exact SKU/name.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-banner", {
        body: {
          productId,
          headline: form.headline || undefined,
          subheadline: form.subheadline || undefined,
          sortOrder: banners.length,
        },
      });
      if (error) throw error;
      toast({ title: "Banner generated" });
      setForm({ productInput: "", headline: "", subheadline: "" });
      await load();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("home_banners").delete().eq("id", id);
    await load();
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = banners.findIndex((b) => b.id === id);
    const swap = banners[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("home_banners").update({ sort_order: swap.sort_order }).eq("id", id),
      supabase.from("home_banners").update({ sort_order: banners[idx].sort_order }).eq("id", swap.id),
    ]);
    await load();
  };

  const toggleActive = async (b: Banner) => {
    await supabase.from("home_banners").update({ is_active: !b.is_active }).eq("id", b.id);
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="section-title flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Storefront Home Banners (AI)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add up to {MAX_BANNERS} product links — AI will generate a hero banner for each. Shown as a carousel on the storefront home page.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new */}
        {banners.length < MAX_BANNERS && (
          <div className="space-y-3 p-4 rounded-lg border border-dashed">
            <div>
              <Label>Product URL or SKU</Label>
              <Input
                placeholder="https://...../product/<id>  or  SKU"
                value={form.productInput}
                onChange={(e) => setForm({ ...form, productInput: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Headline (optional)</Label>
                <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
              </div>
              <div>
                <Label>Subheadline (optional)</Label>
                <Input value={form.subheadline} onChange={(e) => setForm({ ...form, subheadline: e.target.value })} />
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={generating || !form.productInput}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Generate AI Banner
            </Button>
          </div>
        )}

        {/* Existing */}
        <div className="space-y-3">
          {banners.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No banners yet — add your first one above.</p>
          )}
          {banners.map((b, i) => (
            <div key={b.id} className="flex gap-3 items-center border rounded-lg p-3">
              <img src={b.image_url} alt={b.headline ?? "Banner"} className="w-32 h-20 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.headline}</p>
                <p className="text-xs text-muted-foreground truncate">{b.subheadline}</p>
                <p className="text-[10px] text-muted-foreground mt-1">/product/{b.product_id}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(b.id, -1)} disabled={i === 0}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(b.id, 1)} disabled={i === banners.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" variant={b.is_active ? "secondary" : "outline"} onClick={() => toggleActive(b)}>
                {b.is_active ? "Active" : "Hidden"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
