import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Truck } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useShopAuth } from "@/hooks/useShopAuth";
import { toast } from "sonner";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const PICKUP_PINCODE = "110001"; // Store's pickup pincode

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
  const { customer, user } = useShopAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const payuFormRef = useRef<HTMLFormElement>(null);
  const [payuData, setPayuData] = useState<Record<string, string> | null>(null);

  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
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
        const { data, error } = await supabase.functions.invoke("shiprocket", {
          body: {
            action: "check_serviceability",
            pickup_pincode: PICKUP_PINCODE,
            delivery_pincode: pincode,
            weight: "0.5",
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
          // Auto-select cheapest
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

  const total = subtotal + shippingCost;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

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

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_id: customer.id,
        store_id: STORE_ID,
        shipping_address_id: addr.id,
        subtotal,
        tax_amount: Math.round(taxTotal),
        shipping_amount: shippingCost,
        total_amount: total,
        status: "pending",
        payment_status: "pending",
        payment_method: "payu",
        courier_name: selectedCourier.courier_name,
      }).select("id").single();

      if (orderErr) throw orderErr;

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

      // Get PayU hash
      const productinfo = `Order ${orderNumber}`;
      const surl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payu-verify`;
      const furl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payu-verify`;

      const { data: hashData, error: hashErr } = await supabase.functions.invoke("payu-hash", {
        body: {
          txnid: order.id,
          amount: total.toFixed(2),
          productinfo,
          firstname: form.name,
          email: customer.email || "customer@originee.in",
          phone: form.phone,
          surl,
          furl,
        },
      });

      if (hashErr) throw hashErr;

      await clearCart();

      setPayuData({
        key: hashData.key,
        txnid: hashData.txnid,
        amount: hashData.amount,
        productinfo: hashData.productinfo,
        firstname: hashData.firstname,
        email: hashData.email,
        phone: hashData.phone,
        surl: hashData.surl,
        furl: hashData.furl,
        hash: hashData.hash,
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
                  <Label htmlFor="phone">Mobile Number</Label>
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
                <Label htmlFor="address_line1">Address Line 1</Label>
                <Input id="address_line1" name="address_line1" value={form.address_line1} onChange={handleChange} required placeholder="House/Flat No., Building, Street" />
              </div>
              <div>
                <Label htmlFor="address_line2">Address Line 2 (optional)</Label>
                <Input id="address_line2" name="address_line2" value={form.address_line2} onChange={handleChange} placeholder="Landmark, Area, Colony" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
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
                  {/* Serviceability indicator */}
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
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" value={form.city} onChange={handleChange} required placeholder="New Delhi" />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
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
                  const p = (item as any).products;
                  return (
                    <div key={item.id} className="flex justify-between">
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
