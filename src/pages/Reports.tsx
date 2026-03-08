import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { CalendarDays, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";


type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

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
      .select("*, invoice_items(quantity, unit_price, tax_amount, total, product_id)")
      .eq("store_id", storeId!)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    const productIds = new Set<string>();
    (invData ?? []).forEach(inv => {
      (inv.invoice_items as any[])?.forEach(item => {
        if (item.product_id) productIds.add(item.product_id);
      });
    });

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

    let revenue = 0, cost = 0, tax = 0;
    (invData ?? []).forEach(inv => {
      revenue += Number(inv.total_amount);
      tax += Number(inv.tax_amount);
      (inv.invoice_items as any[])?.forEach(item => {
        cost += (buyingPriceMap[item.product_id] ?? 0) * item.quantity;
      });
    });

    setSummary({ revenue, cost, tax, profit: revenue - cost - tax });

    const grouped: Record<string, number> = {};
    (invData ?? []).forEach(inv => {
      const day = new Date(inv.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      grouped[day] = (grouped[day] || 0) + Number(inv.total_amount);
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
        empMap[inv.employee_id].totalSales += Number(inv.total_amount);
      }
    });

    setEmployeeSales(
      Object.values(empMap)
        .filter(e => e.invoiceCount > 0)
        .sort((a, b) => b.totalSales - a.totalSales)
    );
  };

  const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = [
      { Metric: "Revenue", Amount: summary.revenue },
      { Metric: "Cost of Goods", Amount: summary.cost },
      { Metric: "GST Collected", Amount: summary.tax },
      { Metric: "Net Profit", Amount: summary.profit },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");

    // Sales trend sheet
    if (salesData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData.map(d => ({ Date: d.date, Amount: d.amount }))), "Sales Trend");
    }

    // Employee performance sheet
    if (employeeSales.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeSales.map(e => ({
        Employee: e.name, Role: e.role, Invoices: e.invoiceCount,
        "Total Sales": e.totalSales, "Avg per Invoice": Math.round(e.totalSales / e.invoiceCount),
      }))), "Employee Sales");
    }

    XLSX.writeFile(wb, `Report_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="page-header">Reports</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={downloadExcel}>
            <Download className="h-4 w-4 mr-1" /> Export Excel
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
    </div>
  );
}
