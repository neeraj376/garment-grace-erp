import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useShopAuth } from "@/hooks/useShopAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Package } from "lucide-react";

export default function ShopAccount() {
  const { user, customer, signOut } = useShopAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!customer) return;
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, created_at, tracking_number, courier_name")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders(data ?? []));
  }, [customer]);

  if (!user) {
    navigate("/shop/login");
    return null;
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/shop");
  };

  const statusColor: Record<string, string> = {
    pending: "bg-warning text-warning-foreground",
    confirmed: "bg-primary text-primary-foreground",
    shipped: "bg-primary text-primary-foreground",
    delivered: "bg-success text-success-foreground",
    cancelled: "bg-destructive text-destructive-foreground",
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
                  <Badge className={statusColor[order.status] || ""}>{order.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{new Date(order.created_at).toLocaleDateString("en-IN")}</span>
                  <span className="font-bold text-foreground">₹{Number(order.total_amount).toLocaleString()}</span>
                </div>
                {order.tracking_number && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Tracking: {order.tracking_number} ({order.courier_name})
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
