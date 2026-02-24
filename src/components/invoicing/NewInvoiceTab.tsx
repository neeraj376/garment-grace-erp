import { useEffect, useState } from "react";
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
  tax_rate: number;
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

export default function NewInvoiceTab({ storeId, userId }: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerGender, setCustomerGender] = useState("");
  const [customerLocation, setCustomerLocation] = useState("");
  const [source, setSource] = useState("offline");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [discount, setDiscount] = useState(0);
  const [searchProduct, setSearchProduct] = useState("");
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string; total: number } | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from("products")
      .select("id, sku, name, selling_price, tax_rate")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .then(({ data }) => setProducts(data ?? []));
  }, [storeId]);

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.product_id === product.id);
    if (existing) {
      setCart(cart.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: Number(product.selling_price),
        tax_rate: Number(product.tax_rate),
      }]);
    }
    setSearchProduct("");
  };

  const subtotal = cart.reduce((s, i) => {
    const priceExclTax = (i.unit_price * i.quantity) / (1 + i.tax_rate / 100);
    return s + priceExclTax;
  }, 0);
  const taxAmount = cart.reduce((s, i) => {
    const lineTotal = i.unit_price * i.quantity;
    const priceExclTax = lineTotal / (1 + i.tax_rate / 100);
    return s + (lineTotal - priceExclTax);
  }, 0);
  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0) - discount;

  const handleCreateInvoice = async () => {
    if (!storeId || !userId || cart.length === 0) return;

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
        const lineTotal = i.unit_price * i.quantity;
        const priceExclTax = lineTotal / (1 + i.tax_rate / 100);
        const lineTax = lineTotal - priceExclTax;
        return {
          invoice_id: invoice.id,
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
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
      setLastInvoice({ id: invoice.id, invoice_number: invoiceNumber, total });
      setCart([]);
      setDiscount(0);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getInvoiceUrl = (invoiceId: string) => {
    return `${window.location.origin}/invoice/${invoiceId}`;
  };

  const handleSendWhatsApp = async () => {
    if (!lastInvoice || !customerMobile) {
      toast({ title: "Error", description: "Customer mobile number is required to send WhatsApp", variant: "destructive" });
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-invoice", {
        body: {
          phone: customerMobile,
          invoiceUrl: getInvoiceUrl(lastInvoice.id),
          customerName: customerName || "Customer",
          invoiceNumber: lastInvoice.invoice_number,
          totalAmount: lastInvoice.total.toLocaleString("en-IN"),
        },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send");

      toast({ title: "WhatsApp sent!", description: `Invoice link sent to ${customerMobile}` });
      setLastInvoice(null);
      setCustomerMobile("");
      setCustomerName("");
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
                    <span className="font-medium">₹{Number(p.selling_price).toLocaleString("en-IN")}</span>
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <FileText className="h-6 w-6 mx-auto mb-2" />
                      Search and add products
                    </TableCell>
                  </TableRow>
                ) : cart.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
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
                    <TableCell className="text-right">₹{item.unit_price.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right font-medium">₹{(item.unit_price * item.quantity).toLocaleString("en-IN")}</TableCell>
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
            <div><Label>Mobile Number</Label><Input value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} placeholder="+91..." /></div>
            <div><Label>Name</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={customerGender} onValueChange={setCustomerGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location</Label><Input value={customerLocation} onChange={e => setCustomerLocation(e.target.value)} /></div>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="section-title">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax (incl.)</span><span>₹{taxAmount.toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Discount</span>
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
                    disabled={sendingWhatsApp || !customerMobile}
                  >
                    {sendingWhatsApp ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-1" />
                    )}
                    Send WhatsApp
                  </Button>
                </div>
                {!customerMobile && (
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
