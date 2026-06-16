import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Shirt, Package, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import MasonryProductCard from "@/components/shop/MasonryProductCard";
import { groupVariants } from "@/lib/variantUtils";
import { fetchInStockShopProducts, SHOP_STORE_ID } from "@/lib/shopProducts";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";

// Refined garment category icons — clean, recognizable, consistent stroke
const ICON_CLASS = "w-9 h-9 mx-auto";
const SVG_PROPS = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: ICON_CLASS,
};

const ShirtIcon2 = () => (
  <svg {...SVG_PROPS}>
    {/* collar */}
    <path d="M26 8l6 6 6-6" />
    {/* body with shoulders & sleeves */}
    <path d="M26 8l-14 6 4 10 6-2v28h24V22l6 2 4-10-14-6" />
    {/* button placket */}
    <path d="M32 16v30" />
  </svg>
);

const BlazerIcon = () => (
  <svg {...SVG_PROPS}>
    {/* lapels meeting at V */}
    <path d="M22 8l10 12 10-12" />
    {/* jacket body & sleeves */}
    <path d="M22 8l-12 8 4 12 6-2v28h24V26l6 2 4-12-12-8" />
    {/* center seam */}
    <path d="M32 20v36" />
    {/* pocket */}
    <path d="M40 40h6" />
  </svg>
);

const TshirtIcon = () => (
  <svg {...SVG_PROPS}>
    <path d="M24 8h16l12 6-4 10-8-2v34H24V22l-8 2-4-10z" />
    {/* neckline */}
    <path d="M24 8c2 4 14 4 16 0" />
  </svg>
);

const HoodieIcon = () => (
  <svg {...SVG_PROPS}>
    {/* hood */}
    <path d="M22 12c0 6 4 10 10 10s10-4 10-10" />
    {/* body & sleeves */}
    <path d="M22 12l-10 6 4 12 6-2v28h20V28l6 2 4-12-10-6" />
    {/* kangaroo pocket */}
    <path d="M22 38l10 6 10-6" />
    {/* drawstring */}
    <path d="M30 22v6M34 22v6" />
  </svg>
);

const JacketIcon = () => (
  <svg {...SVG_PROPS}>
    {/* collar */}
    <path d="M24 10l8 6 8-6" />
    {/* body & sleeves */}
    <path d="M24 10l-12 6 4 12 6-2v30h20V26l6 2 4-12-12-6" />
    {/* zipper */}
    <path d="M32 16v40" />
    {/* zipper teeth */}
    <path d="M30 24h4M30 32h4M30 40h4M30 48h4" />
  </svg>
);

const JeansIcon = () => (
  <svg {...SVG_PROPS}>
    {/* waistband */}
    <path d="M14 8h36v6H14z" />
    {/* legs */}
    <path d="M14 14l4 42h12l2-26 2 26h12l4-42" />
    {/* center crotch */}
    <path d="M32 14v16" />
    {/* belt loops */}
    <path d="M22 8v6M32 8v6M42 8v6" />
  </svg>
);

const TrousersIcon = () => (
  <svg {...SVG_PROPS}>
    {/* waistband */}
    <path d="M14 8h36v5H14z" />
    {/* tapered legs */}
    <path d="M14 13l3 43h11l2-28 2 28h11l3-43" />
    {/* center crease left leg */}
    <path d="M22 16v36" />
    {/* center crease right leg */}
    <path d="M42 16v36" />
  </svg>
);

const LinenPantsIcon = () => (
  <svg {...SVG_PROPS}>
    {/* waistband */}
    <path d="M14 8h36v5H14z" />
    {/* relaxed straight legs */}
    <path d="M14 13l2 42h12l2-28 2 28h12l2-42" />
    {/* soft vertical folds */}
    <path d="M24 16v36M40 16v36" />
  </svg>
);

const ShortsIcon = () => (
  <svg {...SVG_PROPS}>
    {/* waistband */}
    <path d="M12 10h40v6H12z" />
    {/* short legs */}
    <path d="M12 16l4 24h12l4-16 4 16h12l4-24" />
    {/* center seam */}
    <path d="M32 16v12" />
  </svg>
);

const UnderwearIcon = () => (
  <svg {...SVG_PROPS}>
    {/* waistband + brief shape */}
    <path d="M8 18h48l-4 14c-6 0-12 2-14 10-2-6-4-8-6-8s-4 2-6 8c-2-8-8-10-14-10z" />
    {/* waistband line */}
    <path d="M8 22h48" />
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
        Icon: (() => <Package className="w-9 h-9 mx-auto" strokeWidth={2.2} />) as () => JSX.Element,
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
