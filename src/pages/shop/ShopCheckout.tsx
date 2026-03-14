import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Loader2, Truck } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const PICKUP_PINCODE = "110001";

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
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd: string;
  estimated_delivery_days: number;
}

export default function ShopCheckout() {
  const { items, clearCart } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const payuFormRef = useRef<HTMLFormElement>(null);
  const [payuData, setPayuData] = useState<Record<string, string> | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Serviceability state
  const [checkingPincode, setCheckingPincode] = useState(false);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<CourierOption | null>(null);
  const [shippingCost, setShippingCost] = useState(0);

  // Check pincode serviceability
  useEffect(() => {
    const pincode = form.pincode;
    if (pincode.length !== 6 || !/^[1-9]\d{5}$/.test(pincode)) {
      setServiceable(null);
      setCouriers([]);
      setSelectedCourier(null);
      setShippingCost(0);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingPincode(true);
      try {
        // Calculate total weight: 300g (0.3kg) per item
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWeightKg = Math.max(0.5, totalQuantity * 0.3); // minimum 0.5kg

        const { data, error } = await supabase.functions.invoke("shiprocket", {
          body: {
            action: "check_serviceability",
            pickup_pincode: PICKUP_PINCODE,
            delivery_pincode: pincode,
            weight: totalWeightKg.toFixed(1),
          },
        });

        if (error) throw error;

        const available = data?.data?.available_courier_companies;
        if (available && available.length > 0) {
          setServiceable(true);
          const sorted = available
            .map((c: any) => ({
              courier_company_id: c.courier_company_id,
              courier_name: c.courier_name,
              rate: c.rate,
              etd: c.etd,
              estimated_delivery_days: c.estimated_delivery_days,
            }))
            .sort((a: CourierOption, b: CourierOption) => a.rate - b.rate);
          setCouriers(sorted);
          setSelectedCourier(sorted[0]);
          setShippingCost(sorted[0].rate);
        } else {
          setServiceable(false);
          setCouriers([]);
          setSelectedCourier(null);
          setShippingCost(0);
        }
      } catch {
        setServiceable(null);
        setCouriers([]);
      } finally {
        setCheckingPincode(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [form.pincode]);

  useEffect(() => {
    if (items.length === 0 && !payuData && !loading) {
      navigate("/cart");
    }
  }, [items.length, navigate, payuData, loading]);

  if (items.length === 0 && !payuData) {
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
    if (!form.pincode.match(/^[1-9]\d{5}$/)) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }
    if (!serviceable || !selectedCourier) {
      toast.error("Delivery is not available to this pincode");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("guest-checkout", {
        body: {
          guest_name: form.name,
          guest_email: form.email || null,
          guest_phone: form.phone,
          address_line1: form.address_line1,
          address_line2: form.address_line2 || null,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          store_id: STORE_ID,
          courier_name: selectedCourier.courier_name,
          shipping_cost: shippingCost,
        },
      });

      if (error) throw error;

      // Don't clear cart here — it triggers redirect before PayU form submits

      const payu = data.payu;
      setPayuData({
        key: payu.key,
        txnid: payu.txnid,
        amount: payu.amount,
        productinfo: payu.productinfo,
        firstname: payu.firstname,
        email: payu.email,
        phone: payu.phone,
        surl: payu.surl,
        furl: payu.furl,
        hash: payu.hash,
      });

      setTimeout(() => {
        payuFormRef.current?.submit();
      }, 100);
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
                  {form.pincode.length === 6 && (
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      {checkingPincode ? (
                        <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Checking...</span></>
                      ) : serviceable === true ? (
                        <><CheckCircle className="h-3 w-3 text-green-600" /><span className="text-green-600">Delivery available</span></>
                      ) : serviceable === false ? (
                        <><XCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Not deliverable</span></>
                      ) : null}
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
            </CardContent>
          </Card>

          {/* Courier options */}
          {couriers.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Shipping Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {couriers.slice(0, 4).map((c) => (
                  <label
                    key={c.courier_company_id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCourier?.courier_company_id === c.courier_company_id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="courier"
                        checked={selectedCourier?.courier_company_id === c.courier_company_id}
                        onChange={() => {
                          setSelectedCourier(c);
                          setShippingCost(c.rate);
                        }}
                        className="accent-primary"
                      />
                      <div>
                        <p className="text-sm font-medium">{c.courier_name}</p>
                        <p className="text-xs text-muted-foreground">Est. {c.etd}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">₹{c.rate}</span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
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
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Incl. GST</span>
                  <span>₹{Math.round(taxTotal).toLocaleString("en-IN")}</span>
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
                {loading ? "Processing..." : `Pay ₹${total.toLocaleString("en-IN")} with PayU`}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Secure payment via PayU. UPI, Cards, Net Banking accepted.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>

      {/* Hidden PayU redirect form */}
      {payuData && (
        <form ref={payuFormRef} method="POST" action="https://secure.payu.in/_payment" style={{ display: "none" }}>
          {Object.entries(payuData).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}
    </div>
  );
}
