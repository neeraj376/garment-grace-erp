import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Shirt, Package, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import MasonryProductCard from "@/components/shop/MasonryProductCard";
import { groupVariants } from "@/lib/variantUtils";
import { fetchInStockShopProducts, SHOP_STORE_ID } from "@/lib/shopProducts";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";

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
    {/* waistband */}
    <path d="M5 4h14v3H5z" />
    {/* left leg */}
    <path d="M5 7l1 14h4l1-14" />
    {/* right leg */}
    <path d="M19 7l-1 14h-4l-1-14" />
  </svg>
);
const ShortsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    {/* waistband */}
    <path d="M5 5h14v3H5z" />
    {/* left leg (short) */}
    <path d="M5 8l1 8h4l1-8" />
    {/* right leg (short) */}
    <path d="M19 8l-1 8h-4l-1-8" />
  </svg>
);

const ShirtIcon2 = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M4 6l4-3 2 2h4l2-2 4 3-2 3-2-1v13H8V8L6 9 4 6z" />
    <path d="M10 5l2 2 2-2" />
  </svg>
);
const BlazerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M5 5l3-2 4 5 4-5 3 2-2 4v12H7V9L5 5z" />
    <path d="M12 8v13" />
    <path d="M9 14h2" />
  </svg>
);
const UnderwearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto">
    <path d="M3 7h18l-1 4c-2 0-4 1-5 4-1-2-2-3-3-3s-2 1-3 3c-1-3-3-4-5-4L3 7z" />
  </svg>
);

// Each hero category maps to an explicit list of DB `category` values (case-insensitive, exact).
// Subcategory and product name are NOT used — we strictly follow the tag from product add.
const HERO_CATEGORIES: { name: string; Icon: () => JSX.Element; categories: string[] }[] = [
  { name: "Shirt", Icon: ShirtIcon2, categories: ["shirt", "shirts", "full sleeve shirt", "linen shirts", "linen shirt"] },
  { name: "Blazzer", Icon: BlazerIcon, categories: ["blazzer", "blazer"] },
  { name: "Jeans", Icon: JeansIcon, categories: ["jean", "jeans"] },
  { name: "T-shirt", Icon: TshirtIcon, categories: ["t-shirt", "t-shirts", "tshirt", "polo", "polo t-shirt", "polo t- shirt", "roundneck"] },
  { name: "Jacket", Icon: JacketIcon, categories: ["jacket", "windcheater"] },
  { name: "Hoodie", Icon: HoodieIcon, categories: ["hoodie", "sweatshirt", "sweater", "zipper"] },
  { name: "Pants", Icon: TrousersIcon, categories: ["pant", "trouser", "cargo pants", "linen pants", "jogger", "lower", "cotton", "dry fit"] },
  { name: "Shorts", Icon: ShortsIcon, categories: ["short", "shorts", "denim shorts", "cotton shorts"] },
  { name: "Underwear", Icon: UnderwearIcon, categories: ["underwear", "vest"] },
];

export default function ShopHome() {
  const [feed, setFeed] = useState<any[]>([]);
  const [sortedCategories, setSortedCategories] = useState<typeof HERO_CATEGORIES>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);

  useEffect(() => {
    supabase
      .from("home_banners")
      .select("*")
      .eq("store_id", SHOP_STORE_ID)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setBanners(data ?? []));
  }, []);

  useEffect(() => {
    if (!carouselApi || banners.length < 2) return;
    const t = setInterval(() => carouselApi.scrollNext(), 5000);
    return () => clearInterval(t);
  }, [carouselApi, banners.length]);

  useEffect(() => {
    const fetchProducts = async () => {
      const allInStock = await fetchInStockShopProducts();
      const withMediaAll = allInStock.filter((p: any) => p.photo_url || p.video_url);

      const counts = HERO_CATEGORIES.map((cat) => {
        const count = withMediaAll.filter((p: any) => {
          const c = (p.category ?? "").trim().toLowerCase();
          return cat.categories.includes(c);
        }).length;
        return { ...cat, count };
      });
      const visible = counts.filter((c) => c.count > 0);

      const covered = new Set(HERO_CATEGORIES.flatMap((c) => c.categories));
      const extras: Record<string, number> = {};
      withMediaAll.forEach((p: any) => {
        const raw = (p.category ?? "").trim();
        if (!raw) return;
        if (covered.has(raw.toLowerCase())) return;
        const name = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        extras[name] = (extras[name] ?? 0) + 1;
      });
      const extraTiles = Object.entries(extras).map(([name, count]) => ({
        name,
        Icon: (() => <Package className="w-8 h-8 mx-auto" strokeWidth={1.6} />) as () => JSX.Element,
        categories: [name.toLowerCase()],
        count,
      }));

      const all = [...visible, ...extraTiles].sort((a, b) => b.count - a.count);
      setSortedCategories(all);

      const grouped = groupVariants(withMediaAll);
      setFeed(grouped.filter((g) => g.primary.photo_url || g.primary.video_url).slice(0, 60));
    };
    fetchProducts();
  }, []);




  return (
    <div>
      {/* Hero */}
      {banners.length > 0 ? (
        <section className="relative overflow-hidden bg-foreground">
          <Carousel
            setApi={setCarouselApi}
            opts={{ loop: true, align: "start" }}
            className="w-full"
          >
            <CarouselContent>
              {banners.map((b) => (
                <CarouselItem key={b.id}>
                  <div className="relative w-full aspect-[16/9] md:aspect-[21/9] max-h-[300px]">
                    <img
                      src={b.image_url}
                      alt={b.headline ?? "Banner"}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                    <div className="relative z-10 container mx-auto h-full flex items-center px-4 md:px-8">
                      <div className="max-w-xl text-background">
                        {b.headline && (
                          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-3 drop-shadow">
                            {b.headline}
                          </h1>
                        )}
                        {b.subheadline && (
                          <p className="text-base md:text-lg text-background/85 mb-6 drop-shadow">
                            {b.subheadline}
                          </p>
                        )}
                        <Link to={`/product/${b.product_id}`}>
                          <Button size="lg" className="rounded-full px-8 gap-2">
                            View Details <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {banners.length > 1 && (
              <>
                <CarouselPrevious className="left-4 hidden md:flex" />
                <CarouselNext className="right-4 hidden md:flex" />
              </>
            )}
          </Carousel>
        </section>
      ) : (
        <section className="relative bg-foreground text-background overflow-hidden">
          <div className="container mx-auto px-4 py-10 md:py-14 text-center">
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
      )}

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

      {/* Poshmark-style masonry feed */}
      {feed.length > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold">Just In</h2>
            <Link to="/category/all" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3">
            {feed.map((g) => (
              <MasonryProductCard
                key={g.key}
                product={g.primary}
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
