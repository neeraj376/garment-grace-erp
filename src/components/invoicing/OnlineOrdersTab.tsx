import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Search, Package, ChevronDown, ChevronUp, Printer, Truck, Save, Trash2, Pencil, FileText, MessageCircle, Mail } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EditOnlineOrderDialog from "./EditOnlineOrderDialog";
import OrderInvoiceDialog from "./OrderInvoiceDialog";

interface OnlineOrdersTabProps {
  storeId: string | null;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "all", label: "All Payment" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
];

const ORDER_STATUS_FLOW = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

const statusColor = (status: string) => {
  switch (status) {
    case "confirmed": return "default";
    case "shipped": return "secondary";
    case "delivered": return "default";
    case "cancelled": return "destructive";
    case "pending": return "outline";
    default: return "outline";
  }
};

const paymentColor = (status: string) => {
  switch (status) {
    case "paid": return "default";
    case "failed": return "destructive";
    case "pending": return "outline";
    default: return "outline";
  }
};

export default function OnlineOrdersTab({ storeId }: OnlineOrdersTabProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [fullEditOrder, setFullEditOrder] = useState<any>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editAwb, setEditAwb] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState<"wa" | "email" | null>(null);
  const [labelOrder, setLabelOrder] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["online-orders", storeId, statusFilter, paymentFilter],
    queryFn: async () => {
      if (!storeId) return [];
      let query = supabase
        .from("orders")
        .select(`
          *,
          order_items (
            id, product_id, quantity, unit_price, tax_amount, total,
            products:product_id ( name, sku, photo_url, tax_rate )
          ),
          shipping_addresses:shipping_address_id ( name, phone, address_line1, address_line2, city, state, pincode ),
          shop_customers:customer_id ( name, phone, email )
        `)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (paymentFilter !== "all") query = query.eq("payment_status", paymentFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!storeId,
  });

  const filtered = (orders || []).filter((o: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const addr = o.shipping_addresses;
    return (
      o.order_number?.toLowerCase().includes(s) ||
      addr?.name?.toLowerCase().includes(s) ||
      addr?.phone?.includes(s) ||
      o.tracking_number?.toLowerCase().includes(s)
    );
  });

  const handleOpenEdit = (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOrder(order);
    setEditStatus(order.status);
    setEditAwb(order.tracking_number || "");
    setEditCourier(order.courier_name || "");
  };

  const handleSaveOrder = async () => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      const newAwb = editAwb.trim();
      const newCourier = editCourier.trim();
      const prevAwb = editingOrder.tracking_number || "";
      const prevCourier = editingOrder.courier_name || "";

      const updates: any = { status: editStatus };
      if (newAwb) updates.tracking_number = newAwb;
      updates.courier_name = newCourier || null;

      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", editingOrder.id);

      if (error) throw error;
      toast.success("Order updated");

      // If courier + AWB are set and either changed, send WhatsApp tracking notification
      const changed = newAwb !== prevAwb || newCourier !== prevCourier;
      if (newAwb && newCourier && changed) {
        const phone =
          editingOrder.shipping_addresses?.phone ||
          editingOrder.shop_customers?.phone ||
          null;
        const customerName =
          editingOrder.shipping_addresses?.name ||
          editingOrder.shop_customers?.name ||
          "Customer";
        if (phone) {
          try {
            const { data: waData, error: waErr } = await supabase.functions.invoke(
              "send-whatsapp-invoice",
              {
                body: {
                  templateName: "order_tracking_details",
                  phone,
                  customerName,
                  invoiceNumber: editingOrder.order_number,
                  courierName: newCourier,
                  awbNo: newAwb,
                },
              }
            );
            if (waErr || waData?.success === false) {
              toast.error(
                `Tracking saved, but WhatsApp failed: ${waErr?.message || waData?.error || "Unknown error"}`
              );
            } else {
              toast.success(`Tracking notification sent to ${phone}`);
            }
          } catch (waErr: any) {
            toast.error(`Tracking saved, but WhatsApp failed: ${waErr?.message || "Unknown"}`);
          }
        } else {
          toast.message("No customer phone on file — skipped WhatsApp notification");
        }
      } else if ((newAwb || newCourier) && !(newAwb && newCourier)) {
        toast.message("Add both Courier and AWB to send a tracking WhatsApp.");
      }

      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
      setEditingOrder(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const buildTrackingUrl = (courier: string, awb: string) => {
    const c = (courier || "").toLowerCase();
    const a = encodeURIComponent(awb || "");
    if (!a) return "";
    if (c.includes("delhivery")) return `https://www.delhivery.com/track-v2/package/${a}`;
    if (c.includes("bluedart")) return `https://www.bluedart.com/tracking?trackingNumber=${a}`;
    if (c.includes("dtdc")) return `https://www.dtdc.in/trace.asp?strCnno=${a}`;
    if (c.includes("ekart") || c.includes("ecom")) return `https://ekartlogistics.com/shipmenttrack/${a}`;
    if (c.includes("xpressbees")) return `https://www.xpressbees.com/track?awb=${a}`;
    if (c.includes("shadowfax")) return `https://shadowfax.in/tracking/?awb=${a}`;
    return `https://shiprocket.co/tracking/${a}`;
  };

  const handleResendWhatsApp = async () => {
    if (!editingOrder) return;
    const courier = editCourier.trim() || editingOrder.courier_name || "";
    const awb = editAwb.trim() || editingOrder.tracking_number || "";
    if (!courier || !awb) { toast.error("Courier and AWB are required to send tracking."); return; }
    const phone = editingOrder.shipping_addresses?.phone || editingOrder.shop_customers?.phone || null;
    if (!phone) { toast.error("No customer phone on file."); return; }
    const customerName = editingOrder.shipping_addresses?.name || editingOrder.shop_customers?.name || "Customer";
    setResending("wa");
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-invoice", {
        body: {
          templateName: "order_tracking_details",
          phone,
          customerName,
          invoiceNumber: editingOrder.order_number,
          courierName: courier,
          awbNo: awb,
        },
      });
      if (error || data?.success === false) {
        toast.error(`WhatsApp failed: ${error?.message || data?.error || "Unknown error"}`);
      } else {
        toast.success(`WhatsApp tracking re-sent to ${phone}`);
      }
    } catch (err: any) {
      toast.error(`WhatsApp failed: ${err?.message || "Unknown"}`);
    } finally {
      setResending(null);
    }
  };

  const handleSendEmail = async () => {
    if (!editingOrder) return;
    const courier = editCourier.trim() || editingOrder.courier_name || "";
    const awb = editAwb.trim() || editingOrder.tracking_number || "";
    if (!courier || !awb) { toast.error("Courier and AWB are required to send tracking."); return; }
    const email = editingOrder.shop_customers?.email;
    if (!email) { toast.error("No customer email on file."); return; }
    const customerName = editingOrder.shipping_addresses?.name || editingOrder.shop_customers?.name || "Customer";
    setResending("email");
    try {
      const { data, error } = await supabase.functions.invoke("send-tracking-email", {
        body: {
          to: email,
          customerName,
          orderNumber: editingOrder.order_number,
          courierName: courier,
          awbNo: awb,
          trackingUrl: buildTrackingUrl(courier, awb),
        },
      });
      if (error || data?.success === false) {
        toast.error(`Email failed: ${error?.message || data?.error || "Unknown error"}`);
      } else {
        toast.success(`Tracking email sent to ${email}`);
      }
    } catch (err: any) {
      toast.error(`Email failed: ${err?.message || "Unknown"}`);
    } finally {
      setResending(null);
    }
  };

  const handlePrintLabel = (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setLabelOrder(order);
    setTimeout(() => {
      const content = labelRef.current;
      if (!content) return;
      const printWindow = window.open("", "_blank", "width=500,height=700");
      if (!printWindow) {
        toast.error("Please allow popups to print labels");
        return;
      }
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shipping Label — ${order.order_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 24px; }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        printWindow.close();
        setLabelOrder(null);
      }, 500);
    }, 100);
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o: any) => o.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error: itemsErr } = await supabase
        .from("order_items")
        .delete()
        .in("order_id", ids);
      if (itemsErr) throw itemsErr;

      const { error: ordersErr } = await supabase
        .from("orders")
        .delete()
        .in("id", ids);
      if (ordersErr) throw ordersErr;

      toast.success(`${ids.length} order(s) deleted`);
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete orders");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order #, name, phone, or AWB..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Orders", value: filtered.length },
          { label: "Paid", value: filtered.filter((o: any) => o.payment_status === "paid").length },
          { label: "Pending Payment", value: filtered.filter((o: any) => o.payment_status === "pending").length },
          {
            label: "Revenue",
            value: `₹${filtered
              .filter((o: any) => o.payment_status === "paid")
              .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0)
              .toLocaleString("en-IN")}`,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} order(s) selected</span>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Orders table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No orders found</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AWB / Courier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order: any) => {
                const addr = order.shipping_addresses;
                const isExpanded = expandedOrder === order.id;
                return (
                  <>
                    <TableRow
                      key={order.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(order.id) ? "bg-muted/40" : ""}`}
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                      </TableCell>
                      <TableCell>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(order.created_at), "dd MMM yy, h:mm a")}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{addr?.name || order.shop_customers?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{addr?.phone || order.shop_customers?.phone || ""}</div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ₹{Number(order.total_amount).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentColor(order.payment_status) as any}>
                          {order.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor(order.status) as any}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.tracking_number ? (
                          <div>
                            <div className="font-mono text-xs">AWB: {order.tracking_number}</div>
                            {order.courier_name && (
                              <div className="text-[11px] text-muted-foreground">{order.courier_name}</div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono text-xs text-muted-foreground">AWB: —</div>
                            {order.courier_name && (
                              <div className="text-[11px] text-muted-foreground">{order.courier_name}</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit Order"
                            onClick={(e) => { e.stopPropagation(); setFullEditOrder(order); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="View Invoice"
                            onClick={(e) => { e.stopPropagation(); setInvoiceOrder(order); }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Quick Status / AWB"
                            onClick={(e) => handleOpenEdit(order, e)}
                          >
                            <Truck className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Print Shipping Label"
                            onClick={(e) => handlePrintLabel(order, e)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${order.id}-details`}>
                        <TableCell colSpan={10} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Items */}
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Order Items</h4>
                              <div className="space-y-1.5">
                                {(order.order_items || []).map((item: any) => (
                                  <div key={item.id} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">
                                      {item.products?.name || item.product_id} × {item.quantity}
                                    </span>
                                    <span className="font-medium">
                                      ₹{Number(item.total).toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                ))}
                                <div className="border-t pt-1 mt-1 flex justify-between text-sm">
                                  <span className="text-muted-foreground">Shipping</span>
                                  <span>₹{Number(order.shipping_amount || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold">
                                  <span>Total</span>
                                  <span>₹{Number(order.total_amount).toLocaleString("en-IN")}</span>
                                </div>
                              </div>
                            </div>
                            {/* Shipping */}
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Shipping Address</h4>
                              {addr ? (
                                <div className="text-sm text-muted-foreground space-y-0.5">
                                  <p>{addr.name} — {addr.phone}</p>
                                  <p>{addr.address_line1}</p>
                                  {addr.address_line2 && <p>{addr.address_line2}</p>}
                                  <p>{addr.city}, {addr.state} — {addr.pincode}</p>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No address on file</p>
                              )}
                              {order.tracking_number && (
                                <div className="mt-3">
                                  <p className="text-xs text-muted-foreground">AWB / Tracking #</p>
                                  <p className="text-sm font-mono">{order.tracking_number}</p>
                                </div>
                              )}
                              {order.payment_id && (
                                <div className="mt-2">
                                  <p className="text-xs text-muted-foreground">Payment ID</p>
                                  <p className="text-sm font-mono">{order.payment_id}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Status / AWB Dialog */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Order — {editingOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Order Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_FLOW.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Courier Name</Label>
              <Input
                value={editCourier}
                onChange={(e) => setEditCourier(e.target.value)}
                placeholder="e.g. Delhivery, Bluedart"
              />
            </div>
            <div className="space-y-2">
              <Label>AWB / Tracking Number</Label>
              <Input
                value={editAwb}
                onChange={(e) => setEditAwb(e.target.value)}
                placeholder="Enter AWB or tracking number"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When both Courier and AWB are filled (or changed), a WhatsApp tracking
              update is sent automatically to the customer.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)}>Cancel</Button>
            <Button onClick={handleSaveOrder} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden printable shipping label */}
      {labelOrder && (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <div ref={labelRef}>
            <ShippingLabel order={labelOrder} />
          </div>
        </div>
      )}

      {/* Full edit dialog */}
      <EditOnlineOrderDialog
        order={fullEditOrder}
        onClose={() => setFullEditOrder(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["online-orders"] })}
      />

      {/* Invoice view dialog */}
      <OrderInvoiceDialog order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete {selectedIds.size} order(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All selected orders and their items will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShippingLabel({ order }: { order: any }) {
  const addr = order.shipping_addresses;
  const cust = order.shop_customers;
  const name = addr?.name || cust?.name || "—";
  const phone = addr?.phone || cust?.phone || "—";
  return (
    <div style={{ width: "400px", border: "2px solid #000", padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>SHIPPING LABEL</h2>
        <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>Order: {order.order_number}</p>
        <p style={{ fontSize: "11px", color: "#666" }}>{format(new Date(order.created_at), "dd MMM yyyy")}</p>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <p style={{ fontSize: "11px", fontWeight: "bold", color: "#666", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
          Deliver To:
        </p>
        <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 4px 0" }}>{name}</p>
        <p style={{ fontSize: "14px", margin: "0 0 2px 0" }}>📞 {phone}</p>
      </div>

      <div style={{ marginBottom: "16px", padding: "10px", background: "#f5f5f5", borderRadius: "4px" }}>
        <p style={{ fontSize: "13px", margin: "0 0 2px 0" }}>{addr?.address_line1 || ""}</p>
        {addr?.address_line2 && <p style={{ fontSize: "13px", margin: "0 0 2px 0" }}>{addr.address_line2}</p>}
        <p style={{ fontSize: "13px", fontWeight: "bold", margin: "4px 0 0 0" }}>
          {addr?.city}, {addr?.state} — {addr?.pincode}
        </p>
      </div>

      {order.tracking_number && (
        <div style={{ borderTop: "1px dashed #ccc", paddingTop: "12px", marginTop: "12px" }}>
          <p style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>AWB / Tracking Number:</p>
          <p style={{ fontSize: "16px", fontWeight: "bold", fontFamily: "monospace", letterSpacing: "1px" }}>
            {order.tracking_number}
          </p>
        </div>
      )}

      {order.courier_name && (
        <div style={{ marginTop: "8px" }}>
          <p style={{ fontSize: "11px", color: "#666" }}>Courier: <strong>{order.courier_name}</strong></p>
        </div>
      )}

      <div style={{ borderTop: "1px dashed #ccc", paddingTop: "10px", marginTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span>Payment: <strong>{order.payment_status}</strong></span>
        <span>Total: <strong>₹{Number(order.total_amount).toLocaleString("en-IN")}</strong></span>
      </div>
    </div>
  );
}
