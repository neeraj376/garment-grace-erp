import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Printer, QrCode, RefreshCw } from "lucide-react";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  size: string | null;
  brand: string | null;
  selling_price: number;
  mrp: number | null;
  _stock?: number;
};

const STICKER_SIZES = {
  small: { label: 'Small (50×30 mm)', w: 50, h: 30, cols: 4, rows: 9 },
  medium: { label: 'Medium (70×40 mm)', w: 70, h: 40, cols: 3, rows: 7 },
  large: { label: 'Large (90×50 mm)', w: 90, h: 50, cols: 2, rows: 5 },
};

export default function StickerPrinter() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [size, setSize] = useState<keyof typeof STICKER_SIZES>("medium");
  const [includeMrp, setIncludeMrp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    supabase
      .from("products")
      .select("id, sku, name, category, subcategory, color, size, brand, selling_price, mrp")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("name")
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return; }
        // attach stock
        const withStock = await Promise.all(data.map(async (p) => {
          const { data: s } = await supabase.rpc("get_product_stock", { p_product_id: p.id });
          return { ...p, _stock: typeof s === "number" ? s : 0 };
        }));
        setProducts(withStock as Product[]);
        setLoading(false);
      });
  }, [storeId]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    });
  }, [products, search, category]);

  const totalStickers = Object.values(selected).reduce((s, n) => s + (n || 0), 0);

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected({}); return; }
    const next: Record<string, number> = {};
    filtered.forEach(p => { next[p.id] = p._stock && p._stock > 0 ? p._stock : 1; });
    setSelected(next);
  };

  const toggle = (p: Product, checked: boolean) => {
    setSelected(prev => {
      const next = { ...prev };
      if (checked) next[p.id] = p._stock && p._stock > 0 ? p._stock : 1;
      else delete next[p.id];
      return next;
    });
  };

  const setQty = (id: string, qty: number) => {
    setSelected(prev => ({ ...prev, [id]: Math.max(0, qty) }));
  };

  const generate = async () => {
    const items = products.filter(p => selected[p.id] > 0);
    if (items.length === 0) {
      toast({ title: "Select at least one product", variant: "destructive" });
      return;
    }
    const map: Record<string, string> = {};
    for (const p of items) {
      map[p.id] = await QRCode.toDataURL(p.sku, { width: 300, margin: 1, errorCorrectionLevel: "M" });
    }
    setQrMap(map);
    setShowPreview(true);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
  };

  const printNow = () => window.print();

  const expandedStickers = useMemo(() => {
    if (!showPreview) return [] as Product[];
    const list: Product[] = [];
    products.forEach(p => {
      const qty = selected[p.id] || 0;
      for (let i = 0; i < qty; i++) list.push(p);
    });
    return list;
  }, [showPreview, products, selected]);

  const dims = STICKER_SIZES[size];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="page-header flex items-center gap-2"><QrCode className="h-6 w-6" /> QR Code Sticker Printing</h1>
      </div>

      <Card className="print:hidden">
        <CardHeader><CardTitle className="section-title">Sticker Options</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Sticker size</Label>
            <Select value={size} onValueChange={(v) => setSize(v as keyof typeof STICKER_SIZES)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STICKER_SIZES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Filter by category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Checkbox id="mrp" checked={includeMrp} onCheckedChange={(v) => setIncludeMrp(Boolean(v))} />
            <Label htmlFor="mrp" className="cursor-pointer">Show price on sticker</Label>
          </div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="section-title">Select Products ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Search SKU or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" onClick={() => toggleAll(true)}>Select all (stock qty)</Button>
            <Button variant="outline" onClick={() => toggleAll(false)}>Clear</Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading products...</p>
          ) : (
            <div className="border rounded-lg max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left p-2 w-10"></th>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2">SKU</th>
                    <th className="text-center p-2">Stock</th>
                    <th className="text-center p-2 w-32">Stickers</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const isSel = (selected[p.id] || 0) > 0;
                    return (
                      <tr key={p.id} className="border-t hover:bg-accent/30">
                        <td className="p-2">
                          <Checkbox checked={isSel} onCheckedChange={(v) => toggle(p, Boolean(v))} />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5">
                            {p.category && <span>{p.category}</span>}
                            {p.subcategory && <span>· {p.subcategory}</span>}
                            {p.color && <span>· {p.color}</span>}
                            {p.size && <span>· {p.size}</span>}
                          </div>
                        </td>
                        <td className="p-2 font-mono text-xs">{p.sku}</td>
                        <td className="p-2 text-center">{p._stock}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            value={selected[p.id] ?? ""}
                            onChange={(e) => setQty(p.id, Number(e.target.value))}
                            className="h-8 text-center"
                            disabled={!isSel}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Total stickers: <strong>{totalStickers}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowPreview(false); setQrMap({}); }}><RefreshCw className="h-4 w-4 mr-2" /> Reset</Button>
              <Button onClick={generate} disabled={totalStickers === 0}><QrCode className="h-4 w-4 mr-2" /> Generate Preview</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <>
          <div className="flex items-center justify-between print:hidden">
            <h2 className="section-title">Print Preview ({expandedStickers.length} stickers)</h2>
            <Button onClick={printNow}><Printer className="h-4 w-4 mr-2" /> Print</Button>
          </div>
          <div className="print-area bg-white text-black p-4 border rounded-lg print:p-0 print:border-0">
            <div
              className="sticker-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${dims.cols}, ${dims.w}mm)`,
                gap: '2mm',
                justifyContent: 'center',
              }}
            >
              {expandedStickers.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="sticker"
                  style={{
                    width: `${dims.w}mm`,
                    height: `${dims.h}mm`,
                    border: '1px dashed #ccc',
                    padding: '1.5mm',
                    display: 'flex',
                    gap: '1.5mm',
                    overflow: 'hidden',
                    fontSize: '7pt',
                    lineHeight: 1.15,
                    boxSizing: 'border-box',
                    pageBreakInside: 'avoid',
                  }}
                >
                  {qrMap[p.id] && (
                    <img
                      src={qrMap[p.id]}
                      alt={p.sku}
                      style={{ width: `${dims.h - 4}mm`, height: `${dims.h - 4}mm`, flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '8pt', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.name}
                      </div>
                      <div style={{ marginTop: '0.5mm', fontSize: '6.5pt' }}>
                        {[p.category, p.subcategory].filter(Boolean).join(' / ')}
                      </div>
                      <div style={{ fontSize: '6.5pt' }}>
                        {[p.color, p.size].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '7pt' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.sku}</span>
                      {includeMrp && (
                        <span style={{ fontWeight: 700 }}>
                          ₹{Number(p.mrp || p.selling_price).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .sticker { border: none !important; }
          @page { size: A4; margin: 5mm; }
        }
      `}</style>
    </div>
  );
}
