import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Package, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

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
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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
            products:product_id ( name, sku, photo_url )
          ),
          shipping_addresses:shipping_address_id ( name, phone, address_line1, address_line2, city, state, pincode )
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
      addr?.phone?.includes(s)
    );
  });

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
            placeholder="Search by order #, name, or phone..."
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
                <TableHead className="w-8" />
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Courier</TableHead>
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
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    >
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
                        <div className="text-sm font-medium">{addr?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{addr?.phone || ""}</div>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {order.courier_name || "—"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${order.id}-details`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
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
                                  <p className="text-xs text-muted-foreground">Tracking #</p>
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
    </div>
  );
}
