import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Boxes } from "lucide-react";

interface StockItem {
  product_name: string;
  sku: string;
  category: string | null;
  total_stock: number;
  avg_buying_price: number;
  selling_price: number;
  stock_value: number;
}

export default function StockSummary() {
  const { storeId } = useStore();
  const [stock, setStock] = useState<StockItem[]>([]);

  useEffect(() => {
    if (!storeId) return;

    const fetch = async () => {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, category, selling_price, inventory_batches(buying_price, quantity)")
        .eq("store_id", storeId)
        .eq("is_active", true);

      const items: StockItem[] = (products ?? []).map((p: any) => {
        const batches = p.inventory_batches ?? [];
        const totalStock = batches.reduce((s: number, b: any) => s + b.quantity, 0);
        const totalCost = batches.reduce((s: number, b: any) => s + b.buying_price * b.quantity, 0);
        const avgBuying = totalStock > 0 ? totalCost / totalStock : 0;
        return {
          product_name: p.name,
          sku: p.sku,
          category: p.category,
          total_stock: totalStock,
          avg_buying_price: avgBuying,
          selling_price: Number(p.selling_price),
          stock_value: totalCost,
        };
      });

      setStock(items);
    };

    fetch();
  }, [storeId]);

  const totalValue = stock.reduce((s, i) => s + i.stock_value, 0);
  const totalUnits = stock.reduce((s, i) => s + i.total_stock, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Stock Summary</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalUnits} units · ₹{totalValue.toLocaleString("en-IN")} total value
        </p>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Avg. Cost</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
              <TableHead className="text-right">Stock Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stock.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Boxes className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No stock data</p>
                </TableCell>
              </TableRow>
            ) : stock.map((s, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                <TableCell className="font-medium">{s.product_name}</TableCell>
                <TableCell className="text-muted-foreground">{s.category || "—"}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={s.total_stock > 0 ? "default" : "destructive"}>{s.total_stock}</Badge>
                </TableCell>
                <TableCell className="text-right">₹{s.avg_buying_price.toFixed(2)}</TableCell>
                <TableCell className="text-right">₹{s.selling_price.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right font-medium">₹{s.stock_value.toLocaleString("en-IN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
