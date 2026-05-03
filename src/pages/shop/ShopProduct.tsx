import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ArrowLeft, Minus, Plus, MessageCircle } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";
import { parsePhotoUrls } from "@/lib/photoUtils";
import { colorToHex, sortSizes } from "@/lib/variantUtils";

export default function ShopProduct() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [activeMedia, setActiveMedia] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const { addToCart } = useCart();

  // Fetch the product, then fetch all sibling variants (same name + brand).
  useEffect(() => {
    if (!id) return;
    const fetchAll = async () => {
      setLoading(true);
      const { data: base } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!base) {
        setProduct(null);
        setLoading(false);
        return;
      }
      setProduct(base);
      setSelectedColor(base.color ?? null);
      setSelectedSize(base.size ?? null);
      setActiveMedia(0);

      // Fetch siblings: same store + active, then match by trimmed/lowercased
      // name (and brand when present). This is tolerant of stray whitespace
      // or casing differences from manual data entry / CSV imports.
      const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
      const baseName = norm(base.name);
      const baseBrand = norm(base.brand);
      const { data: allActive } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", base.store_id)
        .eq("is_active", true);
      const sibs = (allActive ?? []).filter(
        (p) => norm(p.name) === baseName && norm(p.brand) === baseBrand
      );
      const list = sibs.length ? sibs : [base];
      setSiblings(list);

      // Stock for each sibling.
      const stocks: Record<string, number> = {};
      await Promise.all(
        list.map(async (s) => {
          const { data: st } = await supabase.rpc("get_product_stock", { p_product_id: s.id });
          stocks[s.id] = st ?? 0;
        })
      );
      setStockMap(stocks);
      setLoading(false);
    };
    fetchAll();
  }, [id]);

  // Available colors and sizes across the variant group.
  const allColors = useMemo(
    () => Array.from(new Set(siblings.map((s) => s.color).filter(Boolean))) as string[],
    [siblings]
  );
  const allSizes = useMemo(
    () => sortSizes(Array.from(new Set(siblings.map((s) => s.size).filter(Boolean))) as string[]),
    [siblings]
  );

  // Find the variant matching the current color+size selection.
  const matchedVariant = useMemo(() => {
    if (!siblings.length) return product;
    const exact = siblings.find(
      (s) =>
        (allColors.length === 0 || s.color === selectedColor) &&
        (allSizes.length === 0 || s.size === selectedSize)
    );
    if (exact) return exact;
    // Fallback: match color only.
    if (allColors.length > 0 && selectedColor) {
      const byColor = siblings.find((s) => s.color === selectedColor);
      if (byColor) return byColor;
    }
    return product;
  }, [siblings, selectedColor, selectedSize, product, allColors.length, allSizes.length]);

  // Sync displayed product to matched variant (so price/photos/stock follow selection).
  useEffect(() => {
    if (matchedVariant && matchedVariant.id !== product?.id) {
      setProduct(matchedVariant);
      setActiveMedia(0);
    }
  }, [matchedVariant, product?.id]);

  // Stock helpers per color and (color, size).
  const colorHasStock = (color: string) =>
    siblings.some((s) => s.color === color && (stockMap[s.id] ?? 0) > 0);
  const sizeHasStockForColor = (size: string) =>
    siblings.some(
      (s) =>
        s.size === size &&
        (allColors.length === 0 || s.color === selectedColor) &&
        (stockMap[s.id] ?? 0) > 0
    );
  // Independent of color — used by the top size strip so that picking a size
  // never gets blocked because the currently-selected color isn't made in it.
  const sizeHasAnyStock = (size: string) =>
    siblings.some((s) => s.size === size && (stockMap[s.id] ?? 0) > 0);

  // When a size is picked from the top strip, switch the selected color to one
  // that actually exists in that size (preferring in-stock and current color).
  const handleSelectSizeTop = (size: string) => {
    setSelectedSize(size);
    const sameColor = siblings.find(
      (s) => s.size === size && s.color === selectedColor
    );
    if (sameColor && (stockMap[sameColor.id] ?? 0) > 0) return;
    const inStock = siblings.find(
      (s) => s.size === size && (stockMap[s.id] ?? 0) > 0
    );
    const pick = inStock ?? siblings.find((s) => s.size === size);
    if (pick && pick.color) setSelectedColor(pick.color);
  };

  const currentStock = product ? (stockMap[product.id] ?? 0) : 0;
  const outOfStock = currentStock <= 0;

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product.id, qty);
    toast.success("Added to cart!");
  };

  const photos = useMemo(() => parsePhotoUrls(product?.photo_url ?? null), [product]);
  const mediaItems: { type: "image" | "video"; url: string }[] = useMemo(() => {
    const items: { type: "image" | "video"; url: string }[] = photos.map((url) => ({ type: "image", url }));
    if (product?.video_url) items.push({ type: "video", url: product.video_url });
    return items;
  }, [photos, product]);

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>;
  }

  if (!product) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Product not found.</div>;
  }

  const discount = product.mrp && product.mrp > product.selling_price
    ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
    : 0;

  const current = mediaItems[activeMedia];

  return (
    <div className="container mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Top size strip — pick a size to load its video */}
      {allSizes.length > 0 && (
        <div className="mb-5 p-3 rounded-xl border border-border bg-card">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Select size {selectedSize ? <span className="text-foreground normal-case">· {selectedSize}</span> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {allSizes.map((s) => {
              const inStock = sizeHasStockForColor(s);
              const isSelected = selectedSize === s;
              return (
                <button
                  key={`top-${s}`}
                  onClick={() => setSelectedSize(s)}
                  disabled={!inStock}
                  className={`min-w-[44px] h-10 px-3 rounded-lg border text-sm font-medium transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-foreground/40"
                  } ${!inStock ? "opacity-40 line-through cursor-not-allowed" : ""}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Media */}
        <div className="space-y-3">
          <div className="aspect-[3/4] bg-muted rounded-xl overflow-hidden">
            {current ? (
              current.type === "image" ? (
                <img src={current.url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <video src={current.url} controls playsInline className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl text-muted-foreground">👕</div>
            )}
          </div>
          {mediaItems.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {mediaItems.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMedia(i)}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    i === activeMedia ? "border-primary" : "border-border"
                  }`}
                >
                  {m.type === "image" ? (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={m.url} muted className="w-full h-full object-cover" />
                  )}
                  {m.type === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs font-bold">▶</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.brand && (
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-1">{product.brand}</p>
          )}
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">{product.name}</h1>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-foreground">₹{product.selling_price.toLocaleString()}</span>
            {product.mrp && product.mrp > product.selling_price && (
              <>
                <span className="text-lg text-muted-foreground line-through">₹{product.mrp.toLocaleString()}</span>
                <Badge className="bg-success text-success-foreground">{discount}% OFF</Badge>
              </>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-1">Tax: {product.tax_rate}% GST included</p>

          {/* Color selector */}
          {allColors.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-foreground mb-2">
                Color: <span className="text-muted-foreground font-normal">{selectedColor}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {allColors.map((c) => {
                  const hex = colorToHex(c);
                  const inStock = colorHasStock(c);
                  const isSelected = selectedColor === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      title={c}
                      className={`relative w-9 h-9 rounded-full border-2 transition-all ${
                        isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/40"
                      } ${!inStock ? "opacity-40" : ""}`}
                      style={{ backgroundColor: hex ?? "hsl(var(--muted))" }}
                    >
                      {!hex && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-foreground">
                          {c.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size selector */}
          {allSizes.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-medium text-foreground mb-2">
                Size: <span className="text-muted-foreground font-normal">{selectedSize ?? "Select"}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {allSizes.map((s) => {
                  const inStock = sizeHasStockForColor(s);
                  const isSelected = selectedSize === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedSize(s)}
                      disabled={!inStock}
                      className={`min-w-[44px] h-10 px-3 rounded-lg border text-sm font-medium transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-foreground/40"
                      } ${!inStock ? "opacity-40 line-through cursor-not-allowed" : ""}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-border my-5 pt-4 space-y-3">
            {product.category && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">Category</span>
                <span className="text-foreground font-medium">{product.category}</span>
              </div>
            )}
            {product.material && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">Material</span>
                <span className="text-foreground font-medium">{product.material}</span>
              </div>
            )}
            {product.sku && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">SKU</span>
                <span className="text-foreground font-medium">{product.sku}</span>
              </div>
            )}
          </div>

          {/* Qty + Add to cart */}
          {outOfStock ? (
            <div className="mt-6">
              <Badge variant="destructive" className="text-sm px-4 py-2">Out of Stock</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center border border-border rounded-lg">
                <button className="p-2 hover:bg-muted transition-colors" onClick={() => setQty(Math.max(1, qty - 1))}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-4 text-sm font-medium">{qty}</span>
                <button className="p-2 hover:bg-muted transition-colors" onClick={() => setQty(qty + 1)}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button size="lg" className="flex-1 gap-2" onClick={handleAddToCart}>
                <ShoppingBag className="h-4 w-4" /> Add to Cart
              </Button>
            </div>
          )}

          {/* WhatsApp chat about this product */}
          <a
            href={(() => {
              const lines = [
                `Hi! I'm interested in this product:`,
                ``,
                `*${product.name}*`,
                product.brand ? `Brand: ${product.brand}` : null,
                product.sku ? `SKU: ${product.sku}` : null,
                selectedColor ? `Color: ${selectedColor}` : null,
                selectedSize ? `Size: ${selectedSize}` : null,
                `Price: ₹${product.selling_price.toLocaleString()}`,
                ``,
                `Link: ${typeof window !== "undefined" ? window.location.href : ""}`,
              ].filter(Boolean).join("\n");
              return `https://wa.me/918882866833?text=${encodeURIComponent(lines)}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-2 h-11 rounded-lg border border-[#25D366] bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-colors text-sm font-medium px-4"
          >
            <MessageCircle className="h-4 w-4" /> Chat on WhatsApp about this product
          </a>
        </div>
      </div>

      {/* All product videos by size */}
      {(() => {
        const videoSibs = siblings.filter((s) => s.video_url && (allColors.length === 0 || s.color === selectedColor));
        // Dedup by video_url, keep first size label per url
        const seen = new Set<string>();
        const items = videoSibs.filter((s) => {
          if (seen.has(s.video_url)) return false;
          seen.add(s.video_url);
          return true;
        });
        if (items.length === 0) return null;
        return (
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-4">
              All videos {selectedColor ? <span className="text-muted-foreground font-normal text-base">· {selectedColor}</span> : null}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {items.map((s) => (
                <div key={s.id} className="rounded-xl overflow-hidden border border-border bg-card">
                  <div className="aspect-[3/4] bg-muted relative">
                    <video
                      src={s.video_url}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    {s.size && (
                      <span className="absolute top-2 left-2 px-2 py-1 rounded-md bg-background/90 backdrop-blur text-xs font-bold text-foreground border border-border">
                        Size: {s.size}
                      </span>
                    )}
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-sm font-medium text-foreground">
                      {s.size ? `Size ${s.size}` : "Video"}
                    </p>
                    {(stockMap[s.id] ?? 0) <= 0 && (
                      <p className="text-[10px] text-destructive">Out of stock</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
