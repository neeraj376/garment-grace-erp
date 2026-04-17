import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { CalendarDays, Users, Download, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InventoryAgingReport from "@/components/reports/InventoryAgingReport";
import CategorySizeReport from "@/components/reports/CategorySizeReport";


type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

const PAYMENT_COLORS: Record<string, string> = {
  cash: "hsl(142, 71%, 45%)",
  upi: "hsl(262, 83%, 58%)",
  card: "hsl(221, 83%, 53%)",
  online: "hsl(24, 95%, 53%)",
  other: "hsl(0, 0%, 60%)",
};

interface PaymentSplit {
  name: string;
  value: number;
}

interface EmployeeSales {
  id: string;
  name: string;
  role: string;
  invoiceCount: number;
  totalSales: number;
}

export default function Reports() {
  const { storeId } = useStore();
  const [period, setPeriod] = useState<Period>("monthly");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [salesData, setSalesData] = useState<any[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, cost: 0, tax: 0, profit: 0 });
  const [employeeSales, setEmployeeSales] = useState<EmployeeSales[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplit[]>([]);
  const [sourceSplit, setSourceSplit] = useState<PaymentSplit[]>([]);

  useEffect(() => {
    if (!storeId) return;
    fetchReport();
  }, [storeId, period, customStart, customEnd]);

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case "daily": start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
      case "weekly": start = new Date(now.getTime() - 7 * 86400000); break;
      case "monthly": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "quarterly": start = new Date(now.getFullYear(), now.getMonth() - 3, 1); break;
      case "yearly": start = new Date(now.getFullYear(), 0, 1); break;
      case "custom":
        return {
          start: customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          end: customEnd ? new Date(customEnd + "T23:59:59").toISOString() : now.toISOString(),
        };
      default: start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start: start.toISOString(), end: now.toISOString() };
  };

  const fetchReport = async () => {
    const { start, end } = getDateRange();

    const { data: invData } = await supabase
      .from("invoices")
      .select("*, invoice_items(quantity, unit_price, tax_amount, total, product_id, batch_id)")
      .eq("store_id", storeId!)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    // Collect product IDs and batch IDs
    const productIds = new Set<string>();
    const batchIds = new Set<string>();
    (invData ?? []).forEach(inv => {
      (inv.invoice_items as any[])?.forEach(item => {
        if (item.product_id) productIds.add(item.product_id);
        if (item.batch_id) batchIds.add(item.batch_id);
      });
    });

    // Fetch product-level buying prices as fallback
    const buyingPriceMap: Record<string, number> = {};
    if (productIds.size > 0) {
      const { data: productData } = await supabase
        .from("products")
        .select("id, buying_price")
        .in("id", Array.from(productIds));
      (productData ?? []).forEach((p: any) => {
        buyingPriceMap[p.id] = Number(p.buying_price) || 0;
      });
    }

    // Fetch batch-level buying prices (more accurate per-purchase cost)
    const batchBuyingPriceMap: Record<string, number> = {};
    if (batchIds.size > 0) {
      const { data: batchData } = await supabase
        .from("inventory_batches")
        .select("id, buying_price")
        .in("id", Array.from(batchIds));
      (batchData ?? []).forEach((b: any) => {
        batchBuyingPriceMap[b.id] = Number(b.buying_price) || 0;
      });
    }

    // Collected revenue excludes wholesale pending amounts
    const collected = (inv: any) => Number(inv.total_amount) - Number(inv.pending_amount ?? 0);

    let revenue = 0, cost = 0, tax = 0;
    (invData ?? []).forEach(inv => {
      revenue += collected(inv);
      tax += Number(inv.tax_amount);
      (inv.invoice_items as any[])?.forEach(item => {
        const unitCost = item.batch_id && batchBuyingPriceMap[item.batch_id] > 0
          ? batchBuyingPriceMap[item.batch_id]
          : (buyingPriceMap[item.product_id] ?? 0);
        cost += unitCost * item.quantity;
      });
    });

    setSummary({ revenue, cost, tax, profit: revenue - cost - tax });

    // Payment method split
    const paymentMap: Record<string, number> = {};
    (invData ?? []).forEach(inv => {
      const method = (inv.payment_method || "other").toLowerCase();
      paymentMap[method] = (paymentMap[method] || 0) + collected(inv);
    });
    setPaymentSplit(
      Object.entries(paymentMap)
        .map(([name, value]) => ({ name: name.toUpperCase(), value }))
        .sort((a, b) => b.value - a.value)
    );

    // Online vs Offline split
    const sourceMap: Record<string, number> = {};
    (invData ?? []).forEach(inv => {
      const src = (inv.source || "offline").toLowerCase();
      const label = src === "online" ? "Online" : src === "wholesale" ? "Wholesale" : "Offline";
      sourceMap[label] = (sourceMap[label] || 0) + collected(inv);
    });
    setSourceSplit(
      Object.entries(sourceMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    );

    const grouped: Record<string, number> = {};
    (invData ?? []).forEach(inv => {
      const day = new Date(inv.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      grouped[day] = (grouped[day] || 0) + collected(inv);
    });
    setSalesData(Object.entries(grouped).map(([date, amount]) => ({ date, amount })));

    // Employee sales breakdown
    const { data: employees } = await supabase
      .from("employees")
      .select("id, name, role")
      .eq("store_id", storeId!);

    const empMap: Record<string, EmployeeSales> = {};
    (employees ?? []).forEach((e: any) => {
      empMap[e.id] = { id: e.id, name: e.name, role: e.role, invoiceCount: 0, totalSales: 0 };
    });

    (invData ?? []).forEach((inv: any) => {
      if (inv.employee_id && empMap[inv.employee_id]) {
        empMap[inv.employee_id].invoiceCount += 1;
        empMap[inv.employee_id].totalSales += collected(inv);
      }
    });

    setEmployeeSales(
      Object.values(empMap)
        .filter(e => e.invoiceCount > 0)
        .sort((a, b) => b.totalSales - a.totalSales)
    );
  };

  const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  const toCsvString = (headers: string[], rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  };

  const downloadReport = () => {
    let csv = "=== Summary ===\n";
    csv += toCsvString(["Metric", "Amount"], [
      ["Revenue", summary.revenue],
      ["Cost of Goods", summary.cost],
      ["GST Collected", summary.tax],
      ["Net Profit", summary.profit],
    ]);

    if (salesData.length > 0) {
      csv += "\n\n=== Sales Trend ===\n";
      csv += toCsvString(["Date", "Amount"], salesData.map(d => [d.date, d.amount]));
    }

    if (sourceSplit.length > 0) {
      csv += "\n\n=== Online vs Offline Sales ===\n";
      csv += toCsvString(["Source", "Amount"], sourceSplit.map(s => [s.name, s.value]));
    }

    if (paymentSplit.length > 0) {
      csv += "\n\n=== Payment Source Split ===\n";
      csv += toCsvString(["Payment Method", "Amount"], paymentSplit.map(p => [p.name, p.value]));
    }

    if (employeeSales.length > 0) {
      csv += "\n\n=== Employee Sales ===\n";
      csv += toCsvString(
        ["Employee", "Role", "Invoices", "Total Sales", "Avg per Invoice"],
        employeeSales.map(e => [e.name, e.role, e.invoiceCount, e.totalSales, Math.round(e.totalSales / e.invoiceCount)])
      );
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="page-header">Reports</h1>
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales & P&L</TabsTrigger>
          <TabsTrigger value="category">Category & Size</TabsTrigger>
          <TabsTrigger value="aging">Inventory Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="flex items-center justify-end flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadReport}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Today</SelectItem>
                  <SelectItem value="weekly">This Week</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                  <SelectItem value="quarterly">This Quarter</SelectItem>
                  <SelectItem value="yearly">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {period === "custom" && (
                <div className="flex gap-2 items-center">
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold font-display">{formatCurrency(summary.revenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Cost of Goods</p>
                <p className="text-2xl font-bold font-display">{formatCurrency(summary.cost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">GST Collected</p>
                <p className="text-2xl font-bold font-display">{formatCurrency(summary.tax)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold font-display ${summary.profit >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(summary.profit)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="section-title">Sales Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                {salesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                      <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="amount" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <CalendarDays className="h-6 w-6 mr-2" /> No data for this period
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="section-title">Online vs Offline Sales</CardTitle></CardHeader>
            <CardContent>
              {sourceSplit.length > 0 ? (
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceSplit}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "hsl(220, 9%, 46%)" }}
                      >
                        {sourceSplit.map((entry, idx) => {
                          const colors: Record<string, string> = {
                            "Online": "hsl(221, 83%, 53%)",
                            "Offline": "hsl(24, 95%, 53%)",
                            "Wholesale": "hsl(142, 71%, 45%)",
                          };
                          return <Cell key={entry.name} fill={colors[entry.name] || `hsl(${idx * 90}, 60%, 50%)`} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No sales data for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="section-title">Payment Source Split</CardTitle></CardHeader>
            <CardContent>
              {paymentSplit.length > 0 ? (
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentSplit}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "hsl(220, 9%, 46%)" }}
                      >
                        {paymentSplit.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={PAYMENT_COLORS[entry.name.toLowerCase()] || PAYMENT_COLORS.other}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  <CreditCard className="h-6 w-6 mr-2" /> No payment data for this period
                </div>
              )}
            </CardContent>
          </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="section-title">Employee Sales Performance</CardTitle></CardHeader>
            <CardContent>
              {employeeSales.length > 0 ? (
                <>
                  <div className="h-64 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employeeSales}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                        <XAxis dataKey="name" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                        <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="totalSales" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} name="Total Sales" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-center">Invoices</TableHead>
                        <TableHead className="text-right">Total Sales</TableHead>
                        <TableHead className="text-right">Avg per Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeSales.map(emp => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-muted-foreground capitalize">{emp.role}</TableCell>
                          <TableCell className="text-center">{emp.invoiceCount}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(emp.totalSales)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Math.round(emp.totalSales / emp.invoiceCount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  <Users className="h-6 w-6 mr-2" /> No employee sales data for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <CategorySizeReport />
        </TabsContent>

        <TabsContent value="aging">
          <InventoryAgingReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

