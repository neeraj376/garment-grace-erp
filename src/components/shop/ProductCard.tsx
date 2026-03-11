import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

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
}

export default function ProductCard({ product }: { product: Product }) {
  const discount = product.mrp && product.mrp > product.selling_price
    ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
    : 0;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-200"
    >
      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
        {product.photo_url ? (
          <img
            src={product.photo_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">₹{product.selling_price.toLocaleString()}</span>
          {product.mrp && product.mrp > product.selling_price && (
            <span className="text-xs text-muted-foreground line-through">₹{product.mrp.toLocaleString()}</span>
          )}
        </div>
        {(product.size || product.color) && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {[product.size, product.color].filter(Boolean).join(" • ")}
          </p>
        )}
      </div>
    </Link>
  );
}
