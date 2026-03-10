import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import { useCart } from "@/hooks/useCart";

export default function ShopCart() {
  const { items, loading, updateQuantity, removeFromCart } = useCart();
  const navigate = useNavigate();

  if (loading) {
    return <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading cart...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="font-display text-xl font-bold mb-2">Your cart is empty</h2>
        <p className="text-muted-foreground mb-4">Browse our collection and add items to your cart.</p>
        <Link to="/shop/category/all">
          <Button>Continue Shopping</Button>
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((sum, item) => {
    const price = item.product?.selling_price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  const taxTotal = items.reduce((sum, item) => {
    const p = item.product;
    if (!p) return sum;
    return sum + (p.selling_price * item.quantity * p.tax_rate) / (100 + p.tax_rate);
  }, 0);

  return (
    <div className="container mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Continue Shopping
      </button>

      <h1 className="font-display text-2xl font-bold mb-6">Shopping Cart ({items.length})</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const p = item.product;
            if (!p) return null;
            return (
              <div key={item.product_id} className="flex gap-4 bg-card rounded-xl border border-border p-4">
                <div className="w-20 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">👕</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground line-clamp-1">{p.name}</h3>
                  {(p.size || p.color) && (
                    <p className="text-xs text-muted-foreground mt-0.5">{[p.size, p.color].filter(Boolean).join(" • ")}</p>
                  )}
                  <p className="text-sm font-bold mt-1">₹{p.selling_price.toLocaleString()}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center border border-border rounded-md">
                      <button className="p-1 hover:bg-muted" onClick={() => updateQuantity(item.product_id, item.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="px-3 text-xs font-medium">{item.quantity}</span>
                      <button className="p-1 hover:bg-muted" onClick={() => updateQuantity(item.product_id, item.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button className="text-destructive hover:text-destructive/80" onClick={() => removeFromCart(item.product_id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="text-sm font-bold shrink-0">
                  ₹{(p.selling_price * item.quantity).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="bg-card rounded-xl border border-border p-6 h-fit sticky top-20">
          <h3 className="font-display text-lg font-bold mb-4">Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST (included)</span>
              <span className="font-medium">₹{Math.round(taxTotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-medium text-muted-foreground text-xs">Calculated at checkout</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
              <span>Total</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <Button className="w-full mt-6" size="lg" onClick={() => navigate("/shop/checkout")}>
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  );
}
