import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
  payment_method: string;
  source: string;
  courier_name?: string | null;
  awb_no?: string | null;
  status: string;
  notes: string | null;
  pending_amount?: number;
  created_by: string | null;
  customer_id: string | null;
  customers: { name: string | null; mobile: string } | null;
}

interface InvoiceItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_amount: number;
  total: number;
  product_name?: string;
  product_sku?: string;
  tax_rate?: number;
  isNew?: boolean;
}

interface Props {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditInvoiceDialog({ invoice, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Invoice fields
  const [paymentMethod, setPaymentMethod] = useState(invoice.payment_method);
  const [source, setSource] = useState(invoice.source);
  const [courierName, setCourierName] = useState(invoice.courier_name || "");
  const [awbNo, setAwbNo] = useState(invoice.awb_no || "");
  const [status, setStatus] = useState(invoice.status);
  const [notes, setNotes] = useState(invoice.notes || "");
  const [discountAmount, setDiscountAmount] = useState(String(invoice.discount_amount));
  const [pendingAmount, setPendingAmount] = useState(String(invoice.pending_amount ?? 0));
  const [selectedEmployee, setSelectedEmployee] = useState("");

  // Customer fields
  const [customerMobile, setCustomerMobile] = useState(invoice.customers?.mobile || "");
  const [customerName, setCustomerName] = useState(invoice.customers?.name || "");

  // Items
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);

  // Product search for adding new items
  const [searchProduct, setSearchProduct] = useState("");
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      setLoading(true);

      // Fetch invoice items with product details
      const { data: itemsData } = await supabase
        .from("invoice_items")
        .select("id, product_id, quantity, unit_price, discount, tax_amount, total")
        .eq("invoice_id", invoice.id);

      if (itemsData) {
        // Fetch product names
        const productIds = [...new Set(itemsData.map(i => i.product_id))];
        const { data: products } = await supabase
          .from("products")
          .select("id, name, sku, tax_rate")
          .in("id", productIds);

        const productMap: Record<string, any> = {};
        (products || []).forEach(p => { productMap[p.id] = p; });

        setItems(itemsData.map(i => ({
          ...i,
          product_name: productMap[i.product_id]?.name || "Unknown",
          product_sku: productMap[i.product_id]?.sku || "",
          tax_rate: productMap[i.product_id]?.tax_rate || 5,
        })));
      }

      // Fetch employee for this invoice
      const { data: inv } = await supabase
        .from("invoices")
        .select("employee_id, store_id")
        .eq("id", invoice.id)
        .single();

      if (inv?.store_id) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, name, role")
          .eq("store_id", inv.store_id)
          .eq("is_active", true);
        setEmployees(emps || []);

        // Fetch in-stock products for adding new items
        const { data: inStockIds } = await supabase.rpc("get_in_stock_product_ids", { p_store_id: inv.store_id });
        if (inStockIds && inStockIds.length > 0) {
          let allProds: any[] = [];
          const batchSize = 200;
          for (let i = 0; i < inStockIds.length; i += batchSize) {
            const idBatch = inStockIds.slice(i, i + batchSize);
            const { data } = await supabase
              .from("products")
              .select("id, sku, name, selling_price, tax_rate, category, subcategory, color, size")
              .eq("store_id", inv.store_id)
              .eq("is_active", true)
              .in("id", idBatch);
            if (data) allProds = allProds.concat(data);
          }
          setAvailableProducts(allProds);
        }
      }
      setSelectedEmployee(inv?.employee_id || "none");

      setLoading(false);
    };
    fetchData();
  }, [open, invoice.id]);

  const recalcItemTotal = (item: InvoiceItem) => {
    const gross = item.unit_price * item.quantity;
    const total = gross - item.discount;
    const taxRate = item.tax_rate || 5;
    const priceExclTax = total / (1 + taxRate / 100);
    const taxAmount = total - priceExclTax;
    return { total, tax_amount: parseFloat(taxAmount.toFixed(2)) };
  };

  const updateItem = (idx: number, field: string, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      const { total, tax_amount } = recalcItemTotal(updated);
      return { ...updated, total, tax_amount };
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addProductToInvoice = (product: any) => {
    const existing = items.find(i => i.product_id === product.id);
    if (existing) {
      const idx = items.indexOf(existing);
      updateItem(idx, "quantity", existing.quantity + 1);
    } else {
      const price = Number(product.selling_price);
      const taxRate = Number(product.tax_rate) || 5;
      const priceExclTax = price / (1 + taxRate / 100);
      const taxAmount = price - priceExclTax;
      setItems(prev => [...prev, {
        id: `new_${Date.now()}`,
        product_id: product.id,
        quantity: 1,
        unit_price: price,
        discount: 0,
        tax_amount: parseFloat(taxAmount.toFixed(2)),
        total: price,
        product_name: product.name,
        product_sku: product.sku,
        tax_rate: taxRate,
        isNew: true,
      }]);
    }
    setSearchProduct("");
  };

  const filteredProducts = availableProducts.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchProduct.toLowerCase())
  );

  const itemsSubtotal = items.reduce((s, i) => {
    const priceExclTax = i.total / (1 + (i.tax_rate || 5) / 100);
    return s + priceExclTax;
  }, 0);
  const itemsTax = items.reduce((s, i) => s + i.tax_amount, 0);
  const grandTotal = items.reduce((s, i) => s + i.total, 0) - (Number(discountAmount) || 0);

  const handleSave = async () => {
    if (items.length === 0) {
      toast({ title: "Error", description: "Invoice must have at least one item", variant: "destructive" });
      return;
    }
    if (!customerMobile.trim()) {
      toast({ title: "Error", description: "Customer mobile is required", variant: "destructive" });
      return;
    }
    if (!customerName.trim()) {
      toast({ title: "Error", description: "Customer name is required", variant: "destructive" });
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

    setSaving(true);
    try {
      // Update customer if linked
      if (invoice.customer_id) {
        await supabase
          .from("customers")
          .update({ name: customerName, mobile: customerMobile })
          .eq("id", invoice.customer_id);
      }

      // Update invoice
      const { error } = await supabase
        .from("invoices")
        .update({
          payment_method: paymentMethod,
          source,
          courier_name: source === "online" ? courierName.trim() : null,
          awb_no: source === "online" ? awbNo.trim() : null,
          status,
          notes: notes || null,
          discount_amount: Number(discountAmount) || 0,
          pending_amount: Number(pendingAmount) || 0,
          subtotal: parseFloat(itemsSubtotal.toFixed(2)),
          tax_amount: parseFloat(itemsTax.toFixed(2)),
          total_amount: parseFloat(grandTotal.toFixed(2)),
          employee_id: (selectedEmployee && selectedEmployee !== "none") ? selectedEmployee : null,
        })
        .eq("id", invoice.id);

      if (error) throw error;

      // Update existing items and insert new ones
      for (const item of items) {
        if (item.isNew) {
          await supabase
            .from("invoice_items")
            .insert({
              invoice_id: invoice.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount: item.discount,
              tax_amount: item.tax_amount,
              total: item.total,
            });
        } else {
          await supabase
            .from("invoice_items")
            .update({
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount: item.discount,
              tax_amount: item.tax_amount,
              total: item.total,
            })
            .eq("id", item.id);
        }
      }

      toast({ title: "Invoice updated successfully" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Customer Section */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mobile <span className="text-destructive">*</span></Label>
                <Input value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offline">Offline (Walk-in)</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {source === "online" && (
                <>
                  <div className="space-y-1">
                    <Label>Courier Name <span className="text-destructive">*</span></Label>
                    <Input value={courierName} onChange={e => setCourierName(e.target.value)} placeholder="Courier partner" />
                  </div>
                  <div className="space-y-1">
                    <Label>AWB No. <span className="text-destructive">*</span></Label>
                    <Input value={awbNo} onChange={e => setAwbNo(e.target.value)} placeholder="Tracking / AWB number" />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="partially_returned">Partial Return</SelectItem>
                    <SelectItem value="fully_returned">Fully Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sales Employee</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Add Product Search */}
            <div>
              <Label className="mb-2 block">Add Product</Label>
              <div className="relative">
                <Input
                  placeholder="Search products by name or SKU to add..."
                  value={searchProduct}
                  onChange={e => setSearchProduct(e.target.value)}
                  className="mb-1"
                />
                <Plus className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              {searchProduct && filteredProducts.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto mb-2 bg-background shadow-md">
                  {filteredProducts.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      onClick={() => addProductToInvoice(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{p.name} <span className="text-muted-foreground">({p.sku})</span></span>
                        <span className="font-semibold">₹{Number(p.selling_price).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {p.category && <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{p.category}</span>}
                        {p.subcategory && <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{p.subcategory}</span>}
                        {p.color && <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{p.color}</span>}
                        {p.size && <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{p.size}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchProduct && filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground mb-2">No matching products found</p>
              )}
            </div>

            {/* Items Table */}
            <div>
              <Label className="mb-2 block">Invoice Items</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center w-20">Qty</TableHead>
                    <TableHead className="text-right w-24">Price</TableHead>
                    <TableHead className="text-right w-24">Disc (₹)</TableHead>
                    <TableHead className="text-right w-24">Total</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.product_sku}
                          {item.isNew && <span className="ml-1 text-primary font-medium">(new)</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="w-16 mx-auto text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={e => updateItem(idx, "unit_price", Number(e.target.value) || 0)}
                          className="w-20 ml-auto text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.discount}
                          onChange={e => updateItem(idx, "discount", Number(e.target.value) || 0)}
                          className="w-20 ml-auto text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{item.total.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length <= 1}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span>₹{itemsSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax (incl.)</span><span>₹{itemsTax.toFixed(2)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Extra Discount</span>
                <Input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-24 text-right" min="0" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Pending Amount</span>
                <Input type="number" value={pendingAmount} onChange={e => setPendingAmount(e.target.value)} className="w-24 text-right" min="0" />
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>Total</span>
                <span>₹{grandTotal.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes..." rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
