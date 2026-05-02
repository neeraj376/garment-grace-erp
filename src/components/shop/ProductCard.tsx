import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { parsePhotoUrls } from "@/lib/photoUtils";
import { colorToHex } from "@/lib/variantUtils";

interface Product {
  id: string;
  name: string;
  selling_price: number;
  mrp: number | null;
  photo_url: string | null;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  video_url?: string | null;
}

interface ProductCardProps {
  product: Product;
  /** Optional variant metadata when this card represents a grouped product */
  colors?: string[];
  sizes?: string[];
  minPrice?: number;
  maxPrice?: number;
}

export default function ProductCard({ product, colors, sizes, minPrice, maxPrice }: ProductCardProps) {
  const displayPrice = minPrice ?? product.selling_price;
  const hasPriceRange = minPrice !== undefined && maxPrice !== undefined && maxPrice > minPrice;

  const discount = product.mrp && product.mrp > displayPrice
    ? Math.round(((product.mrp - displayPrice) / product.mrp) * 100)
    : 0;
  const photos = parsePhotoUrls(product.photo_url);
  const firstPhoto = photos[0] ?? null;

  const swatchColors = (colors ?? (product.color ? [product.color] : [])).slice(0, 4);
  const extraColors = (colors?.length ?? 0) - swatchColors.length;
  const sizeCount = sizes?.length ?? 0;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-200"
    >
      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : product.video_url ? (
          <video
            src={product.video_url}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            muted
            playsInline
            preload="metadata"
            // #t=0.1 hint to render first frame as poster on most browsers
            // (Safari/iOS especially needs the fragment to paint a frame)
            poster=""
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.05); } catch {}
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-4xl">
            👕
          </div>
        )}
        {discount > 0 && (
          <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-[10px] font-bold">
            -{discount}%
          </Badge>
        )}
      </div>
      <div className="p-3">
        {product.brand && (
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
            {product.brand}
          </p>
        )}
        <h3 className="text-sm font-medium text-foreground line-clamp-1 mb-1">
          {product.name}
        </h3>
        {product.category && (
          <p className="text-[11px] text-muted-foreground mb-1">{product.category}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">
            {hasPriceRange ? "From " : ""}₹{displayPrice.toLocaleString()}
          </span>
          {!hasPriceRange && product.mrp && product.mrp > product.selling_price && (
            <span className="text-xs text-muted-foreground line-through">₹{product.mrp.toLocaleString()}</span>
          )}
        </div>

        {/* Variant indicators */}
        {(swatchColors.length > 0 || sizeCount > 1) && (
          <div className="flex items-center gap-2 mt-2">
            {swatchColors.length > 0 && (
              <div className="flex items-center gap-1">
                {swatchColors.map((c) => {
                  const hex = colorToHex(c);
                  return (
                    <span
                      key={c}
                      title={c}
                      className="w-3.5 h-3.5 rounded-full border border-border"
                      style={{ backgroundColor: hex ?? "hsl(var(--muted))" }}
                    />
                  );
                })}
                {extraColors > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">+{extraColors}</span>
                )}
              </div>
            )}
            {sizeCount > 1 && (
              <span className="text-[10px] text-muted-foreground">{sizeCount} sizes</span>
            )}
          </div>
        )}

        {/* Fallback: single-variant size/color line (when not grouped) */}
        {!colors && !sizes && (product.size || product.color) && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {[product.size, product.color].filter(Boolean).join(" • ")}
          </p>
        )}
      </div>
    </Link>
  );
}
