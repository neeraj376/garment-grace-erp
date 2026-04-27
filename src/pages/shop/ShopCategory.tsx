import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import ProductCard from "@/components/shop/ProductCard";
import { groupVariants } from "@/lib/variantUtils";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

export default function ShopCategory() {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedCategory, setSelectedCategory] = useState(slug === "all" ? "all" : slug ?? "all");

  useEffect(() => {
    setSelectedCategory(slug === "all" ? "all" : slug ?? "all");
  }, [slug]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const { data } = await supabase.rpc("get_in_stock_shop_products", {
        p_store_id: STORE_ID,
        p_category: selectedCategory === "all" ? null : selectedCategory,
        p_limit: 5000,
      });
      setProducts((data ?? []).filter((p: any) => p.photo_url || p.video_url));
      setLoading(false);

      // Fetch categories from all in-stock products
      const { data: allData } = await supabase.rpc("get_in_stock_shop_products", {
        p_store_id: STORE_ID,
        p_limit: 5000,
      });
      const unique = [...new Set((allData ?? []).map((d: any) => d.category).filter(Boolean))].sort() as string[];
      setCategories(unique);
    };
    fetchProducts();
  }, [selectedCategory]);

  const filtered = useMemo(() => {
    let result = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }
    let groups = groupVariants(result);
    if (sortBy === "price_low") groups = [...groups].sort((a, b) => a.minPrice - b.minPrice);
    else if (sortBy === "price_high") groups = [...groups].sort((a, b) => b.maxPrice - a.maxPrice);
    else if (sortBy === "name") groups = [...groups].sort((a, b) => a.primary.name.localeCompare(b.primary.name));
    return groups;
  }, [products, search, sortBy]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">
        {selectedCategory === "all" ? "All Products" : selectedCategory}
      </h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading products...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">No products found.</div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{filtered.length} products</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((g) => (
              <ProductCard
                key={g.key}
                product={g.primary}
                colors={g.colors}
                sizes={g.sizes}
                minPrice={g.minPrice}
                maxPrice={g.maxPrice}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
