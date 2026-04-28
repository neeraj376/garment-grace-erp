import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/shop/ProductCard";
import { groupVariants } from "@/lib/variantUtils";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

const HERO_CATEGORIES = [
  { name: "Jeans", image: "👖" },
  { name: "T-shirt", image: "👕" },
  { name: "Jacket", image: "🧥" },
  { name: "Hoodie", image: "🪭" },
  { name: "Trousers", image: "🩳" },
  { name: "Shorts", image: "🩲" },
];

export default function ShopHome() {
  const [featured, setFeatured] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data: featuredData } = await supabase.rpc("get_in_stock_shop_products", {
        p_store_id: STORE_ID,
        p_limit: 50,
      });
      const allProducts = (featuredData ?? []).filter((p: any) => p.photo_url || p.video_url);
      const grouped = groupVariants(allProducts);
      setFeatured(grouped.filter((g) => g.primary.photo_url).slice(0, 8));
      setNewArrivals(grouped.slice(0, 8));
    };
    fetchProducts();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-foreground text-background overflow-hidden">
        <div className="container mx-auto px-4 py-20 md:py-28 text-center">
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Elevate Your Style
          </h1>
          <p className="text-background/70 text-lg md:text-xl max-w-xl mx-auto mb-8">
            Premium menswear crafted for comfort and confidence. Discover the latest collection.
          </p>
          <Link to="/category/all">
            <Button size="lg" className="rounded-full px-8 gap-2">
              Shop Now <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="font-display text-2xl font-bold mb-6">Shop by Category</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {HERO_CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              to={`/category/${encodeURIComponent(cat.name)}`}
              className="bg-card rounded-xl border border-border p-4 text-center hover:shadow-md transition-shadow group"
            >
              <div className="text-3xl mb-2">{cat.image}</div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold">Featured Products</h2>
            <Link to="/category/all" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {featured.map((g) => (
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
        </section>
      )}

      {/* New Arrivals */}
      {newArrivals.length > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold">New Arrivals</h2>
            <Link to="/category/all" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {newArrivals.map((g) => (
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
        </section>
      )}
    </div>
  );
}
