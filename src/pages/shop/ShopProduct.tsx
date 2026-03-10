import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ArrowLeft, Minus, Plus } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";

export default function ShopProduct() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();

  const [outOfStock, setOutOfStock] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchProduct = async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setProduct(data);

      // Check if product is in stock
      if (data) {
        const { data: batches } = await supabase
          .from("inventory_batches")
          .select("quantity")
          .eq("product_id", id);
        const totalStock = (batches ?? []).reduce((sum: number, b: any) => sum + (b.quantity || 0), 0);
        setOutOfStock(totalStock <= 0);
      }
      setLoading(false);
    };
    fetchProduct();
  }, [id]);

  const handleAddToCart = () => {
    addToCart(product.id, qty);
    toast.success("Added to cart!");
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>;
  }

  if (!product) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Product not found.</div>;
  }

  const discount = product.mrp && product.mrp > product.selling_price
    ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image */}
        <div className="aspect-[3/4] bg-muted rounded-xl overflow-hidden">
          {product.photo_url ? (
            <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-muted-foreground">👕</div>
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

          <div className="border-t border-border my-4 pt-4 space-y-3">
            {product.category && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">Category</span>
                <span className="text-foreground font-medium">{product.category}</span>
              </div>
            )}
            {product.size && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">Size</span>
                <span className="text-foreground font-medium">{product.size}</span>
              </div>
            )}
            {product.color && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-20">Color</span>
                <span className="text-foreground font-medium">{product.color}</span>
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
        </div>
      </div>
    </div>
  );
}
