import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useShopAuth } from "@/hooks/useShopAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Package, Truck } from "lucide-react";

export default function ShopAccount() {
  const { user, customer, signOut } = useShopAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [trackingData, setTrackingData] = useState<Record<string, any>>({});
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, created_at, tracking_number, courier_name, shiprocket_shipment_id, shipping_amount")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders(data ?? []));
  }, [customer]);

  if (!user) {
    navigate("/login");
    return null;
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleTrack = async (order: any) => {
    if (!order.shiprocket_shipment_id) return;
    setTrackingLoading(order.id);
    try {
      const { data } = await supabase.functions.invoke("shiprocket", {
        body: { action: "track_order", shipment_id: order.shiprocket_shipment_id },
      });
      setTrackingData((prev) => ({ ...prev, [order.id]: data }));
    } catch {
      // ignore
    } finally {
      setTrackingLoading(null);
    }
  };

  const statusColor: Record<string, string> = {
    pending: "bg-warning text-warning-foreground",
    confirmed: "bg-primary text-primary-foreground",
    shipped: "bg-primary text-primary-foreground",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-destructive text-destructive-foreground",
    failed: "bg-destructive text-destructive-foreground",
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">My Account</h1>
        <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">Name:</span> {customer?.name || "—"}</p>
          <p><span className="text-muted-foreground">Email:</span> {customer?.email || user.email}</p>
          <p><span className="text-muted-foreground">Phone:</span> {customer?.phone || "—"}</p>
        </CardContent>
      </Card>

      <h2 className="font-display text-xl font-bold mb-4">My Orders</h2>
      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2" />
          <p>No orders yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono font-medium">{order.order_number}</span>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor[order.status] || ""}>{order.status}</Badge>
                    <Badge variant="outline" className="text-[10px]">{order.payment_status}</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="font-bold text-foreground">₹{Number(order.total_amount).toLocaleString("en-IN")}</span>
                </div>
                {order.shipping_amount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Shipping: ₹{order.shipping_amount} · {order.courier_name || "Standard"}
                  </p>
                )}
                {order.tracking_number && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Tracking: <span className="font-mono">{order.tracking_number}</span> ({order.courier_name})
                  </p>
                )}
                {order.shiprocket_shipment_id && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => handleTrack(order)}
                      disabled={trackingLoading === order.id}
                    >
                      <Truck className="h-3 w-3" />
                      {trackingLoading === order.id ? "Loading..." : "Track Shipment"}
                    </Button>
                    {trackingData[order.id] && (
                      <div className="mt-2 text-xs bg-muted p-3 rounded-lg space-y-1">
                        {trackingData[order.id]?.tracking_data?.shipment_track?.map((t: any, i: number) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">{new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                            <span>{t.activity}</span>
                          </div>
                        )) || <p className="text-muted-foreground">No tracking updates yet.</p>}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
