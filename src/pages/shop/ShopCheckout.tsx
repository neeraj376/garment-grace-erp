import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Truck, Store } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/hooks/useCart";
import { useShopVisitor } from "@/hooks/useShopVisitor";
import { toast } from "sonner";
import { calculateDtdcShipping } from "@/lib/dtdcRates";

const STORE_PICKUP_ADDRESS = {
  address_line1: "Originee Store - Pickup",
  city: "Gurugram",
  state: "Haryana",
  pincode: "122001",
};




const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

interface CourierOption {
  courier_name: string;
  rate: number;
}



declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function ShopCheckout() {
  const { items, clearCart } = useCart();
  const { visitor } = useShopVisitor();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Prefill from verified visitor (name + email + 10-digit phone, stripping +91)
  const visitorPhoneRaw = visitor?.phone ?? "";
  const visitorPhone10 = visitorPhoneRaw.startsWith("91") ? visitorPhoneRaw.slice(2) : visitorPhoneRaw;

  const [form, setForm] = useState({
    name: visitor?.name ?? "",
    email: visitor?.email ?? "",
    phone: visitorPhone10,
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Keep prefilled fields in sync if visitor loads after first render
  useEffect(() => {
    if (visitor) {
      const vPhoneRaw = visitor.phone ?? "";
      const vPhone10 = vPhoneRaw.startsWith("91") ? vPhoneRaw.slice(2) : vPhoneRaw;
      setForm((f) => ({
        ...f,
        name: f.name || visitor.name,
        email: f.email || (visitor.email ?? ""),
        phone: f.phone || vPhone10,
      }));
    }
  }, [visitor]);

  // Delivery method: ship to address, or store pickup
  const [deliveryMethod, setDeliveryMethod] = useState<"ship" | "pickup">("ship");

  // Shipping state (DTDC Non-Dox per-kg local calculator)
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<CourierOption | null>(null);
  const [shippingCost, setShippingCost] = useState(0);

  useEffect(() => {
    if (deliveryMethod === "pickup") {
      setServiceable(true);
      setShippingCost(0);
      setSelectedCourier({ courier_name: "Store Pickup", rate: 0 });
      return;
    }

    const pincodeValid = /^[1-9]\d{5}$/.test(form.pincode);
    if (!pincodeValid || !form.state) {
      setServiceable(null);
      setSelectedCourier(null);
      setShippingCost(0);
      return;
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const weightKg = Math.max(0.5, totalQuantity * 0.4);
    const invoiceValue = items.reduce(
      (sum, item) => sum + (item.product?.selling_price ?? 0) * item.quantity,
      0
    );

    const { cost } = calculateDtdcShipping(form.state, weightKg, invoiceValue);
    setServiceable(true);
    setShippingCost(cost);
    setSelectedCourier({ courier_name: "DTDC", rate: cost });
  }, [form.pincode, form.state, items, deliveryMethod]);



  useEffect(() => {
    if (items.length === 0 && !loading) {
      navigate("/cart");
    }
  }, [items.length, navigate, loading]);

  if (items.length === 0) {
    return null;
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

  const total = subtotal + shippingCost;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!form.phone.match(/^[6-9]\d{9}$/)) {
      toast.error("Please enter a valid 10-digit Indian mobile number");
      return;
    }
    if (deliveryMethod === "ship") {
      if (!form.pincode.match(/^[1-9]\d{5}$/)) {
        toast.error("Please enter a valid 6-digit pincode");
        return;
      }
      if (!serviceable || !selectedCourier) {
        toast.error("Delivery is not available to this pincode");
        return;
      }
    }

    setLoading(true);

    const addressPayload = deliveryMethod === "pickup"
      ? { ...STORE_PICKUP_ADDRESS, address_line2: null }
      : {
          address_line1: form.address_line1,
          address_line2: form.address_line2 || null,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        };

    try {
      const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
        body: {
          guest_name: form.name,
          guest_email: form.email || null,
          guest_phone: form.phone,
          ...addressPayload,
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          store_id: STORE_ID,
          courier_name: deliveryMethod === "pickup" ? "Store Pickup" : selectedCourier!.courier_name,
          shipping_cost: deliveryMethod === "pickup" ? 0 : shippingCost,
        },
      });

      if (error) throw error;

      const rzp = data.razorpay;
      const orderId = data.order_id;

      if (!window.Razorpay) {
        toast.error("Payment gateway failed to load. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const options = {
        key: rzp.key_id,
        amount: rzp.amount,
        currency: rzp.currency,
        name: "Originee Store",
        description: `Order ${data.order_number}`,
        order_id: rzp.razorpay_order_id,
        prefill: {
          name: rzp.name,
          email: rzp.email,
          contact: rzp.phone,
        },
        theme: { color: "#1e40af" },
        handler: async (response: any) => {
          try {
            const { data: verifyData, error: verifyErr } = await supabase.functions.invoke(
              "razorpay-verify",
              {
                body: {
                  order_id: orderId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              }
            );
            if (verifyErr || !verifyData?.success) {
              throw new Error(verifyErr?.message || "Verification failed");
            }
            clearCart();
            navigate(`/payment-result?status=success&order_id=${orderId}`);
          } catch {
            navigate(`/payment-result?status=failed&order_id=${orderId}`);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            toast.info("Payment cancelled");
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on("payment.failed", () => {
        setLoading(false);
        navigate(`/payment-result?status=failed&order_id=${orderId}`);
      });
      rzpInstance.open();
    } catch (err: any) {
      toast.error(err.message || "Failed to place order");
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="font-display text-2xl font-bold mb-6">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Contact & Shipping form */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact & Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Your full name" />
                </div>
                <div>
                  <Label htmlFor="phone">Mobile Number *</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+91</span>
                    <Input
                      id="phone"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      required
                      pattern="[6-9]\d{9}"
                      maxLength={10}
                      placeholder="9876543210"
                      className="rounded-l-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email (optional, for order updates)</Label>
                <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" />
              </div>

              <div className="pt-2">
                <Label className="mb-2 block">Delivery Method *</Label>
                <RadioGroup
                  value={deliveryMethod}
                  onValueChange={(v) => setDeliveryMethod(v as "ship" | "pickup")}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${deliveryMethod === "ship" ? "border-primary bg-primary/5" : "border-input"}`}>
                    <RadioGroupItem value="ship" id="dm-ship" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 font-medium text-sm"><Truck className="h-4 w-4" /> Ship to Address</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Delivered via DTDC</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${deliveryMethod === "pickup" ? "border-primary bg-primary/5" : "border-input"}`}>
                    <RadioGroupItem value="pickup" id="dm-pickup" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 font-medium text-sm"><Store className="h-4 w-4" /> Store Pickup</div>
                      <div className="text-xs text-muted-foreground mt-0.5">No shipping charges</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {deliveryMethod === "ship" && (
                <>
                  <div>
                    <Label htmlFor="address_line1">Address Line 1 *</Label>
                    <Input id="address_line1" name="address_line1" value={form.address_line1} onChange={handleChange} required placeholder="House/Flat No., Building, Street" />
                  </div>
                  <div>
                    <Label htmlFor="address_line2">Address Line 2 (optional)</Label>
                    <Input id="address_line2" name="address_line2" value={form.address_line2} onChange={handleChange} placeholder="Landmark, Area, Colony" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="pincode">Pincode *</Label>
                      <Input
                        id="pincode"
                        name="pincode"
                        value={form.pincode}
                        onChange={handleChange}
                        required
                        pattern="[1-9]\d{5}"
                        maxLength={6}
                        placeholder="110001"
                      />
                      {form.pincode.length === 6 && serviceable && (
                        <div className="mt-1 flex items-center gap-1 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <span className="text-green-600">Delivery available</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input id="city" name="city" value={form.city} onChange={handleChange} required placeholder="New Delhi" />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Select value={form.state} onValueChange={(val) => setForm((f) => ({ ...f, state: val }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {deliveryMethod === "pickup" && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Collect your order from our store. We'll notify you on WhatsApp/email once it's ready.
                </div>
              )}
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
                  const p = item.product;
                  return (
                    <div key={item.product_id} className="flex justify-between">
                      <span className="text-muted-foreground line-clamp-1 flex-1">{p?.name} × {item.quantity}</span>
                      <span className="font-medium ml-2">₹{((p?.selling_price ?? 0) * item.quantity).toLocaleString("en-IN")}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (incl. GST)</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">GST included in price</span>
                  <span className="text-muted-foreground">₹{Math.round(taxTotal).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{shippingCost > 0 ? `₹${shippingCost}` : serviceable ? "₹0" : "—"}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full mt-4"
                size="lg"
                disabled={loading || !form.state || !serviceable || !selectedCourier}
              >
                {loading ? "Processing..." : `Pay ₹${total.toLocaleString("en-IN")} with Razorpay`}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Secure payment via Razorpay. UPI, Cards, Net Banking, Wallets accepted.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
