import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Search, Package, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  is_active: boolean;
  total_stock?: number;
  inventory_batches?: { quantity: number; buying_price: number }[];
}

export default function Inventory() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    sku: "", name: "", category: "", brand: "", size: "", color: "",
    selling_price: "", mrp: "", tax_rate: "18", buying_price: "", quantity: "",
  });

  const fetchProducts = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("products")
      .select("*, inventory_batches(quantity)")
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
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;

    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx]; });

      try {
        const { data: product } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            sku: row.sku || `SKU-${Date.now()}-${i}`,
            name: row.name || row.product_name || "Unnamed",
            category: row.category || null,
            subcategory: row.subcategory || row.sub_category || null,
            brand: row.brand || null,
            size: row.size || null,
            color: row.color || null,
            selling_price: parseFloat(row.selling_price || row.price || "0"),
            mrp: row.mrp ? parseFloat(row.mrp) : null,
            tax_rate: parseFloat(row.tax_rate || "18"),
          })
          .select()
          .single();

        if (product && (row.buying_price || row.purchase_price || row.quantity)) {
          await supabase.from("inventory_batches").insert({
            product_id: product.id,
            store_id: storeId,
            buying_price: parseFloat(row.buying_price || row.purchase_price || "0"),
            quantity: parseInt(row.quantity || "0"),
          });
        }
        count++;
      } catch { /* skip invalid rows */ }
    }

    toast({ title: `${count} products imported` });
    fetchProducts();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadCSV = () => {
    const headers = ["SKU", "Name", "Category", "Subcategory", "Brand", "Size", "Color", "Selling Price", "MRP", "Tax Rate %", "Purchase Price", "Stock"];
    const rows = products.map(p => {
      const avgBuyingPrice = (p as any).inventory_batches?.length
        ? (p as any).inventory_batches.reduce((s: number, b: any) => s + Number(b.buying_price), 0) / (p as any).inventory_batches.length
        : "";
      return [
        p.sku, p.name, p.category || "", (p as any).subcategory || "", p.brand || "", p.size || "", p.color || "",
        p.selling_price, p.mrp ?? "", p.tax_rate, avgBuyingPrice, p.total_stock ?? 0,
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
          <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Import CSV
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
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No products found</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}
