import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, FileText, MessageCircle, Loader2, ExternalLink, PauseCircle, PlayCircle, X, Eye, ChevronDown, Truck, CheckCircle, XCircle } from "lucide-react";
import InvoicePreviewDialog from "./InvoicePreviewDialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
];

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

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  tax_rate: number;
  item_discount: number;
  category?: string;
  subcategory?: string;
  color?: string;
  size?: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  email?: string | null;
}

interface Props {
  storeId: string | null;
  userId: string | undefined;
}

const DRAFT_KEY = "invoice_draft";

interface HeldInvoice {
  id: string;
  heldAt: string;
  customerMobile: string;
  customerName: string;
  customerGender: string;
  customerLocation: string;
  customerEmail?: string;
  courierName?: string;
  awbNo?: string;
  cart: CartItem[];
  source: string;
  paymentMethod: string;
  selectedEmployee: string;
  discount: number;
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(data: any) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function NewInvoiceTab({ storeId, userId }: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => loadDraft()?.cart ?? []);
  const [customerMobile, setCustomerMobile] = useState(() => loadDraft()?.customerMobile ?? "");
  const [customerName, setCustomerName] = useState(() => loadDraft()?.customerName ?? "");
  const [customerGender, setCustomerGender] = useState(() => loadDraft()?.customerGender ?? "");
  const [customerLocation, setCustomerLocation] = useState(() => loadDraft()?.customerLocation ?? "");
  const [customerEmail, setCustomerEmail] = useState(() => loadDraft()?.customerEmail ?? "");
  const [courierName, setCourierName] = useState(() => loadDraft()?.courierName ?? "");
  const [awbNo, setAwbNo] = useState(() => loadDraft()?.awbNo ?? "");
  const [source, setSource] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<Record<string, number>>({});
  const [selectedEmployee, setSelectedEmployee] = useState(() => loadDraft()?.selectedEmployee ?? "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [discount, setDiscount] = useState(() => loadDraft()?.discount ?? 0);
  const [pendingAmount, setPendingAmount] = useState(() => loadDraft()?.pendingAmount ?? 0);
  const [searchProduct, setSearchProduct] = useState("");
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string; total: number; customerMobile: string; customerName: string } | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingGroupInvite, setSendingGroupInvite] = useState(false);
  const [groupInviteSent, setGroupInviteSent] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<any[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Shipping (online source) state
  const [addressLine1, setAddressLine1] = useState(() => loadDraft()?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(() => loadDraft()?.addressLine2 ?? "");
  const [shipCity, setShipCity] = useState(() => loadDraft()?.shipCity ?? "");
  const [shipState, setShipState] = useState(() => loadDraft()?.shipState ?? "");
  const [shipPincode, setShipPincode] = useState(() => loadDraft()?.shipPincode ?? "");
  const [checkingPincode, setCheckingPincode] = useState(false);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<CourierOption | null>(null);
  const [shippingCost, setShippingCost] = useState(0);
  const [bookingCourier, setBookingCourier] = useState(false);

  const isAuthErrorMessage = (message: string) => /jwt|token|session|expired|refresh/i.test(message);

  const showMutationError = (title: string, message: string) => {
    if (isAuthErrorMessage(message)) {
      toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
      return;
    }

    toast({ title, description: message, variant: "destructive" });
  };

  const ensureFreshSession = async (forceRefresh = false): Promise<boolean> => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      const expiresSoon =
        forceRefresh ||
        !session ||
        !session.expires_at ||
        session.expires_at <= Math.floor(Date.now() / 1000) + 60;

      if (!expiresSoon) return true;

      const {
        data: { session: refreshedSession },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError || !refreshedSession) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        return false;
      }

      return true;
    } catch (error: any) {
      toast({
        title: "Session expired",
        description: error?.message ?? "Please log in again.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Load held invoices from database
  const fetchHeldInvoices = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("held_invoices")
      .select("id, data, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true });
    if (data) {
      setHeldInvoices(data.map((row: any) => ({ ...row.data, id: row.id, heldAt: row.created_at })));
    }
  }, [storeId]);

  useEffect(() => { fetchHeldInvoices(); }, [fetchHeldInvoices]);

  // Search existing customers as mobile number is typed
  useEffect(() => {
    if (!storeId || customerMobile.length < 3) {
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, mobile, name, gender, location, email")
        .eq("store_id", storeId)
        .ilike("mobile", `%${customerMobile}%`)
        .limit(5);
      setCustomerSuggestions(data ?? []);
      setShowCustomerSuggestions((data ?? []).length > 0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerMobile, storeId]);

  // Search existing customers by name
  useEffect(() => {
    if (!storeId || customerName.length < 2) {
      setNameSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, mobile, name, gender, location, email")
        .eq("store_id", storeId)
        .ilike("name", `%${customerName}%`)
        .limit(5);
      setNameSuggestions(data ?? []);
      setShowNameSuggestions((data ?? []).length > 0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerName, storeId]);

  const selectCustomerSuggestion = (cust: any) => {
    setCustomerMobile(cust.mobile);
    setCustomerName(cust.name || "");
    setCustomerGender(cust.gender || "");
    setCustomerLocation(cust.location || "");
    setCustomerEmail(cust.email || "");
    setShowCustomerSuggestions(false);
    setShowNameSuggestions(false);
  };

  // Persist draft to localStorage
  useEffect(() => {
    saveDraft({
      cart, customerMobile, customerName, customerGender, customerLocation, customerEmail,
      courierName, awbNo, source, paymentMethods, selectedEmployee, discount, pendingAmount,
      addressLine1, addressLine2, shipCity, shipState, shipPincode,
    });
  }, [cart, customerMobile, customerName, customerGender, customerLocation, customerEmail, courierName, awbNo, source, paymentMethods, selectedEmployee, discount, pendingAmount, addressLine1, addressLine2, shipCity, shipState, shipPincode]);

  // Pincode serviceability check (only when source is online)
  useEffect(() => {
    if (source !== "online") {
      setServiceable(null);
      setCouriers([]);
      setSelectedCourier(null);
      setShippingCost(0);
      return;
    }
    if (shipPincode.length !== 6 || !/^[1-9]\d{5}$/.test(shipPincode)) {
      setServiceable(null);
      setCouriers([]);
      setSelectedCourier(null);
      setShippingCost(0);
      return;
    }
    const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
    if (totalQty === 0) return;

    const timer = setTimeout(async () => {
      setCheckingPincode(true);
      try {
        const totalWeightKg = Math.max(0.5, totalQty * 0.5);
        const { data, error } = await supabase.functions.invoke("shiprocket", {
          body: {
            action: "check_serviceability",
            pickup_pincode: PICKUP_PINCODE,
            delivery_pincode: shipPincode,
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
  }, [shipPincode, source, cart]);

  const handleBookCourier = async () => {
    if (!selectedCourier) {
      toast({ title: "Select a courier", description: "Pick a shipping option first", variant: "destructive" });
      return;
    }
    if (!customerName.trim() || !customerMobile.trim()) {
      toast({ title: "Customer required", description: "Name and mobile are required", variant: "destructive" });
      return;
    }
    if (!addressLine1.trim() || !shipCity.trim() || !shipState || !shipPincode.trim()) {
      toast({ title: "Address required", description: "Fill the complete shipping address", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add products before booking", variant: "destructive" });
      return;
    }

    setBookingCourier(true);
    try {
      const orderRef = `INV-PREBOOK-${Date.now().toString(36).toUpperCase()}`;
      const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
      const totalWeightKg = Math.max(0.5, totalQty * 0.5);
      const nameParts = customerName.trim().split(/\s+/);
      const billingFirst = nameParts[0] || "Customer";
      const billingLast = nameParts.slice(1).join(" ") || "-";

      const order_data = {
        order_id: orderRef,
        order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
        pickup_location: "work",
        billing_customer_name: billingFirst,
        billing_last_name: billingLast,
        billing_address: addressLine1,
        billing_address_2: addressLine2 || "",
        billing_city: shipCity,
        billing_pincode: shipPincode,
        billing_state: shipState,
        billing_country: "India",
        billing_email: customerEmail || "noreply@originee-store.com",
        billing_phone: customerMobile.replace(/\D/g, "").slice(-10),
        shipping_is_billing: true,
        order_items: cart.map(i => ({
          name: i.name,
          sku: i.sku,
          units: i.quantity,
          selling_price: i.unit_price,
          discount: i.item_discount,
          tax: i.tax_rate,
          hsn: 0,
        })),
        payment_method: "Prepaid",
        sub_total: cart.reduce((s, i) => s + getLineTotal(i), 0),
        length: 25,
        breadth: 20,
        height: 5,
        weight: Number(totalWeightKg.toFixed(1)),
      };

      const { data: created, error: createErr } = await supabase.functions.invoke("shiprocket", {
        body: { action: "create_order", order_data },
      });
      if (createErr) throw createErr;

      // Surface Shiprocket validation errors clearly
      if (created?.status_code && created.status_code >= 400) {
        const detail = created?.errors
          ? Object.entries(created.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : created.message || "Shiprocket order creation failed";
        throw new Error(detail);
      }
      if (created?.message && !created?.shipment_id && !created?.order_id) {
        const detail = created?.errors
          ? Object.entries(created.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : created.message;
        throw new Error(detail);
      }

      const shipmentId = created?.shipment_id || created?.payload?.shipment_id;
      if (!shipmentId || shipmentId === 0) {
        console.error("Shiprocket create_order response:", created);
        const hint = created?.errors
          ? Object.entries(created.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : (created?.message || "Check that pickup location 'Primary' exists in your Shiprocket account and address fields are valid.");
        throw new Error(`No shipment_id returned. ${hint}`);
      }

      const { data: awbRes, error: awbErr } = await supabase.functions.invoke("shiprocket", {
        body: {
          action: "generate_awb",
          shipment_id: shipmentId,
          courier_id: selectedCourier.courier_company_id,
        },
      });
      if (awbErr) throw awbErr;
      const awbData = awbRes?.response?.data;
      const newAwb = awbData?.awb_code;
      const newCourier = awbData?.courier_name || selectedCourier.courier_name;
      if (!newAwb) throw new Error(awbRes?.message || "AWB not generated");

      setCourierName(newCourier);
      setAwbNo(newAwb);
      toast({ title: "Courier booked!", description: `${newCourier} • AWB ${newAwb}` });
    } catch (err: any) {
      toast({ title: "Booking failed", description: err?.message || "Could not book courier", variant: "destructive" });
    } finally {
      setBookingCourier(false);
    }
  };

  useEffect(() => {
    if (!storeId) return;
    // Fetch only in-stock products (paginated to avoid 1000-row limit)
    const fetchAllProducts = async () => {
      // First get IDs of products that have stock > 0
      const { data: inStockIds } = await supabase.rpc("get_in_stock_product_ids", { p_store_id: storeId });
      if (!inStockIds || inStockIds.length === 0) {
        setProducts([]);
        return;
      }

      let allProducts: any[] = [];
      const batchSize = 200;
      for (let i = 0; i < inStockIds.length; i += batchSize) {
        const idBatch = inStockIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from("products")
          .select("id, sku, name, selling_price, tax_rate, category, subcategory, color, size")
          .eq("store_id", storeId)
          .eq("is_active", true)
          .in("id", idBatch);
        if (data) allProducts = allProducts.concat(data);
      }

      // Fetch stock for each product
      const stockMap: Record<string, number> = {};
      await Promise.all(
        allProducts.map(async (p) => {
          const { data: stock } = await supabase.rpc("get_product_stock", { p_product_id: p.id });
          stockMap[p.id] = typeof stock === "number" ? stock : 0;
        })
      );
      setProducts(allProducts.map(p => ({ ...p, _stock: stockMap[p.id] ?? 0 })));
    };
    fetchAllProducts();
    (async () => {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, name, role, email")
        .eq("store_id", storeId)
        .eq("is_active", true);
      const list = (emps as any[]) ?? [];
      setEmployees(list);

      // Auto-select employee matching the logged-in user's email
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const loginEmail = user?.email?.trim().toLowerCase();
        if (loginEmail) {
          const match = list.find(e => (e.email || "").trim().toLowerCase() === loginEmail);
          if (match) {
            setSelectedEmployee(prev => (!prev || prev === "none") ? match.id : prev);
          }
        }
      } catch {}
    })();
  }, [storeId]);

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.product_id === product.id);
    if (existing) {
      setCart(cart.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      const price = Number(product.selling_price);
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: price,
        original_price: price,
        tax_rate: Number(product.tax_rate),
        item_discount: 0,
        category: product.category || undefined,
        subcategory: product.subcategory || undefined,
        color: product.color || undefined,
        size: product.size || undefined,
      }]);
    }
    setSearchProduct("");
  };

  const getLineTotal = (item: CartItem) => {
    const gross = item.unit_price * item.quantity;
    return gross - item.item_discount;
  };

  const subtotal = cart.reduce((s, i) => {
    const lineTotal = getLineTotal(i);
    const priceExclTax = lineTotal / (1 + i.tax_rate / 100);
    return s + priceExclTax;
  }, 0);
  const taxAmount = cart.reduce((s, i) => {
    const lineTotal = getLineTotal(i);
    const priceExclTax = lineTotal / (1 + i.tax_rate / 100);
    return s + (lineTotal - priceExclTax);
  }, 0);
  const total = cart.reduce((s, i) => s + getLineTotal(i), 0) - discount;

  const handleCreateInvoice = async () => {
    if (!storeId) {
      toast({ title: "Error", description: "Store not loaded. Please refresh the page.", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "Error", description: "Session expired. Please log in again.", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Error", description: "Please add at least one product", variant: "destructive" });
      return;
    }
    if (!customerMobile.trim()) {
      toast({ title: "Error", description: "Customer mobile number is required", variant: "destructive" });
      return;
    }
    if (!customerName.trim()) {
      toast({ title: "Error", description: "Customer name is required", variant: "destructive" });
      return;
    }
    if (!customerGender) {
      toast({ title: "Error", description: "Customer gender is required", variant: "destructive" });
      return;
    }
    if (!customerLocation.trim()) {
      toast({ title: "Error", description: "Customer location is required", variant: "destructive" });
      return;
    }
    if (!selectedEmployee || selectedEmployee === "none") {
      toast({ title: "Error", description: "Please select a sales employee", variant: "destructive" });
      return;
    }
    if (!source) {
      toast({ title: "Error", description: "Please select a source", variant: "destructive" });
      return;
    }
    if (source === "online" && !courierName.trim()) {
      toast({ title: "Error", description: "Courier Name is required for online invoices", variant: "destructive" });
      return;
    }
    if (source === "online" && !awbNo.trim()) {
      toast({ title: "Error", description: "AWB No. is required for online invoices", variant: "destructive" });
      return;
    }
    if (paymentMethods.length === 0) {
      toast({ title: "Error", description: "Please select at least one payment method", variant: "destructive" });
      return;
    }
    const paidAmountTarget = total - pendingAmount;
    let breakdownNote = "";
    if (paymentMethods.length > 1) {
      const sum = paymentMethods.reduce((s, m) => s + (Number(paymentBreakdown[m]) || 0), 0);
      if (Math.abs(sum - paidAmountTarget) > 0.5) {
        toast({
          title: "Payment breakdown mismatch",
          description: `Breakdown total ₹${sum.toFixed(2)} must equal ₹${paidAmountTarget.toFixed(2)} (Total − Pending).`,
          variant: "destructive",
        });
        return;
      }
      breakdownNote = paymentMethods
        .map(m => {
          const label = PAYMENT_OPTIONS.find(o => o.value === m)?.label ?? m;
          return `${label}: ₹${(Number(paymentBreakdown[m]) || 0).toFixed(2)}`;
        })
        .join(", ");
    }
    setCreatingInvoice(true);
    try {
      const sessionOk = await ensureFreshSession();
      if (!sessionOk) { setCreatingInvoice(false); return; }

      let customerId: string | null = null;
      if (customerMobile) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("store_id", storeId)
          .eq("mobile", customerMobile)
          .single();

        if (existing) {
          customerId = existing.id;
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              store_id: storeId,
              mobile: customerMobile,
              name: customerName || null,
              gender: customerGender || null,
              location: customerLocation || null,
              email: customerEmail.trim() || null,
            })
            .select()
            .single();
          customerId = newCust?.id ?? null;
        }
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          store_id: storeId,
          invoice_number: invoiceNumber,
          customer_id: customerId,
          employee_id: (selectedEmployee && selectedEmployee !== "none") ? selectedEmployee : null,
          source,
          courier_name: source === "online" ? courierName.trim() : null,
          awb_no: source === "online" ? awbNo.trim() : null,
          payment_method: paymentMethods.join("+"),
          notes: breakdownNote || null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discount,
          total_amount: total,
          pending_amount: pendingAmount,
          created_by: userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      const items = cart.map(i => {
        const lineTotal = getLineTotal(i);
        const priceExclTax = lineTotal / (1 + i.tax_rate / 100);
        const lineTax = lineTotal - priceExclTax;
        return {
          invoice_id: invoice.id,
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.item_discount,
          tax_amount: parseFloat(lineTax.toFixed(2)),
          total: lineTotal,
        };
      });

      const { error: itemsError } = await supabase.from("invoice_items").insert(items);
      if (itemsError) throw itemsError;

      if (customerId) {
        const { data: cust } = await supabase
          .from("customers")
          .select("total_spent, visit_count")
          .eq("id", customerId)
          .single();

        if (cust) {
          await supabase
            .from("customers")
            .update({
              total_spent: Number(cust.total_spent) + total,
              visit_count: cust.visit_count + 1,
            })
            .eq("id", customerId);
        }
      }

      toast({ title: "Invoice created", description: `${invoiceNumber} — ₹${total.toLocaleString("en-IN")}` });
      setLastInvoice({ id: invoice.id, invoice_number: invoiceNumber, total, customerMobile, customerName });
      setGroupInviteSent(false);
      setCart([]);
      setDiscount(0);
      setPendingAmount(0);
      setCustomerMobile("");
      setCustomerName("");
      setCustomerGender("");
      setCustomerLocation("");
      setCustomerEmail("");
      setCourierName("");
      setAwbNo("");
      setSelectedEmployee("");
      setSource("");
      setPaymentMethods([]);
      setPaymentBreakdown({});
      setAddressLine1(""); setAddressLine2(""); setShipCity(""); setShipState(""); setShipPincode("");
      setCouriers([]); setSelectedCourier(null); setShippingCost(0); setServiceable(null);
      clearDraft();
    } catch (err: any) {
      showMutationError("Error", err?.message ?? "Could not create invoice");
    } finally {
      setCreatingInvoice(false);
    }
  };

  const getInvoiceUrl = (invoiceId: string) => {
    return `${window.location.origin}/invoice/${invoiceId}`;
  };

  const getInvoiceShareUrl = (invoiceId: string) => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-og/${invoiceId}`;
  };

  const handleSendWhatsApp = async () => {
    if (!lastInvoice) return;
    const phone = lastInvoice.customerMobile;
    if (!phone) {
      toast({ title: "Error", description: "Customer mobile number is required to send WhatsApp", variant: "destructive" });
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-invoice", {
        body: {
          phone,
          invoiceUrl: getInvoiceUrl(lastInvoice.id),
          invoiceImageUrl: getInvoiceShareUrl(lastInvoice.id) + "?format=image",
          customerName: lastInvoice.customerName || "Customer",
          invoiceNumber: lastInvoice.invoice_number,
          totalAmount: lastInvoice.total.toLocaleString("en-IN"),
        },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send");

      toast({ title: "WhatsApp sent!", description: `Invoice link sent to ${phone}` });
      setLastInvoice(null);
    } catch (err: any) {
      toast({ title: "WhatsApp Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleSendGroupInvite = async () => {
    if (!lastInvoice?.customerMobile) return;
    setSendingGroupInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-group-invite", {
        body: {
          mode: "single",
          phone: lastInvoice.customerMobile,
          customerName: lastInvoice.customerName || "Customer",
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed");
      if (data?.failed > 0) throw new Error(data.results?.[0]?.error || "Send failed");
      setGroupInviteSent(true);
      toast({ title: "Group invite sent!", description: `WhatsApp group invite sent to ${lastInvoice.customerMobile}` });
    } catch (err: any) {
      toast({ title: "Group invite error", description: err.message, variant: "destructive" });
    } finally {
      setSendingGroupInvite(false);
    }
  };

  const handleHoldInvoice = async () => {
    if (cart.length === 0) {
      toast({ title: "Nothing to hold", description: "Add products before holding", variant: "destructive" });
      return;
    }
    if (!storeId) return;
    if (!userId) {
      toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
      return;
    }
    const sessionOk = await ensureFreshSession();
    if (!sessionOk) return;

    const heldData = {
      customerMobile, customerName, customerGender, customerLocation, customerEmail,
      courierName, awbNo, cart, source, paymentMethods, selectedEmployee, discount, pendingAmount,
    };

    let { error } = await supabase.from("held_invoices").insert({
      store_id: storeId,
      held_by: userId ?? null,
      data: heldData,
    } as any);

    if (error && isAuthErrorMessage(error.message)) {
      const refreshed = await ensureFreshSession(true);
      if (!refreshed) return;

      ({ error } = await supabase.from("held_invoices").insert({
        store_id: storeId,
        held_by: userId ?? null,
        data: heldData,
      } as any));
    }

    if (error) {
      showMutationError("Error holding invoice", error.message);
      return;
    }
    setCart([]); setDiscount(0); setPendingAmount(0); setCustomerMobile(""); setCustomerName("");
    setCustomerGender(""); setCustomerLocation(""); setCustomerEmail(""); setCourierName(""); setAwbNo(""); setSelectedEmployee("");
    setSource(""); setPaymentMethods([]);
    clearDraft();
    fetchHeldInvoices();
    toast({ title: "Invoice held", description: `${customerName || "Invoice"} parked — ${cart.length} item(s)` });
  };

  const handleResumeHeld = async (held: HeldInvoice) => {
    if (!storeId) return;
    if (!userId) {
      toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
      return;
    }
    if (cart.length > 0) {
      const currentData = {
        customerMobile, customerName, customerGender, customerLocation, customerEmail,
        courierName, awbNo, cart, source, paymentMethods, selectedEmployee, discount, pendingAmount,
      };

      let { error } = await supabase.from("held_invoices").insert({
        store_id: storeId,
        held_by: userId ?? null,
        data: currentData,
      } as any);

      if (error && isAuthErrorMessage(error.message)) {
        const refreshed = await ensureFreshSession(true);
        if (!refreshed) return;

        ({ error } = await supabase.from("held_invoices").insert({
          store_id: storeId,
          held_by: userId ?? null,
          data: currentData,
        } as any));
      }

      if (error) {
        showMutationError("Error holding current invoice", error.message);
        return;
      }
    }

    let { error } = await supabase.from("held_invoices").delete().eq("id", held.id);

    if (error && isAuthErrorMessage(error.message)) {
      const refreshed = await ensureFreshSession(true);
      if (!refreshed) return;

      ({ error } = await supabase.from("held_invoices").delete().eq("id", held.id));
    }

    if (error) {
      showMutationError("Error resuming invoice", error.message);
      return;
    }
    fetchHeldInvoices();
    setCart(held.cart);
    setCustomerMobile(held.customerMobile);
    setCustomerName(held.customerName);
    setCustomerGender(held.customerGender);
    setCustomerLocation(held.customerLocation);
    setCustomerEmail(held.customerEmail || "");
    setCourierName(held.courierName || "");
    setAwbNo(held.awbNo || "");
    setSource(held.source);
    setPaymentMethods(Array.isArray((held as any).paymentMethods) ? (held as any).paymentMethods : (typeof held.paymentMethod === "string" && held.paymentMethod ? held.paymentMethod.split("+").filter(Boolean) : []));
    setSelectedEmployee(held.selectedEmployee);
    setDiscount(held.discount);
    setPendingAmount((held as any).pendingAmount ?? 0);
    toast({ title: "Invoice resumed", description: `${held.customerName || "Invoice"} restored` });
  };

  const handleDeleteHeld = async (id: string) => {
    let { error } = await supabase.from("held_invoices").delete().eq("id", id);

    if (error && isAuthErrorMessage(error.message)) {
      const refreshed = await ensureFreshSession(true);
      if (!refreshed) return;

      ({ error } = await supabase.from("held_invoices").delete().eq("id", id));
    }

    if (error) {
      showMutationError("Error removing held invoice", error.message);
      return;
    }
    fetchHeldInvoices();
    toast({ title: "Held invoice removed" });
  };

  const filteredProducts = products.filter(p => {
    const q = searchProduct.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const searchableText = [
      p.name, p.sku, p.category, p.subcategory, p.color, p.size, p.brand
    ].filter(Boolean).join(' ').toLowerCase();
    return words.every(word => searchableText.includes(word));
  });

  return (
    <div className="space-y-4">
      {/* Held Invoices Bar */}
      {heldInvoices.length > 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <PauseCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Held Invoices ({heldInvoices.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {heldInvoices.map(h => (
                <div key={h.id} className="flex items-center gap-1 bg-background border rounded-md px-2 py-1 text-xs shadow-sm">
                  <button onClick={() => handleResumeHeld(h)} className="flex items-center gap-1 hover:text-primary">
                    <PlayCircle className="h-3.5 w-3.5" />
                    <span className="font-medium">{h.customerName || h.customerMobile || "Draft"}</span>
                    <span className="text-muted-foreground">({h.cart.length} items · ₹{h.cart.reduce((s, i) => s + (i.unit_price * i.quantity - i.item_discount), 0).toLocaleString("en-IN")})</span>
                  </button>
                  <button onClick={() => handleDeleteHeld(h.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader><CardTitle className="section-title">Products</CardTitle></CardHeader>
          <CardContent>
            <Input
              placeholder="Search products to add..."
              value={searchProduct}
              onChange={e => setSearchProduct(e.target.value)}
              className="mb-3"
            />
            {searchProduct && (
              <div className="border rounded-lg max-h-60 overflow-y-auto mb-3">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-medium">{p.name} <span className="text-muted-foreground">({p.sku})</span></span>
                      <span className="font-semibold whitespace-nowrap ml-2">₹{Number(p.selling_price).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {p.category && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.category}</span>}
                      {p.subcategory && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.subcategory}</span>}
                      {p.color && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.color}</span>}
                      {p.size && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.size}</span>}
                      <span className="text-[11px] font-medium text-muted-foreground ml-auto">Qty: {p._stock}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Disc (₹)</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <FileText className="h-6 w-6 mx-auto mb-2" />
                      Search and add products
                    </TableCell>
                  </TableRow>
                ) : cart.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                      {(item.category || item.subcategory || item.color || item.size) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.category && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.category}</Badge>}
                          {item.subcategory && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.subcategory}</Badge>}
                          {item.color && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.color}</Badge>}
                          {item.size && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.size}</Badge>}
                        </div>
                      )}
                      {item.unit_price !== item.original_price && (
                        <div className="text-xs text-muted-foreground line-through">₹{item.original_price.toLocaleString("en-IN")}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => setCart(cart.map((c, i) => i === idx ? { ...c, quantity: parseInt(e.target.value) || 1 } : c))}
                        className="w-16 mx-auto text-center"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={item.unit_price}
                        onChange={e => setCart(cart.map((c, i) => i === idx ? { ...c, unit_price: Number(e.target.value) || 0 } : c))}
                        className="w-20 ml-auto text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={item.item_discount}
                        onChange={e => setCart(cart.map((c, i) => i === idx ? { ...c, item_discount: Number(e.target.value) || 0 } : c))}
                        className="w-20 ml-auto text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{getLineTotal(item).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setCart(cart.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="section-title">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Label>Mobile Number <span className="text-destructive">*</span></Label>
              <Input value={customerMobile} onChange={e => { setCustomerMobile(e.target.value); setShowCustomerSuggestions(true); }} placeholder="+91..." />
              {showCustomerSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-lg bg-popover shadow-md max-h-40 overflow-y-auto">
                  {customerSuggestions.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomerSuggestion(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between items-center"
                    >
                      <span className="font-medium">{c.mobile}</span>
                      <span className="text-muted-foreground text-xs">{c.name || "—"} {c.location ? `· ${c.location}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={customerName} onChange={e => { setCustomerName(e.target.value); setShowNameSuggestions(true); }} placeholder="Customer name" />
              {showNameSuggestions && nameSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-lg bg-popover shadow-md max-h-40 overflow-y-auto">
                  {nameSuggestions.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomerSuggestion(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between items-center"
                    >
                      <span className="font-medium">{c.name || "—"}</span>
                      <span className="text-muted-foreground text-xs">{c.mobile} {c.location ? `· ${c.location}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Gender <span className="text-destructive">*</span></Label>
              <Select value={customerGender} onValueChange={setCustomerGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location <span className="text-destructive">*</span></Label><Input value={customerLocation} onChange={e => setCustomerLocation(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="optional" /></div>
            <div>
              <Label>Source <span className="text-destructive">*</span></Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Offline (Walk-in)</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {source === "online" && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping Address</div>
                <div>
                  <Label className="text-xs">Address Line 1 <span className="text-destructive">*</span></Label>
                  <Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="House/Flat, Building, Street" />
                </div>
                <div>
                  <Label className="text-xs">Address Line 2</Label>
                  <Input value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Landmark, Area (optional)" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Pincode <span className="text-destructive">*</span></Label>
                    <Input
                      value={shipPincode}
                      onChange={e => setShipPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      placeholder="110001"
                    />
                    {shipPincode.length === 6 && (
                      <div className="mt-1 flex items-center gap-1 text-[11px]">
                        {checkingPincode ? (
                          <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Checking...</span></>
                        ) : serviceable === true ? (
                          <><CheckCircle className="h-3 w-3 text-green-600" /><span className="text-green-600">Available</span></>
                        ) : serviceable === false ? (
                          <><XCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Not deliverable</span></>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">City <span className="text-destructive">*</span></Label>
                    <Input value={shipCity} onChange={e => setShipCity(e.target.value)} placeholder="City" />
                  </div>
                  <div>
                    <Label className="text-xs">State <span className="text-destructive">*</span></Label>
                    <Select value={shipState} onValueChange={setShipState}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="z-[9999] max-h-60">
                        {INDIAN_STATES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {couriers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Truck className="h-3.5 w-3.5" /> Shipping Options
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {couriers.slice(0, 5).map(c => (
                        <label
                          key={c.courier_company_id}
                          className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors text-xs ${
                            selectedCourier?.courier_company_id === c.courier_company_id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="invoice-courier"
                              checked={selectedCourier?.courier_company_id === c.courier_company_id}
                              onChange={() => { setSelectedCourier(c); setShippingCost(c.rate); }}
                              className="accent-primary"
                            />
                            <div>
                              <p className="font-medium">{c.courier_name}</p>
                              <p className="text-[10px] text-muted-foreground">Est. {c.etd}</p>
                            </div>
                          </div>
                          <span className="font-semibold">₹{c.rate}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={handleBookCourier}
                      disabled={bookingCourier || !selectedCourier || !!awbNo}
                    >
                      {bookingCourier ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Booking...</>
                      ) : awbNo ? (
                        <>✓ Booked</>
                      ) : (
                        <><Truck className="h-3.5 w-3.5 mr-1.5" /> Book Courier (₹{shippingCost})</>
                      )}
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t">
                  <div>
                    <Label className="text-xs">Courier Name <span className="text-destructive">*</span></Label>
                    <Input value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="Auto-filled after booking" />
                  </div>
                  <div>
                    <Label className="text-xs">AWB No. <span className="text-destructive">*</span></Label>
                    <Input value={awbNo} onChange={e => setAwbNo(e.target.value)} placeholder="Auto-filled after booking" />
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label>Payment Method <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className={paymentMethods.length === 0 ? "text-muted-foreground" : ""}>
                      {paymentMethods.length === 0
                        ? "Select payment method(s)"
                        : paymentMethods
                            .map(v => PAYMENT_OPTIONS.find(o => o.value === v)?.label ?? v)
                            .join(" + ")}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                  <div className="space-y-1">
                    {PAYMENT_OPTIONS.map(opt => {
                      const checked = paymentMethods.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setPaymentMethods(prev =>
                                v ? [...prev, opt.value] : prev.filter(p => p !== opt.value)
                              );
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 px-2">Tip: pick multiple to split payment (e.g. Cash + UPI).</p>
                </PopoverContent>
              </Popover>
            </div>
            {paymentMethods.length > 1 && (
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <Label className="text-xs">Amount breakdown <span className="text-destructive">*</span></Label>
                {paymentMethods.map(m => {
                  const label = PAYMENT_OPTIONS.find(o => o.value === m)?.label ?? m;
                  return (
                    <div key={m} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{label}</span>
                      <Input
                        type="number"
                        min={0}
                        value={paymentBreakdown[m] ?? ""}
                        placeholder="0"
                        onChange={e =>
                          setPaymentBreakdown(prev => ({ ...prev, [m]: Number(e.target.value) || 0 }))
                        }
                        className="w-28 text-right"
                      />
                    </div>
                  );
                })}
                {(() => {
                  const sum = paymentMethods.reduce((s, m) => s + (Number(paymentBreakdown[m]) || 0), 0);
                  const target = total - pendingAmount;
                  const diff = target - sum;
                  return (
                    <div className="flex justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">Entered ₹{sum.toFixed(2)} / ₹{target.toFixed(2)}</span>
                      <span className={Math.abs(diff) < 0.5 ? "text-green-600" : "text-destructive"}>
                        {Math.abs(diff) < 0.5 ? "✓ matches" : `Δ ₹${diff.toFixed(2)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
            <div>
              <Label>Sales Employee <span className="text-destructive">*</span></Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent className="z-[9999]">
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="section-title">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax (incl.)</span><span>₹{taxAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Item Discounts</span><span>-₹{cart.reduce((s, i) => s + i.item_discount, 0).toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Extra Discount</span>
              <Input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-24 text-right" />
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-muted-foreground">Pending Amount</span>
              <Input
                type="number"
                min={0}
                max={total}
                value={pendingAmount}
                onChange={e => setPendingAmount(Math.min(Number(e.target.value) || 0, total))}
                className="w-28 text-right"
              />
            </div>
            <Button variant="secondary" className="w-full mt-3" onClick={() => setShowPreview(true)} disabled={cart.length === 0}>
              <Eye className="h-4 w-4 mr-2" /> Preview Invoice
            </Button>
            <Button className="w-full" onClick={handleCreateInvoice} disabled={cart.length === 0 || creatingInvoice}>
              {creatingInvoice ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create Invoice"}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleHoldInvoice} disabled={cart.length === 0 || creatingInvoice}>
              <PauseCircle className="h-4 w-4 mr-2" /> Hold Invoice
            </Button>

            {lastInvoice && (
              <div className="mt-3 p-3 rounded-lg border border-green-200 bg-green-50 space-y-2">
                <p className="text-xs font-medium text-green-800">
                  ✅ Invoice {lastInvoice.invoice_number} created
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(getInvoiceUrl(lastInvoice.id), "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleSendWhatsApp}
                    disabled={sendingWhatsApp || !lastInvoice.customerMobile}
                  >
                    {sendingWhatsApp ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-1" />
                    )}
                    Send WhatsApp
                  </Button>
                </div>
                {!lastInvoice.customerMobile && (
                  <p className="text-xs text-amber-600">Enter customer mobile to send via WhatsApp</p>
                )}
                {lastInvoice.customerMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleSendGroupInvite}
                    disabled={sendingGroupInvite || groupInviteSent}
                  >
                    {sendingGroupInvite ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-1" />
                    )}
                    {groupInviteSent ? "Group invite sent ✓" : "Send WhatsApp group invite"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    <InvoicePreviewDialog
      open={showPreview}
      onClose={() => setShowPreview(false)}
      storeId={storeId}
      cart={cart}
      customerName={customerName}
      customerMobile={customerMobile}
      paymentMethod={paymentMethods.join("+")}
      subtotal={subtotal}
      taxAmount={taxAmount}
      discount={discount}
      total={total}
    />
    </div>
  );
}
