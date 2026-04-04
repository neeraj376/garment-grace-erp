import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SizeBreakdown {
  size: string;
  quantity: number;
}

interface CategoryBreakdown {
  category: string;
  totalQuantity: number;
  sizes: SizeBreakdown[];
}

export default function CategorySizeReport() {
  const { storeId } = useStore();
  const [data, setData] = useState<CategoryBreakdown[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    fetchData();
  }, [storeId]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch all active products with their stock
    const { data: products } = await supabase
      .from("products")
      .select("id, category, size")
      .eq("store_id", storeId!)
      .eq("is_active", true);

    if (!products || products.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    const productIds = products.map(p => p.id);

    // Fetch stock for all products - handle large arrays by chunking
    const chunkSize = 500;
    const stockMap: Record<string, number> = {};
    for (let i = 0; i < productIds.length; i += chunkSize) {
      const chunk = productIds.slice(i, i + chunkSize);
      const { data: batches } = await supabase
        .from("inventory_batches")
        .select("product_id, quantity")
        .in("product_id", chunk);
      (batches ?? []).forEach(b => {
        stockMap[b.product_id] = (stockMap[b.product_id] || 0) + b.quantity;
      });
    }

    // Group by category -> size
    const catMap: Record<string, Record<string, number>> = {};
    products.forEach(p => {
      const cat = p.category || "Uncategorized";
      const size = p.size || "N/A";
      const qty = stockMap[p.id] || 0;
      if (!catMap[cat]) catMap[cat] = {};
      catMap[cat][size] = (catMap[cat][size] || 0) + qty;
    });

    const result: CategoryBreakdown[] = Object.entries(catMap)
      .map(([category, sizes]) => ({
        category,
        totalQuantity: Object.values(sizes).reduce((a, b) => a + b, 0),
        sizes: Object.entries(sizes)
          .map(([size, quantity]) => ({ size, quantity }))
          .sort((a, b) => b.quantity - a.quantity),
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    setData(result);
    setLoading(false);
  };

  const toggleExpand = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const grandTotal = data.reduce((s, c) => s + c.totalQuantity, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="section-title flex items-center gap-2">
          <Package className="h-5 w-5" /> Category & Size Breakdown
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            Total: {grandTotal.toLocaleString("en-IN")} pcs
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            No inventory data found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Category / Size</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(cat => (
                <>
                  <TableRow
                    key={cat.category}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(cat.category)}
                  >
                    <TableCell className="w-10">
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {expanded.has(cat.category) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-semibold">{cat.category}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {cat.totalQuantity.toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                  {expanded.has(cat.category) &&
                    cat.sizes.map(s => (
                      <TableRow key={`${cat.category}-${s.size}`} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="pl-12 text-muted-foreground">{s.size}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {s.quantity.toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    ))}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
