import { useEffect, useMemo, useState } from "react";
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

// Hewlett H30C is a 50mm (2 inch) direct-thermal label printer.
// Max printable width is ~48mm on a 50mm roll. We render ONE sticker per
// page so the printer advances exactly one label between prints.
const STICKER_SIZES = {
  "50x25": { label: "50 × 25 mm (Hewlett H30C)", w: 50, h: 25 },
  "50x30": { label: "50 × 30 mm (Hewlett H30C)", w: 50, h: 30 },
  "50x38": { label: "50 × 38 mm (Hewlett H30C)", w: 50, h: 38 },
  "50x40": { label: "50 × 40 mm (Hewlett H30C)", w: 50, h: 40 },
};

const PRINT_SAFE_INSET_MM = 3;

export default function StickerPrinter() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [size, setSize] = useState<keyof typeof STICKER_SIZES>("50x25");
  const [includeMrp, setIncludeMrp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    (async () => {
      const PAGE = 1000;
      // Fetch all active products (paged)
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, category, subcategory, color, size, brand, selling_price, mrp")
          .eq("store_id", storeId)
          .eq("is_active", true)
          .order("name")
          .range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Fetch all inventory batches for this store (paged) and aggregate.
      // This avoids firing thousands of parallel RPCs which can fail/return 0.
      const stockMap: Record<string, number> = {};
      let bFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("inventory_batches")
          .select("product_id, quantity")
          .eq("store_id", storeId)
          .range(bFrom, bFrom + PAGE - 1);
        if (error || !data) break;
        for (const b of data as any[]) {
          stockMap[b.product_id] = (stockMap[b.product_id] || 0) + (b.quantity || 0);
        }
        if (data.length < PAGE) break;
        bFrom += PAGE;
      }

      const withStock = all.map((p) => ({ ...p, _stock: stockMap[p.id] || 0 }));
      setProducts(withStock as Product[]);
      setLoading(false);
    })();
  }, [storeId]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return products.filter(p => {
      if (category !== "all" && p.category !== category) return false;
      if (words.length === 0) return true;
      const text = [p.name, p.sku, p.category, p.subcategory, p.color, p.size, p.brand]
        .filter(Boolean).join(" ").toLowerCase();
      return words.every(w => text.includes(w));
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
      map[p.id] = await QRCode.toDataURL(p.sku, { width: 360, margin: 2, errorCorrectionLevel: "M" });
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
  // Keep the QR inside the Hewlett H30C printable area; the first 2–3mm near
  // the cutter/feed edge can get clipped on 50mm rolls.
  const qrSize = Math.max(12, dims.h - 7);

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="page-header flex items-center gap-2"><QrCode className="h-6 w-6" /> QR Code Sticker Printing</h1>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="section-title">Sticker Options</CardTitle>
          <p className="text-xs text-muted-foreground">
            Configured for Hewlett H30C thermal label printer (50mm / 2-inch roll, direct-thermal).
            Each label prints on its own page so the printer feeds exactly one sticker at a time.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Label roll size</Label>
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
          <div className="flex gap-2 mb-3 flex-wrap">
            <Input
              placeholder="Scan barcode or search products by name, SKU, category, color, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 min-w-[260px]"
            />
            <Button variant="outline" onClick={() => toggleAll(true)}>Select all (stock qty)</Button>
            <Button variant="outline" onClick={() => toggleAll(false)}>Clear</Button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Showing {filtered.length} of {products.length} products
          </p>

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
          <p className="text-xs text-muted-foreground print:hidden">
            In the browser print dialog, set paper size to <strong>{dims.w} × {dims.h} mm</strong> (custom)
            and margins to <strong>None</strong>. Disable "Headers and footers" and "Fit to page".
          </p>
          <div className="print-area bg-white text-black p-4 border rounded-lg print:p-0 print:border-0">
            <div className="sticker-stack flex flex-col items-center gap-2 print:gap-0">
              {expandedStickers.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="sticker"
                  style={{
                    width: `${dims.w}mm`,
                    height: `${dims.h}mm`,
                    border: '1px dashed #ccc',
                    padding: `1.5mm ${PRINT_SAFE_INSET_MM}mm`,
                    display: 'flex',
                    gap: '1.2mm',
                    overflow: 'hidden',
                    fontSize: '6.5pt',
                    lineHeight: 1.1,
                    boxSizing: 'border-box',
                    color: '#000',
                    background: '#fff',
                  }}
                >
                  {qrMap[p.id] && (
                    <img
                      src={qrMap[p.id]}
                      alt={p.sku}
                      style={{ width: `${qrSize}mm`, height: `${qrSize}mm`, flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '7pt', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '5.5pt', marginTop: '0.3mm' }}>
                        {[p.category, p.subcategory].filter(Boolean).join(' / ')}
                      </div>
                      <div style={{ fontSize: '5.5pt' }}>
                        {[p.color, p.size].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '6pt' }}>
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
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute;
            left: 0; top: 0;
            width: ${dims.w}mm;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: #fff !important;
          }
          .sticker-stack { gap: 0 !important; margin: 0 !important; padding: 0 !important; display: block !important; }
          .sticker {
            border: none !important;
            margin: 0 !important;
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: always;
            break-after: page;
          }
          .sticker:first-child { page-break-before: avoid; break-before: avoid; }
          .sticker:last-child { page-break-after: auto; break-after: auto; }
          @page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }
        }
      `}</style>
    </div>
  );
}
