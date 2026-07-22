import { IndianRupee, Users, ShoppingBag, TrendingUp, CreditCard, Wallet, Smartphone, Globe, Store, Calculator, Package, AlertTriangle, Truck, MessageCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";


const PAYMENT_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(0, 72%, 51%)",
];

export default function Dashboard() {
  const { storeId } = useStore();
  const [stats, setStats] = useState({
    todaySales: 0,
    monthlySales: 0,
    uniqueCustomers: 0,
    totalProducts: 0,
    todayOnline: 0,
    todayWhatsapp: 0,
    todayOffline: 0,
    todayWholesale: 0,
    monthlyOnline: 0,
    monthlyWhatsapp: 0,
    monthlyOffline: 0,
    monthlyWholesale: 0,
    dailyAverage: 0,
    totalPending: 0,
    pendingCount: 0,
    todayDeliveryCost: 0,
    monthlyDeliveryCost: 0,
    totalRetailPending: 0,
    retailPendingCount: 0,
  });
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [retailPendingList, setRetailPendingList] = useState<any[]>([]);
  const [retailPendingOpen, setRetailPendingOpen] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [weeklySales, setWeeklySales] = useState<{ day: string; sales: number }[]>([]);


  useEffect(() => {
    if (!storeId) return;

    const fetchDashboardData = async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      // Collected = total_amount - pending_amount (excludes uncollected wholesale dues)
      const collected = (inv: any) => Number(inv.total_amount) - Number(inv.pending_amount ?? 0);
      // ORD-XXXX ↔ INV-XXXX share the same suffix. When an online order has been
      // converted into an invoice (e.g. to credit an employee), skip the order-side
      // total so the sale isn't counted twice.
      const suffix = (s: string) => (s || "").slice(4);
      const hasMatchingInvoice = (invs: any[] | null, orderNumber: string) =>
        !!invs?.some(i => suffix(i.invoice_number) === suffix(orderNumber));

      // Today's sales
      const { data: todayInvoices } = await supabase
        .from("invoices")
        .select("total_amount, pending_amount, payment_method, customer_id, source, delivery_cost, invoice_number")
        .eq("store_id", storeId)
        .neq("status", "pending_address")
        .gte("created_at", startOfDay);

      // Today's online orders (paid only) — these aren't in invoices table
      const { data: todayOrdersRaw } = await supabase
        .from("orders")
        .select("order_number, total_amount, payment_method, customer_id, shipping_amount")
        .eq("store_id", storeId)
        .eq("payment_status", "paid")
        .gte("created_at", startOfDay);
      const todayOrders = (todayOrdersRaw ?? []).filter(o => !hasMatchingInvoice(todayInvoices ?? [], o.order_number));

      const todayInvSales = todayInvoices?.reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const todayOrdersTotal = todayOrders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) ?? 0;
      const todaySales = todayInvSales + todayOrdersTotal;
      const todayWhatsapp = todayInvoices?.filter(i => i.source === "whatsapp").reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const todayOnline = todayOrdersTotal;
      const todayWholesale = todayInvoices?.filter(i => i.source === "wholesale").reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const todayOffline = todayInvSales - todayWhatsapp - todayWholesale;

      // Monthly sales
      const { data: monthInvoices } = await supabase
        .from("invoices")
        .select("total_amount, pending_amount, source, delivery_cost, invoice_number")
        .eq("store_id", storeId)
        .neq("status", "pending_address")
        .gte("created_at", startOfMonth);

      // Monthly online orders (paid)
      const { data: monthOrdersRaw } = await supabase
        .from("orders")
        .select("order_number, total_amount, customer_id, shipping_amount")
        .eq("store_id", storeId)
        .eq("payment_status", "paid")
        .gte("created_at", startOfMonth);
      const monthOrders = (monthOrdersRaw ?? []).filter(o => !hasMatchingInvoice(monthInvoices ?? [], o.order_number));

      const monthInvSales = monthInvoices?.reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const monthOrdersTotal = monthOrders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) ?? 0;
      const monthlySales = monthInvSales + monthOrdersTotal;
      const monthlyOnlineFromInv = monthInvoices?.filter(i => i.source === "whatsapp").reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const monthlyOnline = monthlyOnlineFromInv + monthOrdersTotal;
      const monthlyWholesale = monthInvoices?.filter(i => i.source === "wholesale").reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
      const monthlyOffline = monthInvSales - monthlyOnlineFromInv - monthlyWholesale;

      // Daily average this month
      const dayOfMonth = today.getDate();
      const dailyAverage = dayOfMonth > 0 ? monthlySales / dayOfMonth : 0;

      // Unique customers this month
      const { data: monthlyCustomerInvoices } = await supabase
        .from("invoices")
        .select("customer_id")
        .eq("store_id", storeId)
        .neq("status", "pending_address")
        .gte("created_at", startOfMonth)
        .not("customer_id", "is", null);

      const uniqueCustomerIds = new Set<string>();
      monthlyCustomerInvoices?.forEach((i) => i.customer_id && uniqueCustomerIds.add(i.customer_id));
      monthOrders?.forEach((o) => o.customer_id && uniqueCustomerIds.add(o.customer_id));

      // Total products
      const { count: productCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("is_active", true);

      // Total pending amount (all wholesale invoices with pending > 0)
      const { data: pendingInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, total_amount, pending_amount, customer_id, customers(name, mobile)")
        .eq("store_id", storeId)
        .eq("source", "wholesale")
        .gt("pending_amount", 0)
        .order("created_at", { ascending: false });

      const totalPending = pendingInvoices?.reduce((sum, inv) => sum + Number(inv.pending_amount), 0) ?? 0;
      setPendingList(pendingInvoices ?? []);

      // Total pending amount (all retail = non-wholesale invoices with pending > 0)
      const { data: retailPendingInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, total_amount, pending_amount, source, customer_id, customers(name, mobile)")
        .eq("store_id", storeId)
        .neq("source", "wholesale")
        .neq("status", "pending_address")
        .gt("pending_amount", 0)
        .order("created_at", { ascending: false });

      const totalRetailPending = retailPendingInvoices?.reduce((sum, inv) => sum + Number(inv.pending_amount), 0) ?? 0;
      setRetailPendingList(retailPendingInvoices ?? []);

      setStats({
        todaySales,
        monthlySales,
        uniqueCustomers: uniqueCustomerIds.size,
        totalProducts: productCount ?? 0,
        todayOnline,
        todayOffline,
        todayWholesale,
        monthlyOnline,
        monthlyOffline,
        monthlyWholesale,
        dailyAverage,
        totalPending,
        pendingCount: pendingInvoices?.length ?? 0,
        todayDeliveryCost: (todayInvoices?.reduce((s, i: any) => s + Number(i.delivery_cost || 0), 0) ?? 0)

          + (todayOrders?.reduce((s, o: any) => s + Number(o.shipping_amount || 0), 0) ?? 0),
        monthlyDeliveryCost: (monthInvoices?.reduce((s, i: any) => s + Number(i.delivery_cost || 0), 0) ?? 0)
          + (monthOrders?.reduce((s, o: any) => s + Number(o.shipping_amount || 0), 0) ?? 0),
        totalRetailPending,
        retailPendingCount: retailPendingInvoices?.length ?? 0,
      });

      // Payment breakdown (use collected amount, not gross)
      const paymentMap: Record<string, number> = {};
      todayInvoices?.forEach((inv) => {
        const method = inv.payment_method || "cash";
        paymentMap[method] = (paymentMap[method] || 0) + collected(inv);
      });
      setPaymentBreakdown(
        Object.entries(paymentMap).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
        }))
      );

      // Weekly sales (last 7 days)
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d);
      }

      const weekStart = days[0].toISOString();
      const { data: weekInvoices } = await supabase
        .from("invoices")
        .select("total_amount, pending_amount, created_at, invoice_number")
        .eq("store_id", storeId)
        .neq("status", "pending_address")
        .gte("created_at", weekStart);

      const { data: weekOrdersRaw } = await supabase
        .from("orders")
        .select("order_number, total_amount, created_at")
        .eq("store_id", storeId)
        .eq("payment_status", "paid")
        .gte("created_at", weekStart);
      const weekOrders = (weekOrdersRaw ?? []).filter(o => !hasMatchingInvoice(weekInvoices ?? [], o.order_number));

      const weeklyData = days.map((d) => {
        const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const invSales = weekInvoices
          ?.filter((inv) => {
            const t = new Date(inv.created_at);
            return t >= dayStart && t < dayEnd;
          })
          .reduce((sum, inv) => sum + collected(inv), 0) ?? 0;
        const ordSales = weekOrders
          ?.filter((o) => {
            const t = new Date(o.created_at);
            return t >= dayStart && t < dayEnd;
          })
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0) ?? 0;
        return { day: dayStr, sales: invSales + ordSales };
      });
      setWeeklySales(weeklyData);
    };

    fetchDashboardData();
  }, [storeId]);

  const formatCurrency = (val: number) => `₹${val.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your store performance</p>
      </div>

      {stats.totalPending > 0 && (
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setPendingOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPendingOpen(true); }}
          className="p-4 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
            <AlertTriangle className="h-4 w-4" /> Total Wholesale Pending
          </div>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <p className="text-2xl font-bold font-display text-amber-800 dark:text-amber-200">{formatCurrency(stats.totalPending)}</p>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {stats.pendingCount} {stats.pendingCount === 1 ? "invoice" : "invoices"} · Click to view
            </p>
          </div>
        </Card>
      )}

      {stats.totalRetailPending > 0 && (
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setRetailPendingOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setRetailPendingOpen(true); }}
          className="p-4 border-orange-300 bg-orange-50/50 dark:bg-orange-950/20 cursor-pointer hover:bg-orange-100/60 dark:hover:bg-orange-950/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-300 mb-1">
            <AlertTriangle className="h-4 w-4" /> Total Retail Pending
          </div>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <p className="text-2xl font-bold font-display text-orange-800 dark:text-orange-200">{formatCurrency(stats.totalRetailPending)}</p>
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {stats.retailPendingCount} {stats.retailPendingCount === 1 ? "invoice" : "invoices"} · Click to view
            </p>
          </div>
        </Card>
      )}

      <Dialog open={retailPendingOpen} onOpenChange={setRetailPendingOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending Retail Invoices ({stats.retailPendingCount})</DialogTitle>
          </DialogHeader>
          <div className="mt-2 border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="p-2 font-medium">Invoice</th>
                  <th className="p-2 font-medium">Date</th>
                  <th className="p-2 font-medium">Source</th>
                  <th className="p-2 font-medium">Customer</th>
                  <th className="p-2 font-medium text-right">Total</th>
                  <th className="p-2 font-medium text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {retailPendingList.map((inv: any) => (
                  <tr key={inv.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="p-2">{new Date(inv.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="p-2 capitalize">{inv.source ?? "—"}</td>
                    <td className="p-2">
                      <div>{inv.customers?.name ?? "—"}</div>
                      {inv.customers?.mobile && (
                        <div className="text-xs text-muted-foreground">{inv.customers.mobile}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(Number(inv.total_amount))}</td>
                    <td className="p-2 text-right font-semibold text-orange-700 dark:text-orange-300">
                      {formatCurrency(Number(inv.pending_amount))}
                    </td>
                  </tr>
                ))}
                {retailPendingList.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No pending invoices</td></tr>
                )}
              </tbody>
              {retailPendingList.length > 0 && (
                <tfoot className="bg-muted/50 font-semibold">
                  <tr className="border-t">
                    <td colSpan={5} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right text-orange-700 dark:text-orange-300">{formatCurrency(stats.totalRetailPending)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending Wholesale Invoices ({stats.pendingCount})</DialogTitle>
          </DialogHeader>
          <div className="mt-2 border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="p-2 font-medium">Invoice</th>
                  <th className="p-2 font-medium">Date</th>
                  <th className="p-2 font-medium">Customer</th>
                  <th className="p-2 font-medium text-right">Total</th>
                  <th className="p-2 font-medium text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map((inv: any) => (
                  <tr key={inv.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="p-2">{new Date(inv.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="p-2">
                      <div>{inv.customers?.name ?? "—"}</div>
                      {inv.customers?.mobile && (
                        <div className="text-xs text-muted-foreground">{inv.customers.mobile}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(Number(inv.total_amount))}</td>
                    <td className="p-2 text-right font-semibold text-amber-700 dark:text-amber-300">
                      {formatCurrency(Number(inv.pending_amount))}
                    </td>
                  </tr>
                ))}
                {pendingList.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No pending invoices</td></tr>
                )}
              </tbody>
              {pendingList.length > 0 && (
                <tfoot className="bg-muted/50 font-semibold">
                  <tr className="border-t">
                    <td colSpan={4} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right text-amber-700 dark:text-amber-300">{formatCurrency(stats.totalPending)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </DialogContent>
      </Dialog>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={formatCurrency(stats.todaySales)} icon={IndianRupee} changeType="positive" change="Live" />
        <StatCard title="Monthly Sales" value={formatCurrency(stats.monthlySales)} icon={TrendingUp} />
        <StatCard title="Unique Customers" value={stats.uniqueCustomers.toString()} icon={Users} />
        <StatCard title="Active Products" value={stats.totalProducts.toString()} icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Store className="h-4 w-4" /> Today Offline
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.todayOffline)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Globe className="h-4 w-4" /> Today Online
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.todayOnline)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Package className="h-4 w-4" /> Today Wholesale
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.todayWholesale)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Calculator className="h-4 w-4" /> Daily Avg (This Month)
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(Math.round(stats.dailyAverage))}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Store className="h-4 w-4" /> Monthly Offline
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.monthlyOffline)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Globe className="h-4 w-4" /> Monthly Online
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.monthlyOnline)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Package className="h-4 w-4" /> Monthly Wholesale
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.monthlyWholesale)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Truck className="h-4 w-4" /> Today Delivery Cost
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.todayDeliveryCost)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Excluded from revenue</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
            <Truck className="h-4 w-4" /> Monthly Delivery Cost
          </div>
          <p className="text-lg font-bold font-display">{formatCurrency(stats.monthlyDeliveryCost)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Excluded from revenue</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="section-title">Weekly Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                  <XAxis dataKey="day" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                  <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="sales" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="section-title">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentBreakdown.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      fontSize={11}
                    >
                      {paymentBreakdown.map((_, index) => (
                        <Cell key={index} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                No sales data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
