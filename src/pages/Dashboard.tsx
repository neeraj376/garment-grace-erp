import { IndianRupee, Users, ShoppingBag, TrendingUp, CreditCard, Wallet, Smartphone, Globe, Store, Calculator, Package } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    todayOffline: 0,
    todayWholesale: 0,
    monthlyOnline: 0,
    monthlyOffline: 0,
    monthlyWholesale: 0,
    dailyAverage: 0,
  });
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [weeklySales, setWeeklySales] = useState<{ day: string; sales: number }[]>([]);

  useEffect(() => {
    if (!storeId) return;

    const fetchDashboardData = async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      // Today's sales
      const { data: todayInvoices } = await supabase
        .from("invoices")
        .select("total_amount, payment_method, customer_id, source")
        .eq("store_id", storeId)
        .gte("created_at", startOfDay);

      const todaySales = todayInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const todayOnline = todayInvoices?.filter(i => i.source === "online").reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const todayWholesale = todayInvoices?.filter(i => i.source === "wholesale").reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const todayOffline = todaySales - todayOnline - todayWholesale;

      // Monthly sales
      const { data: monthInvoices } = await supabase
        .from("invoices")
        .select("total_amount, source")
        .eq("store_id", storeId)
        .gte("created_at", startOfMonth);

      const monthlySales = monthInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const monthlyOnline = monthInvoices?.filter(i => i.source === "online").reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const monthlyWholesale = monthInvoices?.filter(i => i.source === "wholesale").reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
      const monthlyOffline = monthlySales - monthlyOnline - monthlyWholesale;

      // Daily average this month
      const dayOfMonth = today.getDate();
      const dailyAverage = dayOfMonth > 0 ? monthlySales / dayOfMonth : 0;

      // Unique customers this month
      const { data: monthlyCustomerInvoices } = await supabase
        .from("invoices")
        .select("customer_id")
        .eq("store_id", storeId)
        .gte("created_at", startOfMonth)
        .not("customer_id", "is", null);

      const uniqueCustomerIds = new Set(monthlyCustomerInvoices?.map(i => i.customer_id));

      // Total products
      const { count: productCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("is_active", true);

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
      });

      // Payment breakdown
      const paymentMap: Record<string, number> = {};
      todayInvoices?.forEach((inv) => {
        const method = inv.payment_method || "cash";
        paymentMap[method] = (paymentMap[method] || 0) + Number(inv.total_amount);
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
        .select("total_amount, created_at")
        .eq("store_id", storeId)
        .gte("created_at", weekStart);

      const weeklyData = days.map((d) => {
        const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const sales = weekInvoices
          ?.filter((inv) => {
            const t = new Date(inv.created_at);
            return t >= dayStart && t < dayEnd;
          })
          .reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;
        return { day: dayStr, sales };
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
