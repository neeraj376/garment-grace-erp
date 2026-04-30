import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Shirt, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/shop/ProductCard";
import { groupVariants } from "@/lib/variantUtils";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

// SVG icons for garment categories (clearer than emoji)
const JeansIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M5 3h14l-1 18h-5l-1-10-1 10H6L5 3z" />
    <path d="M5 3h14" />
  </svg>
);
const TshirtIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M4 7l4-4h8l4 4-3 3-2-2v13H6V8L4 10 4 7z" />
  </svg>
);
const JacketIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M4 7l4-4 4 3 4-3 4 4-3 3v11H7V10L4 7z" />
    <path d="M12 6v15" />
  </svg>
);
const HoodieIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M8 3c-1 2-1 4 0 5-2 0-4 1-5 4l3 2v7h12v-7l3-2c-1-3-3-4-5-4 1-1 1-3 0-5" />
    <path d="M9 8c1 2 5 2 6 0" />
    <path d="M12 13v4" />
  </svg>
);
const TrousersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M5 3h14v4l-2 14h-4l-1-11-1 11H7L5 7V3z" />
  </svg>
);
const ShortsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M5 4h14v4l-1 8h-5l-1-7-1 7H6L5 8V4z" />
    <path d="M5 8h14" />
  </svg>
);

const HERO_CATEGORIES: { name: string; Icon: () => JSX.Element; matchers: string[] }[] = [
  { name: "Jeans", Icon: JeansIcon, matchers: ["jean"] },
  { name: "T-shirt", Icon: TshirtIcon, matchers: ["t-shirt", "tshirt", "t shirt", "tee"] },
  { name: "Jacket", Icon: JacketIcon, matchers: ["jacket"] },
  { name: "Hoodie", Icon: HoodieIcon, matchers: ["hoodie", "sweatshirt"] },
  { name: "Trousers", Icon: TrousersIcon, matchers: ["trouser", "pant", "chino"] },
  { name: "Shorts", Icon: ShortsIcon, matchers: ["short"] },
];

export default function ShopHome() {
  const [featured, setFeatured] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]);
  const [sortedCategories, setSortedCategories] = useState(HERO_CATEGORIES);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data: featuredData } = await supabase.rpc("get_in_stock_shop_products", {
        p_store_id: STORE_ID,
        p_limit: 5000,
      });
      const allInStock = featuredData ?? [];

      // Count in-stock products per hero category
      const counts = HERO_CATEGORIES.map((cat) => {
        const count = allInStock.filter((p: any) => {
          const hay = `${p.category ?? ""} ${p.subcategory ?? ""} ${p.name ?? ""}`.toLowerCase();
          return cat.matchers.some((m) => hay.includes(m));
        }).length;
        return { ...cat, count };
      });
      counts.sort((a, b) => b.count - a.count);
      setSortedCategories(counts);

      const withMedia = allInStock.filter((p: any) => p.photo_url || p.video_url);
      const grouped = groupVariants(withMedia);
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
          {sortedCategories.map(({ name, Icon }) => (
            <Link
              key={name}
              to={`/category/${encodeURIComponent(name)}`}
              className="bg-card rounded-xl border border-border p-4 text-center hover:shadow-md transition-shadow group"
            >
              <div className="mb-2 text-foreground/80 group-hover:text-primary transition-colors">
                <Icon />
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {name}
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
