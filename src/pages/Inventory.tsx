import { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Search, Package, Download, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import EditProductDialog from "@/components/inventory/EditProductDialog";
import PhotoUploader from "@/components/inventory/PhotoUploader";
import { parsePhotoUrls, serializePhotoUrls } from "@/lib/photoUtils";
import { usePermissions } from "@/hooks/usePermissions";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  selling_price: number;
  mrp: number | null;
  tax_rate: number;
  photo_url: string | null;
  video_url: string | null;
  is_active: boolean;
  total_stock?: number;
  inventory_batches?: { quantity: number; buying_price: number }[];
}

export default function Inventory() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const { role } = usePermissions();
  const isOwner = role === "owner";
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    sku: "", name: "", category: "", brand: "", size: "", color: "",
    selling_price: "", mrp: "", tax_rate: "18", buying_price: "", quantity: "",
  });
  const [newProductPhotos, setNewProductPhotos] = useState<string[]>([]);
  const [csvProgress, setCsvProgress] = useState<{ current: number; total: number } | null>(null);

  const fetchProducts = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("products")
      .select("*, inventory_batches(quantity, buying_price)")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const mapped = data?.map((p: any) => ({
      ...p,
      total_stock: p.inventory_batches?.reduce((s: number, b: any) => s + b.quantity, 0) ?? 0,
    })) ?? [];
    setProducts(mapped);
  };

  useEffect(() => { fetchProducts(); }, [storeId]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    try {
        const { data: product, error } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            sku: form.sku,
            name: form.name,
            category: form.category || null,
            brand: form.brand || null,
            size: form.size || null,
            color: form.color || null,
            selling_price: parseFloat(form.selling_price),
            mrp: form.mrp ? parseFloat(form.mrp) : null,
            tax_rate: parseFloat(form.tax_rate),
            buying_price: form.buying_price ? parseFloat(form.buying_price) : 0,
            photo_url: serializePhotoUrls(newProductPhotos),
          })
        .select()
        .single();

      if (error) throw error;

      if (form.buying_price && form.quantity) {
        await supabase.from("inventory_batches").insert({
          product_id: product.id,
          store_id: storeId,
          buying_price: parseFloat(form.buying_price),
          quantity: parseInt(form.quantity),
        });
      }

      toast({ title: "Product added" });
      setDialogOpen(false);
      setForm({ sku: "", name: "", category: "", brand: "", size: "", color: "", selling_price: "", mrp: "", tax_rate: "18", buying_price: "", quantity: "" });
      setNewProductPhotos([]);
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const cleanNumber = (val: string | undefined): number => {
    if (!val) return 0;
    const cleaned = val.replace(/[₹$€£,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    console.log("CSV headers detected:", headers);

    const totalRows = lines.length - 1;
    setCsvProgress({ current: 0, total: totalRows });

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

      const sellingPrice = cleanNumber(row.selling_price || row.price || row.sp || row.rate);
      const mrpVal = cleanNumber(row.mrp || row.maximum_retail_price);
      const buyingPrice = cleanNumber(row.buying_price || row.purchase_price || row.purchasprice || row.purchaseprice || row.cost_price || row.cost || row.bp || row.cp);
      const quantity = parseInt(row.quantity || row.qty || row.stock || row.opening_stock || "0") || 0;
      const taxRate = cleanNumber(row.tax_rate || row.gst || row.tax) || 18;

      try {
        const photoUrl = row.photo_url || row.image_url || row.image || row.photo || row.picture || null;
        const { data: product, error } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            sku: row.sku || row.sku_code || row.barcode || `SKU-${Date.now()}-${i}`,
            name: row.name || row.product_name || row.product || row.item || row.item_name || "Unnamed",
            category: row.category || null,
            subcategory: row.subcategory || row.sub_category || null,
            brand: row.brand || null,
            size: row.size || null,
            color: row.color || row.colour || null,
            selling_price: sellingPrice,
            mrp: mrpVal || null,
            tax_rate: taxRate,
            buying_price: buyingPrice,
            photo_url: photoUrl || null,
          })
          .select()
          .single();

        if (error) { console.error(`Row ${i} insert error:`, error.message); setCsvProgress({ current: i, total: totalRows }); continue; }

        if (product && (buyingPrice > 0 || quantity > 0)) {
          await supabase.from("inventory_batches").insert({
            product_id: product.id,
            store_id: storeId,
            buying_price: buyingPrice,
            quantity: quantity,
          });
        }
        count++;
      } catch (err: any) { console.error(`Row ${i} error:`, err.message); }
      setCsvProgress({ current: i, total: totalRows });
    }

    toast({ title: `${count} products imported` });
    setCsvProgress(null);
    fetchProducts();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const priceFileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdatePricesCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    console.log("Price update CSV headers:", headers);

    let updated = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

      const sku = row.sku || row.sku_code || row.barcode || '';
      if (!sku) continue;

      const buyingPrice = cleanNumber(row.buying_price || row.purchase_price || row.purchasprice || row.purchaseprice || row.cost_price || row.cost || row.bp || row.cp);
      if (buyingPrice <= 0) continue;

      const { error } = await supabase
        .from("products")
        .update({ buying_price: buyingPrice })
        .eq("store_id", storeId)
        .eq("sku", sku)
        .eq("is_active", true);

      if (error) { console.error(`Row ${i} price update error:`, error.message); continue; }
      updated++;
    }

    toast({ title: `${updated} product prices updated` });
    fetchProducts();
    if (priceFileInputRef.current) priceFileInputRef.current.value = "";
  };

  const handleDownloadCSV = () => {
    const headers = ["SKU", "Name", "Category", "Subcategory", "Brand", "Size", "Color", "Selling Price", "MRP", "Tax Rate %", "Purchase Price", "Stock", "Photo URL"];
    const rows = products.map(p => {
      const batches = p.inventory_batches || [];
      const avgBuyingPrice = batches.length
        ? (batches.reduce((s, b) => s + Number(b.buying_price), 0) / batches.length).toFixed(2)
        : "";
      return [
        p.sku, p.name, p.category || "", p.subcategory || "", p.brand || "", p.size || "", p.color || "",
        p.selling_price, p.mrp ?? "", p.tax_rate, avgBuyingPrice, p.total_stock ?? 0, p.photo_url || "",
      ];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);
      if (error) throw error;
      toast({ title: "Product deleted" });
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} product(s)?`)) return;
    try {
      const ids = Array.from(selectedIds);
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from("products")
          .update({ is_active: false })
          .in("id", batch);
        if (error) throw error;
      }
      toast({ title: `${selectedIds.size} product(s) deleted` });
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          {isOwner && (
            <>
              <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload} />
              <input type="file" ref={priceFileInputRef} accept=".csv" className="hidden" onChange={handleUpdatePricesCSV} />
              <Button variant="outline" onClick={() => priceFileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Update Prices
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Import CSV
              </Button>
              <Button variant="link" size="sm" className="text-xs px-1" onClick={() => {
                const sampleHeaders = ["sku","name","category","subcategory","brand","size","color","selling_price","mrp","tax_rate","buying_price","quantity","photo_url"];
                const sampleRow = ["SKU001","Sample Product","Shirts","Casual","BrandX","M","Blue","999","1199","5","500","10","https://example.com/image.jpg"];
                const csv = [sampleHeaders.join(","), sampleRow.join(",")].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "sample-inventory-template.csv"; a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="h-3 w-3 mr-1" /> Sample CSV
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Product</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddProduct} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>SKU *</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} required /></div>
                      <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                      <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
                      <div><Label>Brand</Label><Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} /></div>
                      <div><Label>Size</Label><Input value={form.size} onChange={e => setForm({...form, size: e.target.value})} /></div>
                      <div><Label>Color</Label><Input value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></div>
                      <div><Label>Selling Price *</Label><Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} required /></div>
                      <div><Label>MRP</Label><Input type="number" step="0.01" value={form.mrp} onChange={e => setForm({...form, mrp: e.target.value})} /></div>
                      <div><Label>Tax Rate %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={e => setForm({...form, tax_rate: e.target.value})} /></div>
                    </div>
                    <div className="border-t pt-3 space-y-3">
                      <PhotoUploader photos={newProductPhotos} onChange={setNewProductPhotos} storeId={storeId!} />
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium mb-2">Initial Stock (optional)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Buying Price</Label><Input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({...form, buying_price: e.target.value})} /></div>
                        <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
                      </div>
                    </div>
                    <Button type="submit" className="w-full">Add Product</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isOwner && selectedIds.size > 0 && (
          <Button variant="destructive" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size} selected
          </Button>
        )}
      </div>

      {csvProgress && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Importing products…</span>
            <span className="tabular-nums text-muted-foreground">
              {csvProgress.current} / {csvProgress.total}
            </span>
          </div>
          <Progress value={(csvProgress.current / csvProgress.total) * 100} className="h-2" />
        </div>
      )}

      <Card className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {isOwner && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-12"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {isOwner && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
              <TableCell colSpan={isOwner ? 9 : 7} className="text-center py-12">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No products found</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className={selectedIds.has(p.id) ? "bg-muted/50" : ""}>
                  {isOwner && (
                    <TableCell className="p-2">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={() => toggleSelect(p.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="p-1">
                    {(() => {
                      const photos = parsePhotoUrls(p.photo_url);
                      return photos.length > 0 ? (
                        <img src={photos[0]} alt={p.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                  <TableCell>
                    {p.size && <Badge variant="secondary" className="mr-1">{p.size}</Badge>}
                    {p.color && <Badge variant="outline">{p.color}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">₹{Number(p.selling_price).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.total_stock! > 0 ? "default" : "destructive"}>
                      {p.total_stock}
                    </Badge>
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditProduct(p); setEditOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProduct(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {isOwner && storeId && (
        <EditProductDialog
          product={editProduct}
          open={editOpen}
          onOpenChange={setEditOpen}
          storeId={storeId}
          onSaved={fetchProducts}
        />
      )}
    </div>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}
