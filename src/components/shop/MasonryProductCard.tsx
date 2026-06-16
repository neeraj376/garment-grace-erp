import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { parsePhotoUrls } from "@/lib/photoUtils";

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

interface Props {
  product: Product;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Poshmark-style feed card: natural image height (no fixed aspect),
 * compact info row, like icon overlay. Designed for CSS column masonry.
 */
export default function MasonryProductCard({ product, minPrice, maxPrice }: Props) {
  const displayPrice = minPrice ?? product.selling_price;
  const hasRange = minPrice !== undefined && maxPrice !== undefined && maxPrice > minPrice;
  const discount = product.mrp && product.mrp > displayPrice
    ? Math.round(((product.mrp - displayPrice) / product.mrp) * 100)
    : 0;
  const photos = parsePhotoUrls(product.photo_url);
  const firstPhoto = photos[0] ?? null;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group block mb-3 break-inside-avoid bg-card rounded-lg overflow-hidden border border-border hover:shadow-md transition-shadow"
    >
      <div className="relative bg-muted">
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt={product.name}
            className="w-full h-auto block group-hover:opacity-95 transition-opacity"
            loading="lazy"
          />
        ) : product.video_url ? (
          <video
            src={product.video_url}
            className="w-full h-auto block"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="aspect-[3/4] flex items-center justify-center text-4xl text-muted-foreground">👕</div>
        )}
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
            -{discount}%
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); }}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-card/90 backdrop-blur flex items-center justify-center text-foreground/70 hover:text-destructive hover:scale-110 transition-all"
          aria-label="Like"
        >
          <Heart className="w-4 h-4" />
        </button>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[13px] font-medium text-foreground line-clamp-1">{product.name}</p>
        {(product.size || product.brand) && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
            {[product.brand, product.size && `Size ${product.size}`].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-sm font-bold text-foreground">
            {hasRange ? "From " : ""}₹{displayPrice.toLocaleString()}
          </span>
          {!hasRange && product.mrp && product.mrp > product.selling_price && (
            <span className="text-[11px] text-muted-foreground line-through">
              ₹{product.mrp.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
