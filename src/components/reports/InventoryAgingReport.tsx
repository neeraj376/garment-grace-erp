import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ArrowUpDown, Package } from "lucide-react";

interface AgingProduct {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  sellingPrice: number;
  buyingPrice: number;
  stock: number;
  ageDays: number;
  oldestBatchDate: string;
}

type SortField = "age" | "stock" | "sellingPrice" | "buyingPrice";
type SortDir = "asc" | "desc";

export default function InventoryAgingReport() {
  const { storeId } = useStore();
  const [products, setProducts] = useState<AgingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");

  useEffect(() => {
    if (!storeId) return;
    fetchData();
  }, [storeId]);

  const fetchData = async () => {
    setLoading(true);

    const [{ data: prods }, { data: batches }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, category, brand, selling_price, buying_price")
        .eq("store_id", storeId!)
        .eq("is_active", true),
      supabase
        .from("inventory_batches")
        .select("product_id, quantity, received_at")
        .eq("store_id", storeId!),
    ]);

    const now = Date.now();
    const batchMap: Record<string, { stock: number; oldest: string }> = {};
    (batches ?? []).forEach((b: any) => {
      if (b.quantity <= 0) return;
      if (!batchMap[b.product_id]) {
        batchMap[b.product_id] = { stock: 0, oldest: b.received_at };
      }
      batchMap[b.product_id].stock += b.quantity;
      if (new Date(b.received_at) < new Date(batchMap[b.product_id].oldest)) {
        batchMap[b.product_id].oldest = b.received_at;
      }
    });

    const result: AgingProduct[] = (prods ?? [])
      .filter((p: any) => batchMap[p.id])
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        brand: p.brand,
        sellingPrice: Number(p.selling_price),
        buyingPrice: Number(p.buying_price) || 0,
        stock: batchMap[p.id].stock,
        ageDays: Math.floor((now - new Date(batchMap[p.id].oldest).getTime()) / 86400000),
        oldestBatchDate: batchMap[p.id].oldest,
      }));

    setProducts(result);
    setLoading(false);
  };

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set(products.map((p) => p.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (filterCategory !== "all") list = list.filter((p) => p.category === filterCategory);
    if (filterBrand !== "all") list = list.filter((p) => p.brand === filterBrand);

    list.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [products, filterCategory, filterBrand, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const getAgeBadge = (days: number) => {
    if (days <= 30) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">≤30d</Badge>;
    if (days <= 90) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">31-90d</Badge>;
    if (days <= 180) return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">91-180d</Badge>;
    return <Badge variant="destructive">&gt;180d</Badge>;
  };

  const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const downloadCsv = () => {
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Product", "SKU", "Category", "Brand", "Stock", "Selling Price", "Buying Price", "Age (Days)", "Oldest Batch"];
    const rows = filtered.map((p) => [
      p.name, p.sku, p.category || "", p.brand || "", p.stock, p.sellingPrice, p.buyingPrice, p.ageDays,
      new Date(p.oldestBatchDate).toLocaleDateString("en-IN"),
    ]);
    const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Inventory_Aging_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Loading inventory data...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Brands" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total SKUs</p>
            <p className="text-2xl font-bold font-display">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Stock</p>
            <p className="text-2xl font-bold font-display">{filtered.reduce((s, p) => s + p.stock, 0).toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Stock Value (Cost)</p>
            <p className="text-2xl font-bold font-display">{formatCurrency(filtered.reduce((s, p) => s + p.buyingPrice * p.stock, 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Avg Age</p>
            <p className="text-2xl font-bold font-display">
              {filtered.length ? Math.round(filtered.reduce((s, p) => s + p.ageDays, 0) / filtered.length) : 0} days
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("stock")}>
                    <span className="flex items-center gap-1">Stock <ArrowUpDown className="h-3 w-3" />{sortIcon("stock")}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sellingPrice")}>
                    <span className="flex items-center gap-1">Selling Price <ArrowUpDown className="h-3 w-3" />{sortIcon("sellingPrice")}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("buyingPrice")}>
                    <span className="flex items-center gap-1">Buying Price <ArrowUpDown className="h-3 w-3" />{sortIcon("buyingPrice")}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("age")}>
                    <span className="flex items-center gap-1">Age <ArrowUpDown className="h-3 w-3" />{sortIcon("age")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{p.sku}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.brand || "—"}</TableCell>
                    <TableCell className="font-medium">{p.stock}</TableCell>
                    <TableCell>{formatCurrency(p.sellingPrice)}</TableCell>
                    <TableCell>{formatCurrency(p.buyingPrice)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getAgeBadge(p.ageDays)}
                        <span className="text-sm">{p.ageDays}d</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              <Package className="h-6 w-6 mr-2" /> No inventory data found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
