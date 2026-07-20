import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface BrandData {
  brand: string;
  skuCount: number;
  stock: number;
}

export default function BrandWiseJeansReport() {
  const { storeId } = useStore();
  const [data, setData] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    fetchData();
  }, [storeId]);

  const fetchData = async () => {
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("products")
      .select("id, brand, category, subcategory, inventory_batches(quantity)")
      .eq("store_id", storeId!)
      .eq("is_active", true)
      .or("category.ilike.%jean%,category.ilike.%jeans%,subcategory.ilike.%jean%,subcategory.ilike.%jeans%");

    if (error) {
      console.error("Failed to fetch jeans stock", error);
      setData([]);
      setLoading(false);
      return;
    }

    const brandMap: Record<string, { skuCount: number; stock: number }> = {};
    (rows ?? []).forEach((p: any) => {
      const brand = (p.brand || "No Brand").trim();
      const stock = (p.inventory_batches || []).reduce((s: number, b: any) => s + (b.quantity || 0), 0);
      if (stock <= 0) return;
      if (!brandMap[brand]) brandMap[brand] = { skuCount: 0, stock: 0 };
      brandMap[brand].skuCount += 1;
      brandMap[brand].stock += stock;
    });

    const result = Object.entries(brandMap)
      .map(([brand, { skuCount, stock }]) => ({ brand, skuCount, stock }))
      .sort((a, b) => b.stock - a.stock);

    setData(result);
    setLoading(false);
  };

  const chartData = useMemo(() => data.map(d => ({ name: d.brand, stock: d.stock, skus: d.skuCount })), [data]);

  const totalStock = useMemo(() => data.reduce((s, d) => s + d.stock, 0), [data]);
  const totalSkus = useMemo(() => data.reduce((s, d) => s + d.skuCount, 0), [data]);

  const downloadCsv = () => {
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Brand", "SKU Count", "Stock (Pcs)"];
    const rows = data.map(d => [d.brand, d.skuCount, d.stock]);
    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Brand_Wise_Jeans_Stock_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Loading brand-wise jeans stock...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          Showing brands under Jean / Jeans category
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Brands</p>
            <p className="text-2xl font-bold font-display">{data.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total SKUs</p>
            <p className="text-2xl font-bold font-display">{totalSkus.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Stock</p>
            <p className="text-2xl font-bold font-display">{totalStock.toLocaleString("en-IN")} pcs</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="section-title flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Brand-wise Jeans Stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                  <XAxis
                    dataKey="name"
                    fontSize={11}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fill: "hsl(220, 9%, 46%)" }}
                  />
                  <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [value.toLocaleString("en-IN"), name === "stock" ? "Stock (Pcs)" : "SKUs"]}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="stock" name="Stock (Pcs)" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              No Jean/Jeans stock data found
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="section-title">Brand-wise Details</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">SKU Count</TableHead>
                  <TableHead className="text-right">Stock (Pcs)</TableHead>
                  <TableHead className="text-right">% of Total Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(d => (
                  <TableRow key={d.brand}>
                    <TableCell className="font-medium">{d.brand}</TableCell>
                    <TableCell className="text-right">{d.skuCount.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right font-semibold">{d.stock.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {totalStock > 0 ? ((d.stock / totalStock) * 100).toFixed(1) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalSkus.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">{totalStock.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              No Jean/Jeans stock data found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
