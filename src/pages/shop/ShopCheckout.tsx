import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCart } from "@/hooks/useCart";
import { useShopAuth } from "@/hooks/useShopAuth";
import { toast } from "sonner";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

export default function ShopCheckout() {
  const { items, clearCart } = useCart();
  const { customer, user } = useShopAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
  });

  if (!user || !customer) {
    navigate("/shop/login");
    return null;
  }

  if (items.length === 0) {
    navigate("/shop/cart");
    return null;
  }

  const subtotal = items.reduce((sum, item) => {
    const price = (item as any).products?.selling_price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  const taxTotal = items.reduce((sum, item) => {
    const p = (item as any).products;
    if (!p) return sum;
    return sum + (p.selling_price * item.quantity * p.tax_rate) / (100 + p.tax_rate);
  }, 0);

  const shipping = subtotal >= 999 ? 0 : 79;
  const total = subtotal + shipping;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Save shipping address
      const { data: addr, error: addrErr } = await supabase.from("shipping_addresses").insert({
        customer_id: customer.id,
        name: form.name,
        phone: form.phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      }).select("id").single();

      if (addrErr) throw addrErr;

      // Generate order number
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      // Create order
      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_id: customer.id,
        store_id: STORE_ID,
        shipping_address_id: addr.id,
        subtotal,
        tax_amount: Math.round(taxTotal),
        shipping_amount: shipping,
        total_amount: total,
        status: "pending",
        payment_status: "pending",
      }).select("id").single();

      if (orderErr) throw orderErr;

      // Create order items
      const orderItems = items.map((item) => {
        const p = (item as any).products;
        return {
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: p.selling_price,
          tax_amount: (p.selling_price * item.quantity * p.tax_rate) / (100 + p.tax_rate),
          total: p.selling_price * item.quantity,
        };
      });

      await supabase.from("order_items").insert(orderItems);
      await clearCart();

      toast.success("Order placed successfully! Order #" + orderNumber);
      navigate("/shop/account");
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="font-display text-2xl font-bold mb-6">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Shipping form */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" name="name" value={form.name} onChange={handleChange} required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" value={form.phone} onChange={handleChange} required />
                </div>
              </div>
              <div>
                <Label htmlFor="address_line1">Address Line 1</Label>
                <Input id="address_line1" name="address_line1" value={form.address_line1} onChange={handleChange} required />
              </div>
              <div>
                <Label htmlFor="address_line2">Address Line 2 (optional)</Label>
                <Input id="address_line2" name="address_line2" value={form.address_line2} onChange={handleChange} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" value={form.city} onChange={handleChange} required />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" value={form.state} onChange={handleChange} required />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input id="pincode" name="pincode" value={form.pincode} onChange={handleChange} required pattern="[0-9]{6}" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:col-span-2">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm mb-4">
                {items.map((item) => {
                  const p = (item as any).products;
                  return (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-muted-foreground line-clamp-1 flex-1">{p?.name} × {item.quantity}</span>
                      <span className="font-medium ml-2">₹{((p?.selling_price ?? 0) * item.quantity).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className={shipping === 0 ? "text-success" : ""}>{shipping === 0 ? "FREE" : `₹${shipping}`}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span>₹{total.toLocaleString()}</span>
                </div>
              </div>
              <Button type="submit" className="w-full mt-4" size="lg" disabled={loading}>
                {loading ? "Placing Order..." : "Place Order (COD)"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                PayU payment integration coming soon. Currently COD only.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
