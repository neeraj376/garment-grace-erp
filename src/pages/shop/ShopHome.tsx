import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { variantGroupKey } from "@/lib/variantUtils";
import {
  ArrowRight,
  Backpack,
  BriefcaseBusiness,
  Footprints,
  Gem,
  Glasses,
  Package,
  Shirt,
  ShoppingBag,
  Tags,
  Umbrella,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MasonryProductCard from "@/components/shop/MasonryProductCard";
import { fetchInStockShopProducts, SHOP_STORE_ID } from "@/lib/shopProducts";
import { parsePhotoUrls } from "@/lib/photoUtils";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";

// Category icons share one visual weight and footprint across the storefront.
const ICON_CLASS = "h-8 w-8";
const SVG_PROPS = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: ICON_CLASS,
};

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

type CategoryIcon = LucideIcon | (() => JSX.Element);

const CATEGORY_ICON_RULES: Array<{ words: string[]; Icon: LucideIcon }> = [
  { words: ["footwear", "shoe", "sandal", "slipper", "sneaker", "loafer", "boot"], Icon: Footprints },
  { words: ["bag", "backpack"], Icon: Backpack },
  { words: ["watch"], Icon: Watch },
  { words: ["glass", "sunglass"], Icon: Glasses },
  { words: ["jewellery", "jewelry", "accessory", "accessories"], Icon: Gem },
  { words: ["umbrella"], Icon: Umbrella },
  { words: ["blazer", "blazzer", "suit", "formal"], Icon: BriefcaseBusiness },
  { words: ["shirt", "t-shirt", "tshirt", "hoodie", "jacket", "sweater", "sweatshirt", "top"], Icon: Shirt },
];

const getCategoryIcon = (name: string): CategoryIcon => {
  const normalized = name.trim().toLowerCase();
  return CATEGORY_ICON_RULES.find(({ words }) => words.some((word) => normalized.includes(word)))?.Icon ?? ShoppingBag;
};

// Each hero category maps to an explicit list of DB `category` values (case-insensitive, exact).
// Subcategory and product name are NOT used — we strictly follow the tag from product add.
const HERO_CATEGORIES: { name: string; Icon: CategoryIcon; categories: string[] }[] = [
  { name: "Shirt", Icon: Shirt, categories: ["shirt", "shirts", "full sleeve shirt", "linen shirts", "linen shirt"] },
  { name: "Blazzer", Icon: BriefcaseBusiness, categories: ["blazzer", "blazer"] },
  { name: "Jeans", Icon: JeansIcon, categories: ["jean", "jeans"] },
  { name: "T-shirt", Icon: Shirt, categories: ["t-shirt", "t-shirts", "tshirt", "polo", "polo t-shirt", "polo t- shirt", "roundneck"] },
  { name: "Jacket", Icon: Shirt, categories: ["jacket", "windcheater"] },
  { name: "Hoodie", Icon: Shirt, categories: ["hoodie", "sweatshirt", "sweater", "zipper"] },
  { name: "Pants", Icon: TrousersIcon, categories: ["pant", "trouser", "cargo pants", "jogger", "lower", "cotton", "dry fit"] },
  { name: "Linen Pants", Icon: LinenPantsIcon, categories: ["linen pants"] },
  { name: "Shorts", Icon: ShortsIcon, categories: ["short", "shorts", "denim shorts", "cotton shorts"] },
  { name: "Underwear", Icon: UnderwearIcon, categories: ["underwear", "vest"] },
];

const MAX_FEED = 500;
const CLUBBED_KEYS = new Set([
  variantGroupKey({ name: "Ann Taylor Ladies Pants", brand: "Ann Taylor" }),
  variantGroupKey({ name: "Psycho Bunny Lower", brand: "Psycho Bunny" }),
  variantGroupKey({ name: "Rabit Lower", brand: "Psycho Bunny" }),
  variantGroupKey({ name: "Psycho Bunny Set", brand: "Psycho Bunny" }),
  variantGroupKey({ name: "Charles Formal Shirts", brand: "Charles Tyrwhitt" }),
  variantGroupKey({ name: "CK Polo T-Shirt", brand: "CK" }),
  variantGroupKey({ name: "Dickies Jeans", brand: "Dickies" }),
  variantGroupKey({ name: "Blend Denim Jeans", brand: "Blend" }),
  variantGroupKey({ name: "Armani Polo T-Shirts", brand: "ARMAANI EXCHANGE" }),
  variantGroupKey({ name: "Essentials Full-sleeve Shirts", brand: "Essentials" }),
  variantGroupKey({ name: "RC Full Sleeve T-Shirts", brand: "Roots CND" }),
  variantGroupKey({ name: "Old School Sweatshirt", brand: "Old School" }),
  variantGroupKey({ name: "Old School Polo T-Shirt", brand: "Old School" }),
  variantGroupKey({ name: "Jules Jeans", brand: "Jules" }),
  variantGroupKey({ name: "Jules Cargo", brand: "Jules" }),
  variantGroupKey({ name: "PediConfort Sandles", brand: "PediConfort" }),
]);
const FEED_STEP = 40;
const MISSING_CLEAN_PHOTO_IDS = new Set([
  "c522856e-5488-413c-9008-31a8a1ed5e81", "544fee12-c9b0-492f-8b2c-6a913c4838b4",
  "c5f65b64-76e6-43d2-802b-57b3facdefd0", "0544ed37-333e-4f8f-a47d-482525885c3b",
  "b59d4341-aeda-4c2b-8ee6-b62a579e09a1", "d3126f0a-030a-48d0-8c57-976f88ace467",
  "a5ff013d-d7a0-4450-a2db-c96e4ff33943", "34abdd1b-72a3-4bd9-898a-c517c77918eb",
  "7e81c03f-6c0a-47cd-9202-61d67bf05514", "c4a3b080-2bb1-44c6-ab59-cb8fc4182cf8",
  "9311b9c9-34bf-4d72-a2c2-8f19727ab0b3", "88b719a0-fce1-4232-be0f-de0095e1bb40",
  "93036c0c-e92e-4bea-8805-83a4d78ff100", "cc116081-142b-43a7-a1c4-148643975da9",
  "448993ed-7443-46f3-824c-3399223eedc7", "78fbbdb5-842a-4be3-bd1a-4af3750d5e3a",
  "3a96ef6c-92b5-467a-8cc1-955e060e71c2", "b7164135-652d-4782-a73b-e84130cef957",
]);

const hasUsableMedia = (product: any) => {
  const photo = String(parsePhotoUrls(product.photo_url)[0] ?? "").toLowerCase().replace(/%2f/g, "/");
  const video = String(product.video_url ?? "").toLowerCase();
  const cleanPhoto = !!photo && !photo.includes("example.com/") && !MISSING_CLEAN_PHOTO_IDS.has(product.id)
    && (photo.includes("/cleaned/") || photo.includes("-clean.") || photo.includes("-clean-"));
  return cleanPhoto || (!!video && !video.includes("example.com/"));
};

export default function ShopHome() {
  const [feed, setFeed] = useState<any[]>([]);
  const [visibleCount, setVisibleCount] = useState(FEED_STEP);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
      const withMediaAll = allInStock.filter(hasUsableMedia);

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
         Icon: getCategoryIcon(name),
        categories: [name.toLowerCase()],
        count,
      }));

      const all = [...visible, ...extraTiles].sort((a, b) => b.count - a.count);
      setSortedCategories(all);

      // Club selected product families (e.g. Ann Taylor Ladies Pants) into one card.
      const seenClub = new Set<string>();
      const clubbed = withMediaAll.filter((p: any) => {
        const k = variantGroupKey(p);
        if (!CLUBBED_KEYS.has(k)) return true;
        if (seenClub.has(k)) return false;
        seenClub.add(k);
        return true;
      });
      setFeed(clubbed.slice(0, MAX_FEED));
    };
    fetchProducts();
  }, []);

  // Infinite scroll: reveal more products as the shopper scrolls, up to MAX_FEED
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + FEED_STEP, MAX_FEED));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [feed.length]);




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
              className="group rounded-lg border border-border bg-card p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className={ICON_CLASS} strokeWidth={1.8} />
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
            {feed.slice(0, visibleCount).map((product) => (
              <MasonryProductCard
                key={product.id}
                product={product}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-10" />
          {visibleCount >= Math.min(feed.length, MAX_FEED) && (
            <div className="text-center mt-4">
              <Link to="/category/all">
                <Button variant="outline" className="rounded-full px-8 gap-2">
                  See all products <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
