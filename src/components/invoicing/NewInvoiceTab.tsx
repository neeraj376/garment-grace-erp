import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, FileText, MessageCircle, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  original_price: number;
  tax_rate: number;
  item_discount: number;
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

interface Props {
  storeId: string | null;
  userId: string | undefined;
}

const DRAFT_KEY = "invoice_draft";

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
  const [source, setSource] = useState(() => loadDraft()?.source ?? "offline");
  const [paymentMethod, setPaymentMethod] = useState(() => loadDraft()?.paymentMethod ?? "cash");
  const [selectedEmployee, setSelectedEmployee] = useState(() => loadDraft()?.selectedEmployee ?? "");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [discount, setDiscount] = useState(() => loadDraft()?.discount ?? 0);
  const [searchProduct, setSearchProduct] = useState("");
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string; total: number; customerMobile: string; customerName: string } | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

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
        .select("id, mobile, name, gender, location")
        .eq("store_id", storeId)
        .ilike("mobile", `%${customerMobile}%`)
        .limit(5);
      setCustomerSuggestions(data ?? []);
      setShowCustomerSuggestions((data ?? []).length > 0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerMobile, storeId]);

  const selectCustomerSuggestion = (cust: any) => {
    setCustomerMobile(cust.mobile);
    setCustomerName(cust.name || "");
    setCustomerGender(cust.gender || "");
    setCustomerLocation(cust.location || "");
    setShowCustomerSuggestions(false);
  };

  // Persist draft to localStorage
  useEffect(() => {
    saveDraft({
      cart, customerMobile, customerName, customerGender, customerLocation,
      source, paymentMethod, selectedEmployee, discount,
    });
  }, [cart, customerMobile, customerName, customerGender, customerLocation, source, paymentMethod, selectedEmployee, discount]);

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
          .select("id, sku, name, selling_price, tax_rate, category")
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
    supabase
      .from("employees")
      .select("id, name, role")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .then(({ data }) => setEmployees((data as Employee[]) ?? []));
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
    if (!storeId || !userId || cart.length === 0) {
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
    try {
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
          payment_method: paymentMethod,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discount,
          total_amount: total,
          created_by: userId,
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

      await supabase.from("invoice_items").insert(items);

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
      setCart([]);
      setDiscount(0);
      setCustomerMobile("");
      setCustomerName("");
      setCustomerGender("");
      setCustomerLocation("");
      setSelectedEmployee("");
      clearDraft();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getInvoiceUrl = (invoiceId: string) => {
    return `${window.location.origin}/invoice/${invoiceId}`;
  };

  const getInvoiceShareUrl = (invoiceId: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/invoice-og/${invoiceId}`;
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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchProduct.toLowerCase())
  );

  return (
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
              <div className="border rounded-lg max-h-40 overflow-y-auto mb-3">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between"
                  >
                    <span>{p.name} <span className="text-muted-foreground">({p.sku})</span></span>
                    <span className="flex items-center gap-2">
                      {p.category && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.category}</span>}
                      <span className="text-xs font-medium text-muted-foreground">Stock: {p._stock}</span>
                      <span className="font-medium">₹{Number(p.selling_price).toLocaleString("en-IN")}</span>
                    </span>
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
            <div><Label>Name <span className="text-destructive">*</span></Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
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
            <div>
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Offline (Walk-in)</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Button className="w-full mt-3" onClick={handleCreateInvoice} disabled={cart.length === 0}>
              Create Invoice
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
