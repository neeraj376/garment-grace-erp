import { useEffect, useState, useCallback, useRef, useDeferredValue, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, FileText, MessageCircle, Loader2, ExternalLink, PauseCircle, PlayCircle, X, Eye, ChevronDown, Truck, CheckCircle, XCircle, ScanLine, Printer } from "lucide-react";
import InvoicePreviewDialog from "./InvoicePreviewDialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";


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

interface ProductSearchItem {
  id: string;
  sku?: string | null;
  name?: string | null;
  selling_price?: number | string | null;
  tax_rate?: number | string | null;
  category?: string | null;
  subcategory?: string | null;
  color?: string | null;
  size?: string | null;
  brand?: string | null;
  _stock?: number;
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
  deliveryCost?: string;
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

function filterProductMatches(products: ProductSearchItem[], query: string, limit = 50) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const matches: ProductSearchItem[] = [];
  for (const p of products) {
    const searchableText = [
      p.name, p.sku, p.category, p.subcategory, p.color, p.size, p.brand
    ].filter(Boolean).join(' ').toLowerCase();

    if (words.every(word => searchableText.includes(word))) {
      matches.push(p);
      if (matches.length >= limit) break;
    }
  }

  return matches;
}

function extractScanCode(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const param = url.searchParams.get("sku") || url.searchParams.get("code") || url.searchParams.get("barcode") || url.searchParams.get("qr");
    if (param) return param.trim();
    const lastPathPart = url.pathname.split("/").filter(Boolean).pop();
    if (lastPathPart) return decodeURIComponent(lastPathPart).trim();
  } catch {}

  const match = raw.match(/(?:sku|code|barcode|qr)=([^&\s]+)/i);
  return decodeURIComponent(match?.[1] ?? raw).trim();
}

function getSkuLookupCandidates(code: string) {
  const cleaned = code.trim();
  const candidates = new Set<string>();
  if (!cleaned) return [];

  candidates.add(cleaned);

  if (/^KU-/i.test(cleaned)) {
    candidates.add(cleaned.replace(/^KU-/i, "SKU-"));
  }

  if (/^SKU-/i.test(cleaned)) {
    candidates.add(cleaned.replace(/^SKU-/i, "KU-"));
  }

  const digits = cleaned.match(/\d{8,}/)?.[0];
  if (digits) {
    candidates.add(digits);
    candidates.add(`SKU-${digits}`);
    candidates.add(`KU-${digits}`);
  }

  return [...candidates];
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
  const [deliveryCost, setDeliveryCost] = useState(() => loadDraft()?.deliveryCost ?? "");
  const [source, setSource] = useState<string>("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<Record<string, number>>({});
  const [selectedEmployee, setSelectedEmployee] = useState(() => loadDraft()?.selectedEmployee ?? "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [discount, setDiscount] = useState(() => loadDraft()?.discount ?? 0);
  const [pendingAmount, setPendingAmount] = useState(() => loadDraft()?.pendingAmount ?? 0);
  const [searchProduct, setSearchProduct] = useState("");
  const deferredSearchProduct = useDeferredValue(searchProduct);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string; total: number; customerMobile: string; customerName: string; source: string; shipping?: { name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string } } | null>(null);
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
  const [storefrontPricing, setStorefrontPricing] = useState<boolean>(() => loadDraft()?.storefrontPricing ?? false);

  const STOREFRONT_MARKUP = 1.12;

  // Shipping (online source) state
  const [addressLine1, setAddressLine1] = useState(() => loadDraft()?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(() => loadDraft()?.addressLine2 ?? "");
  const [shipCity, setShipCity] = useState(() => loadDraft()?.shipCity ?? "");
  const [shipState, setShipState] = useState(() => loadDraft()?.shipState ?? "");
  const [shipPincode, setShipPincode] = useState(() => loadDraft()?.shipPincode ?? "");
  const [checkingPincode, setCheckingPincode] = useState(false);
  const [serviceable, setServiceable] = useState<boolean | null>(null);

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
      courierName, awbNo, deliveryCost, source, paymentMethods, selectedEmployee, discount, pendingAmount,
      addressLine1, addressLine2, shipCity, shipState, shipPincode, storefrontPricing,
    });
  }, [cart, customerMobile, customerName, customerGender, customerLocation, customerEmail, courierName, awbNo, deliveryCost, source, paymentMethods, selectedEmployee, discount, pendingAmount, addressLine1, addressLine2, shipCity, shipState, shipPincode, storefrontPricing]);

  const handleToggleStorefrontPricing = (checked: boolean) => {
    setStorefrontPricing(checked);
    setCart(prev => prev.map(item => ({
      ...item,
      unit_price: checked
        ? Math.round(item.original_price * STOREFRONT_MARKUP)
        : item.original_price,
    })));
  };


  useEffect(() => {
    if (!storeId) return;
    // Fetch all in-stock products with computed stock in a single RPC call.
    const fetchAllProducts = async () => {
      const { data, error } = await supabase
        .rpc("get_invoicing_products", { p_store_id: storeId })
        .range(0, 99999);
      if (error) {
        console.error("Failed to fetch invoicing products", error);
        setProducts([]);
        return;
      }
      setProducts((data || []).map((p: any) => ({ ...p, _stock: p.stock ?? 0 })));
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


  useEffect(() => {
    const rawQuery = searchProduct.trim();
    if (!storeId || rawQuery.length < 3) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("search_invoicing_products", {
          p_store_id: storeId,
          p_query: rawQuery,
          p_limit: 20,
        });
        if (cancelled || error || !data || data.length === 0) return;
        const withStock = (data as any[]).map(p => ({ ...p, _stock: p.stock ?? 0 }));
        setProducts(prev => [...prev, ...withStock.filter(p => !prev.some(existing => existing.id === p.id))]);
      } catch (err) {
        console.warn("Product search failed:", err);
      }
    }, 150);


    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [searchProduct, storeId]);




  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }

      const basePrice = Number(product.selling_price);
      const price = storefrontPricing ? Math.round(basePrice * STOREFRONT_MARKUP) : basePrice;
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: price,
        original_price: basePrice,
        tax_rate: Number(product.tax_rate),
        item_discount: 0,
        category: product.category || undefined,
        subcategory: product.subcategory || undefined,
        color: product.color || undefined,
        size: product.size || undefined,
      }];
    });
    setSearchProduct("");
  };

  const lookupAndAddBySku = async (code: string) => {
    const sku = extractScanCode(code);
    if (!sku || !storeId) return;
    const candidates = getSkuLookupCandidates(sku);
    console.log("[scan lookup] raw=", JSON.stringify(code), "sku=", JSON.stringify(sku), "candidates=", candidates);

    const cols = "id, sku, name, selling_price, tax_rate, category, subcategory, color, size, brand";
    let match: any = null;

    // 1) exact case-insensitive match, including common scanner label variants (KU-/SKU-)
    for (const candidate of candidates) {
      const exact = await supabase
        .from("products")
        .select(cols)
        .eq("store_id", storeId)
        .eq("is_active", true)
        .ilike("sku", candidate)
        .maybeSingle();
      if (exact.data) {
        match = exact.data;
        break;
      }
    }

    // 2) fallback: contains (handles trailing chars, variant suffixes, prefix differences)
    if (!match) {
      const escapedTerms = candidates.map(candidate => candidate.replace(/[%_\\]/g, (c) => `\\${c}`));
      const { data: list } = await supabase
        .from("products")
        .select(cols)
        .eq("store_id", storeId)
        .eq("is_active", true)
        .or(escapedTerms.flatMap(term => [`sku.ilike.%${term}%`, `sku.ilike.${term}`]).join(","))
        .limit(5);
      if (list && list.length === 1) {
        match = list[0];
      } else if (list && list.length > 1) {
        toast({ title: "Multiple matches", description: `${list.length} products matched "${sku}"`, variant: "destructive" });
        return;
      }
    }

    if (!match) {
      toast({ title: "No product found", description: sku, variant: "destructive" });
      return;
    }
    const { data: stock } = await supabase.rpc("get_product_stock", { p_product_id: match.id });
    if ((typeof stock === "number" ? stock : 0) <= 0) {
      toast({ title: "Out of stock", description: match.name, variant: "destructive" });
      return;
    }
    addToCart({ ...match, _stock: stock });
    toast({ title: "Added", description: match.name });
  };


  // Global HID barcode scanner listener (Hellett HT410 Lite & similar USB/BT scanners).
  // Scanners stream keystrokes quickly (typically 5-50ms apart) followed by Enter.
  // We capture them even when the search input is not focused, so the user can scan
  // from anywhere on the page. The HT410 Lite emits AT speeds ~80ms in some modes,
  // so we use a generous inter-char gap and an absolute total-time fallback.
  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    let flushTimer: any = null;
    const SCAN_CHAR_GAP_MS = 120;    // generous - HT410 Lite can be slower
    const MIN_SCAN_LENGTH = 3;
    const IDLE_FLUSH_MS = 150;       // if no terminator, flush after idle

    const isBlockingTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      if (tag === "TEXTAREA") return true;
      if (tag === "INPUT") {
        if (node === searchInputRef.current) return false;
        const type = (node as HTMLInputElement).type;
        if (["text", "search", "email", "tel", "number", "password", "url"].includes(type)) return true;
        return false;
      }
      if ((node as any).isContentEditable) return true;
      return false;
    };

    const commit = () => {
      const code = buffer.trim();
      buffer = "";
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (code.length >= MIN_SCAN_LENGTH) {
        console.log("[HID scan] commit:", code);
        setSearchProduct("");
        lookupAndAddBySku(code);
      } else if (code.length) {
        console.log("[HID scan] dropped (too short):", code);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isBlockingTarget(e.target)) return;

      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      // Debug: surface every captured key
      console.log("[HID key]", JSON.stringify(e.key), "gap=", Math.round(gap), "buf=", buffer.length);

      if (e.key === "Enter" || e.key === "Tab") {
        if (buffer.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
        }
        commit();
        return;
      }

      // Reset if too slow between chars (likely human typing)
      if (gap > SCAN_CHAR_GAP_MS) {
        buffer = "";
      }

      if (e.key.length === 1) {
        buffer += e.key;
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(commit, IDLE_FLUSH_MS);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [storeId]);




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
    if (source === "whatsapp") {
      if (!addressLine1.trim()) {
        toast({ title: "Error", description: "Shipping address line 1 is required", variant: "destructive" });
        return;
      }
      if (!shipPincode.trim()) {
        toast({ title: "Error", description: "Shipping pincode is required", variant: "destructive" });
        return;
      }
      if (!shipCity.trim()) {
        toast({ title: "Error", description: "Shipping city is required", variant: "destructive" });
        return;
      }
      if (!shipState) {
        toast({ title: "Error", description: "Shipping state is required", variant: "destructive" });
        return;
      }
      if (!deliveryCost || Number(deliveryCost) <= 0) {
        toast({ title: "Error", description: "Delivery cost is required for online invoices", variant: "destructive" });
        return;
      }
    }
    // Courier name and AWB are optional for online invoices — they can be added later.
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

      // Safeguard: prevent duplicate deduction for paid website orders.
      // If source=online and this customer's phone matches a paid website order in the
      // last 14 days containing any of the same products, warn before creating an invoice
      // — razorpay-verify / payu-verify already deducted stock for that order.
      if (source === "whatsapp" && customerMobile && cart.length > 0) {
        const last10 = customerMobile.replace(/\D/g, "").slice(-10);
        if (last10.length === 10) {
          const cartProductIds = cart.map(i => i.product_id).filter(Boolean);
          const sinceIso = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
          const { data: recentOrders } = await supabase
            .from("orders")
            .select("order_number, created_at, shop_customers!inner(phone), order_items!inner(product_id, quantity)")
            .eq("payment_status", "paid")
            .gte("created_at", sinceIso)
            .in("order_items.product_id", cartProductIds);
          const dup = (recentOrders || []).find((o: any) => {
            const phone = (o.shop_customers?.phone || "").replace(/\D/g, "").slice(-10);
            return phone === last10;
          });
          if (dup) {
            const overlap = (dup.order_items || [])
              .filter((oi: any) => cartProductIds.includes(oi.product_id))
              .map((oi: any) => {
                const c = cart.find(x => x.product_id === oi.product_id);
                return `${c?.name || oi.product_id} (qty ${oi.quantity})`;
              })
              .join(", ");
            const proceed = window.confirm(
              `⚠️ Possible DUPLICATE invoice.\n\n` +
              `Customer ${customerMobile} already has a paid website order ${dup.order_number} ` +
              `(${new Date(dup.created_at).toLocaleDateString()}) containing: ${overlap}.\n\n` +
              `Stock for that order was ALREADY deducted automatically when payment was verified.\n` +
              `Creating this invoice will deduct stock a SECOND time.\n\n` +
              `Click OK only if this is a genuinely separate order. Cancel to abort.`
            );
            if (!proceed) {
              setCreatingInvoice(false);
              return;
            }
          }
        }
      }

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
          courier_name: source === "whatsapp" && courierName.trim() ? courierName.trim() : null,
          awb_no: source === "whatsapp" && awbNo.trim() ? awbNo.trim() : null,
          delivery_cost: source === "whatsapp" ? (Number(deliveryCost) || 0) : 0,
          shipping_name: source === "whatsapp" ? (customerName.trim() || null) : null,
          shipping_phone: source === "whatsapp" ? (customerMobile.trim() || null) : null,
          shipping_address_line1: source === "whatsapp" ? (addressLine1.trim() || null) : null,
          shipping_address_line2: source === "whatsapp" ? (addressLine2.trim() || null) : null,
          shipping_city: source === "whatsapp" ? (shipCity.trim() || null) : null,
          shipping_state: source === "whatsapp" ? (shipState.trim() || null) : null,
          shipping_pincode: source === "whatsapp" ? (shipPincode.trim() || null) : null,
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
      setLastInvoice({
        id: invoice.id, invoice_number: invoiceNumber, total, customerMobile, customerName, source,
        shipping: source === "whatsapp" ? {
          name: customerName.trim(), phone: customerMobile.trim(),
          line1: addressLine1.trim(), line2: addressLine2.trim(),
          city: shipCity.trim(), state: shipState.trim(), pincode: shipPincode.trim(),
        } : undefined,
      });

      // Auto-send tracking email when online + courier + AWB + customer email are present
      if (source === "whatsapp" && courierName.trim() && awbNo.trim() && customerEmail.trim()) {
        const c = courierName.trim().toLowerCase();
        const a = awbNo.trim();
        const trackingUrl =
          c.includes("dtdc") ? `https://www.dtdc.in/tracking/tracking_results.asp?strCnno=${a}` :
          c.includes("bluedart") ? `https://www.bluedart.com/tracking?trackingNumber=${a}` :
          c.includes("delhivery") ? `https://www.delhivery.com/track-v2/package/${a}` :
          c.includes("xpressbees") ? `https://www.xpressbees.com/shipment/tracking?awb=${a}` :
          c.includes("ecom") ? `https://ecomexpress.in/tracking/?awb_field=${a}` :
          c.includes("shadowfax") ? `https://shadowfax.in/tracking/?awb=${a}` :
          `https://shiprocket.co/tracking/${a}`;
        supabase.functions.invoke("send-tracking-email", {
          body: {
            to: customerEmail.trim(),
            customerName: customerName || "Customer",
            orderNumber: invoiceNumber,
            courierName: courierName.trim(),
            awbNo: a,
            trackingUrl,
          },
        }).then(({ error }) => {
          if (error) toast({ title: "Tracking email not sent", description: error.message, variant: "destructive" });
          else toast({ title: "Tracking email sent", description: `Sent to ${customerEmail.trim()}` });
        });
      }
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
      setDeliveryCost("");
      setSelectedEmployee("");
      setSource("");
      setPaymentMethods([]);
      setPaymentBreakdown({});
      setAddressLine1(""); setAddressLine2(""); setShipCity(""); setShipState(""); setShipPincode("");
      setServiceable(null);
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

  const sendAddressLinkForInvoice = async (invoiceId: string, phone: string, email?: string) => {
    const { data, error } = await supabase.functions.invoke("send-address-link", {
      body: { invoice_id: invoiceId, phone, email: email?.trim() || undefined },
    });
    if (error || (data as any)?.error) {
      toast({ title: "Failed to generate link", description: (data as any)?.error || error?.message, variant: "destructive" });
      return null;
    }
    const url = (data as any).url as string;
    const waLink = (data as any).waLink as string | null;
    const waSent = (data as any).waSent as boolean;
    const waStatus = (data as any).waStatus as string | undefined;
    const waError = (data as any).waError as string | null;
    const emailed = (data as any).emailed as boolean;
    try { await navigator.clipboard.writeText(url); } catch {}
    const parts = [
      emailed ? "emailed to customer" : null,
      waSent ? "WhatsApp queued (delivery not confirmed)" : null,
      "copied to clipboard",
    ].filter(Boolean);
    toast({
      title: "Address link ready (valid 12 hours)",
      description: parts.join(", ") + (waError ? `. WhatsApp fallback: ${waError}` : ""),
    });
    // Interakt's API only acknowledges queuing; it can still be rejected later
    // by WhatsApp. Open the prefilled fallback so staff can send it reliably.
    if (waLink && (waStatus === "queued" || !waSent)) window.open(waLink, "_blank");
    return { url, waLink, waSent, waStatus, waError, emailed };
  };

  const handleCreatePendingInvoice = async () => {
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

      // Upsert customer
      let customerId: string | null = null;
      const mobileClean = customerMobile.replace(/\D/g, "");
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id")
        .eq("store_id", storeId)
        .eq("mobile", mobileClean)
        .limit(1);
      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
        await supabase.from("customers").update({
          name: customerName.trim(),
          gender: customerGender,
          location: customerLocation.trim(),
          email: customerEmail.trim() || null,
        }).eq("id", customerId);
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({
            store_id: storeId,
            name: customerName.trim(),
            mobile: mobileClean,
            gender: customerGender,
            location: customerLocation.trim(),
            email: customerEmail.trim() || null,
          })
          .select()
          .single();
        customerId = newCust?.id ?? null;
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          store_id: storeId,
          invoice_number: invoiceNumber,
          customer_id: customerId,
          employee_id: (selectedEmployee && selectedEmployee !== "none") ? selectedEmployee : null,
          source: "whatsapp",
          status: "pending_address",
          courier_name: null,
          awb_no: null,
          delivery_cost: Number(deliveryCost) || 0,
          shipping_name: null,
          shipping_phone: null,
          shipping_address_line1: null,
          shipping_address_line2: null,
          shipping_city: null,
          shipping_state: null,
          shipping_pincode: null,
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

      await sendAddressLinkForInvoice(invoice.id, mobileClean, customerEmail);

      toast({ title: "Draft invoice created", description: `${invoiceNumber} — address link sent. Invoice will be finalized once the customer submits their address.` });
      setLastInvoice({ id: invoice.id, invoice_number: invoiceNumber, total, customerMobile: mobileClean, customerName, source: "whatsapp" });
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
      setDeliveryCost("");
      setSelectedEmployee("");
      setSource("");
      setPaymentMethods([]);
      setPaymentBreakdown({});
      setAddressLine1(""); setAddressLine2(""); setShipCity(""); setShipState(""); setShipPincode("");
      setServiceable(null);
      clearDraft();
    } catch (err: any) {
      showMutationError("Error", err?.message ?? "Could not create draft invoice");
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handlePrintShippingLabel = async () => {
    if (!lastInvoice?.shipping) return;
    try {
      const s = lastInvoice.shipping;
      const fullAddress = [s.line1, s.line2, [s.city, s.state, s.pincode].filter(Boolean).join(", ")]
        .filter(Boolean).join(", ") || "Address not available";
      const border = { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 };
      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
        sections: [{
          properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 240 },
              children: [new TextRun({ text: "Shipping Label", bold: true, size: 32 })],
            }),
            new Paragraph({
              spacing: { before: 120, after: 60 },
              border: { top: border, bottom: border, left: border, right: border },
              children: [new TextRun({ text: `Invoice: ${lastInvoice.invoice_number}`, bold: true, size: 20 })],
            }),
            new Paragraph({ spacing: { after: 40 }, children: [
              new TextRun({ text: "Name: ", bold: true, size: 24 }),
              new TextRun({ text: s.name || "—", size: 24 }),
            ]}),
            new Paragraph({ spacing: { after: 40 }, children: [
              new TextRun({ text: "Mobile: ", bold: true, size: 24 }),
              new TextRun({ text: s.phone || "—", size: 24 }),
            ]}),
            new Paragraph({ spacing: { after: 200 }, children: [
              new TextRun({ text: "Complete Address: ", bold: true, size: 24 }),
              new TextRun({ text: fullAddress, size: 24 }),
            ]}),
            new Paragraph({
              spacing: { before: 60, after: 200 },
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
              children: [
                new TextRun({ text: "Originee Address: ", bold: true, size: 20 }),
                new TextRun({ text: "I132, Sector 50, South City 2, Gurugram 122018", size: 20 }),
              ],
            }),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `shipping-label-${lastInvoice.invoice_number}.docx`);
      toast({ title: "Shipping label generated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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
    setCustomerGender(""); setCustomerLocation(""); setCustomerEmail(""); setCourierName(""); setAwbNo(""); setDeliveryCost(""); setSelectedEmployee("");
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

  const filteredProducts = useMemo(
    () => filterProductMatches(products, deferredSearchProduct),
    [deferredSearchProduct, products]
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={storefrontPricing}
              onCheckedChange={(c) => handleToggleStorefrontPricing(!!c)}
            />
            <span className="font-semibold text-sm">Storefront Originee</span>
          </label>
        </CardContent>
      </Card>

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
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="section-title">Products</CardTitle>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={storefrontPricing}
                  onCheckedChange={(c) => handleToggleStorefrontPricing(!!c)}
                />
                <span className="font-medium">Storefront Originee</span>
                
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or search products to add..."
                value={searchProduct}
                onChange={e => setSearchProduct(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const code = searchProduct.trim();
                  if (!code) return;
                  const currentMatches = filterProductMatches(products, code, 2);
                  if (currentMatches.length === 1) {
                    addToCart(currentMatches[0]);
                    return;
                  }
                  await lookupAndAddBySku(code);
                }}
                autoFocus
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Focus scanner input"
                onClick={() => searchInputRef.current?.focus()}
              >
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
            {searchProduct && (
              <div className="border rounded-lg max-h-60 overflow-y-auto mb-3">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-medium">{p.name} <span className="text-muted-foreground">({p.sku})</span>{p.brand && <span className="text-muted-foreground"> · {p.brand}</span>}</span>
                      <span className="font-semibold whitespace-nowrap ml-2">₹{(storefrontPricing ? Math.round(Number(p.selling_price) * STOREFRONT_MARKUP) : Number(p.selling_price)).toLocaleString("en-IN")}</span>
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
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {source === "whatsapp" && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" /> Shipping Address
                </div>
                <div className="rounded-md bg-background border p-2.5 space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Don&apos;t have the address yet? Create a draft invoice and send the customer a secure link to fill their delivery address (valid 12 hours). The invoice will be finalized automatically once they submit it.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={creatingInvoice}
                    onClick={handleCreatePendingInvoice}
                  >
                    {creatingInvoice ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />}
                    Send Address Link (WhatsApp + Email)
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground">Or enter the address manually below to create the invoice now.</div>
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
                      placeholder="110001"
                      maxLength={6}
                    />
                    {shipPincode.length === 6 && serviceable && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-green-600">
                        <CheckCircle className="h-3 w-3" /> Serviceable
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
                      <SelectContent>
                        {INDIAN_STATES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>


                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t">
                  <div>
                    <Label className="text-xs">Courier Name</Label>
                    <Input value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="Auto-filled after booking" />
                  </div>
                  <div>
                    <Label className="text-xs">AWB No.</Label>
                    <Input value={awbNo} onChange={e => setAwbNo(e.target.value)} placeholder="Auto-filled after booking" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Delivery Cost (₹) {source === "whatsapp" && <span className="text-destructive">*</span>}</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={deliveryCost}
                      onChange={e => setDeliveryCost(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Tracked separately as a shipping expense — not added to invoice revenue.</p>
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
                {lastInvoice.source === "whatsapp" && lastInvoice.shipping && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handlePrintShippingLabel}
                  >
                    <Printer className="h-4 w-4 mr-1" /> Print Shipping Label
                  </Button>
                )}
                {lastInvoice.source === "whatsapp" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => sendAddressLinkForInvoice(lastInvoice.id, lastInvoice.customerMobile)}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" /> Send Address Link (WhatsApp + Email)
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
