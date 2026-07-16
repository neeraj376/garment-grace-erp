import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { CalendarDays, Users, Download, CreditCard, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import InventoryAgingReport from "@/components/reports/InventoryAgingReport";
import CategorySizeReport from "@/components/reports/CategorySizeReport";
import ShopVisitorsReport from "@/components/reports/ShopVisitorsReport";


type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
type CompareMode = "none" | "prev_period" | "prev_week" | "prev_month" | "custom";

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
  bySource: { offline: { count: number; sales: number }; online: { count: number; sales: number }; wholesale: { count: number; sales: number } };
}

interface ReportBundle {
  summary: { revenue: number; cost: number; tax: number; deliveryCost: number; profit: number; operatingCost: number; operatingProfit: number };
  trend: { date: string; total: number }[];
  paymentSplit: PaymentSplit[];
  sourceSplit: PaymentSplit[];
  employeeSales: EmployeeSales[];
  rangeStart: string;
  rangeEnd: string;
}

type SourceFilter = "all" | "offline" | "online" | "wholesale";

const EMPTY_BUNDLE: ReportBundle = {
  summary: { revenue: 0, cost: 0, tax: 0, deliveryCost: 0, profit: 0, operatingCost: 0, operatingProfit: 0 },
  trend: [],
  paymentSplit: [],
  sourceSplit: [],
  employeeSales: [],
  rangeStart: "",
  rangeEnd: "",
};


export default function Reports() {
  const { storeId } = useStore();
  const [period, setPeriod] = useState<Period>("monthly");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const [compareStart, setCompareStart] = useState("");
  const [compareEnd, setCompareEnd] = useState("");
  const [current, setCurrent] = useState<ReportBundle>(EMPTY_BUNDLE);
  const [previous, setPrevious] = useState<ReportBundle | null>(null);
  const [useCurrentPrice, setUseCurrentPrice] = useState(false);
  const [empSourceFilter, setEmpSourceFilter] = useState<SourceFilter>("all");

  useEffect(() => {
    if (!storeId) return;
    runReports();
  }, [storeId, period, customStart, customEnd, useCurrentPrice, compareMode, compareStart, compareEnd]);

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

  const getComparisonRange = (curStart: string, curEnd: string): { start: string; end: string } | null => {
    if (compareMode === "none") return null;
    const s = new Date(curStart).getTime();
    const e = new Date(curEnd).getTime();
    const span = e - s;
    if (compareMode === "prev_period") {
      return { start: new Date(s - span).toISOString(), end: new Date(s - 1).toISOString() };
    }
    if (compareMode === "prev_week") {
      return { start: new Date(s - 7 * 86400000).toISOString(), end: new Date(e - 7 * 86400000).toISOString() };
    }
    if (compareMode === "prev_month") {
      const sd = new Date(s); const ed = new Date(e);
      const ns = new Date(sd.getFullYear(), sd.getMonth() - 1, sd.getDate(), sd.getHours(), sd.getMinutes(), sd.getSeconds());
      const ne = new Date(ed.getFullYear(), ed.getMonth() - 1, ed.getDate(), ed.getHours(), ed.getMinutes(), ed.getSeconds());
      return { start: ns.toISOString(), end: ne.toISOString() };
    }
    if (compareMode === "custom") {
      if (!compareStart || !compareEnd) return null;
      return { start: new Date(compareStart).toISOString(), end: new Date(compareEnd + "T23:59:59").toISOString() };
    }
    return null;
  };

  const runReports = async () => {
    const { start, end } = getDateRange();
    const cur = await fetchBundle(start, end);
    setCurrent(cur);
    const cmpRange = getComparisonRange(start, end);
    if (cmpRange) {
      const prev = await fetchBundle(cmpRange.start, cmpRange.end);
      setPrevious(prev);
    } else {
      setPrevious(null);
    }
  };

  const fetchBundle = async (start: string, end: string): Promise<ReportBundle> => {
    // Page through invoices to avoid the default 1000-row cap silently truncating data
    const PAGE = 1000;
    let from = 0;
    const invData: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(quantity, unit_price, tax_amount, total, product_id, batch_id)")
        .eq("store_id", storeId!)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = data ?? [];
      invData.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    const orderData: any[] = [];
    {
      let oFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, order_number, total_amount, subtotal, tax_amount, shipping_amount, payment_method, created_at, order_items(quantity, unit_price, tax_amount, total, product_id)")
          .eq("store_id", storeId!)
          .eq("payment_status", "paid")
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true })
          .range(oFrom, oFrom + PAGE - 1);
        if (error) break;
        const batch = data ?? [];
        orderData.push(...batch);
        if (batch.length < PAGE) break;
        oFrom += PAGE;
      }
    }
    // Skip online orders that already have a matching invoice (same suffix)
    // so the sale isn't double-counted in reports.
    const invoiceSuffixes = new Set(invData.map((i: any) => (i.invoice_number || "").slice(4)));
    const dedupedOrderData = orderData.filter((o: any) => !invoiceSuffixes.has((o.order_number || "").slice(4)));
    orderData.length = 0;
    orderData.push(...dedupedOrderData);

    const productIds = new Set<string>();
    const batchIds = new Set<string>();
    invData.forEach(inv => {
      (inv.invoice_items as any[])?.forEach(item => {
        if (item.product_id) productIds.add(item.product_id);
        if (item.batch_id) batchIds.add(item.batch_id);
      });
    });
    orderData.forEach((o: any) => {
      (o.order_items as any[])?.forEach((it: any) => {
        if (it.product_id) productIds.add(it.product_id);
      });
    });

    const CHUNK = 500;
    const chunked = <T,>(arr: T[]): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
      return out;
    };

    const buyingPriceMap: Record<string, number> = {};
    if (productIds.size > 0) {
      for (const ids of chunked(Array.from(productIds))) {
        const { data: productData } = await supabase
          .from("products").select("id, buying_price").in("id", ids).limit(ids.length);
        (productData ?? []).forEach((p: any) => { buyingPriceMap[p.id] = Number(p.buying_price) || 0; });
      }
    }

    const batchBuyingPriceMap: Record<string, number> = {};
    if (batchIds.size > 0) {
      for (const ids of chunked(Array.from(batchIds))) {
        const { data: batchData } = await supabase
          .from("inventory_batches").select("id, buying_price").in("id", ids).limit(ids.length);
        (batchData ?? []).forEach((b: any) => { batchBuyingPriceMap[b.id] = Number(b.buying_price) || 0; });
      }
    }

    const collected = (inv: any) => Number(inv.total_amount) - Number(inv.pending_amount ?? 0);

    let revenue = 0, cost = 0, tax = 0;
    invData.forEach(inv => {
      revenue += collected(inv);
      tax += Number(inv.tax_amount);
      (inv.invoice_items as any[])?.forEach(item => {
        const unitCost = useCurrentPrice
          ? (buyingPriceMap[item.product_id] ?? 0)
          : (item.batch_id && batchBuyingPriceMap[item.batch_id] > 0
              ? batchBuyingPriceMap[item.batch_id]
              : (buyingPriceMap[item.product_id] ?? 0));
        cost += unitCost * item.quantity;
      });
    });
    orderData.forEach((o: any) => {
      revenue += Number(o.total_amount || 0);
      tax += Number(o.tax_amount || 0);
      (o.order_items as any[])?.forEach((item: any) => {
        const unitCost = buyingPriceMap[item.product_id] ?? 0;
        cost += unitCost * item.quantity;
      });
    });

    const deliveryCost = invData.reduce((s, i: any) => s + Number(i.delivery_cost || 0), 0);

    // Operating costs overlapping this range (prorated by overlap days)
    const rangeStartDate = new Date(start);
    const rangeEndDate = new Date(end);
    const { data: opCostData } = await supabase
      .from("operating_costs")
      .select("amount, period_start, period_end")
      .eq("store_id", storeId!)
      .lte("period_start", end.slice(0, 10))
      .gte("period_end", start.slice(0, 10));
    let operatingCost = 0;
    (opCostData ?? []).forEach((c: any) => {
      const ps = new Date(c.period_start);
      const pe = new Date(c.period_end);
      const totalDays = Math.max(1, Math.floor((pe.getTime() - ps.getTime()) / 86400000) + 1);
      const overlapStart = ps > rangeStartDate ? ps : rangeStartDate;
      const overlapEnd = pe < rangeEndDate ? pe : rangeEndDate;
      const overlapDays = Math.max(0, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);
      operatingCost += Number(c.amount) * (overlapDays / totalDays);
    });

    const profit = revenue - cost - tax - deliveryCost;
    const summary = { revenue, cost, tax, deliveryCost, profit, operatingCost, operatingProfit: profit - operatingCost };

    const paymentMap: Record<string, number> = {};
    invData.forEach(inv => {
      const method = (inv.payment_method || "other").toLowerCase();
      paymentMap[method] = (paymentMap[method] || 0) + collected(inv);
    });
    orderData.forEach((o: any) => {
      const method = (o.payment_method || "online").toLowerCase();
      paymentMap[method] = (paymentMap[method] || 0) + Number(o.total_amount || 0);
    });
    const paymentSplit = Object.entries(paymentMap)
      .map(([name, value]) => ({ name: name.toUpperCase(), value })).sort((a, b) => b.value - a.value);

    const sourceMap: Record<string, number> = {};
    invData.forEach(inv => {
      const src = (inv.source || "offline").toLowerCase();
      const label = src === "online" ? "Online" : src === "wholesale" ? "Wholesale" : "Offline";
      sourceMap[label] = (sourceMap[label] || 0) + collected(inv);
    });
    orderData.forEach((o: any) => {
      sourceMap["Online"] = (sourceMap["Online"] || 0) + Number(o.total_amount || 0);
    });
    const sourceSplit = Object.entries(sourceMap)
      .map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const { data: employees } = await supabase
      .from("employees").select("id, name, role").eq("store_id", storeId!);

    // Trend grouped by day-offset (numeric) so it can be aligned for comparison
    const startMs = new Date(start).getTime();
    const trendMap: Record<number, number> = {};
    const bumpDay = (ts: number, amt: number) => {
      const offset = Math.floor((new Date(new Date(ts).toDateString()).getTime() - new Date(new Date(startMs).toDateString()).getTime()) / 86400000);
      trendMap[offset] = (trendMap[offset] || 0) + amt;
    };
    invData.forEach(inv => bumpDay(new Date(inv.created_at).getTime(), collected(inv)));
    orderData.forEach((o: any) => bumpDay(new Date(o.created_at).getTime(), Number(o.total_amount || 0)));

    const trend = Object.entries(trendMap)
      .map(([k, v]) => {
        const off = Number(k);
        const d = new Date(startMs + off * 86400000);
        return { offset: off, date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }), total: v };
      })
      .sort((a, b) => a.offset - b.offset)
      .map(({ date, total }) => ({ date, total }));

    const empMap: Record<string, EmployeeSales> = {};
    (employees ?? []).forEach((e: any) => {
      empMap[e.id] = {
        id: e.id, name: e.name, role: e.role, invoiceCount: 0, totalSales: 0,
        bySource: { offline: { count: 0, sales: 0 }, online: { count: 0, sales: 0 }, wholesale: { count: 0, sales: 0 } },
      };
    });
    invData.forEach((inv: any) => {
      if (inv.employee_id && empMap[inv.employee_id]) {
        const amt = collected(inv);
        empMap[inv.employee_id].invoiceCount += 1;
        empMap[inv.employee_id].totalSales += amt;
        const src = (inv.source || "offline").toLowerCase();
        const key: "offline" | "online" | "wholesale" = src === "online" ? "online" : src === "wholesale" ? "wholesale" : "offline";
        empMap[inv.employee_id].bySource[key].count += 1;
        empMap[inv.employee_id].bySource[key].sales += amt;
      }
    });
    const employeeSales = Object.values(empMap)
      .filter(e => e.invoiceCount > 0).sort((a, b) => b.totalSales - a.totalSales);

    return { summary, trend, paymentSplit, sourceSplit, employeeSales, rangeStart: start, rangeEnd: end };
  };

  const formatCurrency = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
  const formatDateRange = (s: string, e: string) => {
    if (!s) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    return `${fmt(s)} – ${fmt(e)}`;
  };
  const pctChange = (cur: number, prev: number): number | null => {
    if (!prev) return cur === 0 ? 0 : null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  const toCsvString = (headers: string[], rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  };

  const downloadReport = () => {
    let csv = "=== Summary ===\n";
    const sumRows: (string | number)[][] = [
      ["Revenue", current.summary.revenue, previous?.summary.revenue ?? ""],
      ["Cost of Goods", current.summary.cost, previous?.summary.cost ?? ""],
      ["GST Collected", current.summary.tax, previous?.summary.tax ?? ""],
      ["Net Profit", current.summary.profit, previous?.summary.profit ?? ""],
    ];
    csv += toCsvString(previous ? ["Metric", "Current", "Previous"] : ["Metric", "Amount"],
      previous ? sumRows : sumRows.map(r => [r[0], r[1]]));

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build comparison trend data aligned by day offset
  const comparisonTrend: { date: string; current: number | null; previous: number | null }[] = (() => {
    if (!previous) return current.trend.map(t => ({ date: t.date, current: t.total, previous: null }));
    const maxLen = Math.max(current.trend.length, previous.trend.length);
    const rows: { date: string; current: number | null; previous: number | null }[] = [];
    for (let i = 0; i < maxLen; i++) {
      rows.push({
        date: current.trend[i]?.date || previous.trend[i]?.date || `Day ${i + 1}`,
        current: current.trend[i]?.total ?? null,
        previous: previous.trend[i]?.total ?? null,
      });
    }
    return rows;
  })();

  // Merge two split arrays into grouped bar data
  const mergeSplits = (cur: PaymentSplit[], prev: PaymentSplit[] | undefined) => {
    const names = new Set<string>([...cur.map(c => c.name), ...(prev ?? []).map(p => p.name)]);
    return Array.from(names).map(name => ({
      name,
      current: cur.find(c => c.name === name)?.value || 0,
      previous: prev?.find(p => p.name === name)?.value || 0,
    }));
  };

  const sourceCompareData = mergeSplits(current.sourceSplit, previous?.sourceSplit);
  const paymentCompareData = mergeSplits(current.paymentSplit, previous?.paymentSplit);

  // Merged employee table with comparison
  const employeeCompareRows = (() => {
    const map = new Map<string, { id: string; name: string; role: string; cur: { c: number; s: number }; prev: { c: number; s: number } }>();
    const pick = (e: EmployeeSales) => {
      if (empSourceFilter === "all") return { c: e.invoiceCount, s: e.totalSales };
      const b = e.bySource[empSourceFilter];
      return { c: b.count, s: b.sales };
    };
    current.employeeSales.forEach(e => {
      const v = pick(e);
      map.set(e.id, { id: e.id, name: e.name, role: e.role, cur: v, prev: { c: 0, s: 0 } });
    });
    previous?.employeeSales.forEach(e => {
      const v = pick(e);
      const existing = map.get(e.id);
      if (existing) existing.prev = v;
      else map.set(e.id, { id: e.id, name: e.name, role: e.role, cur: { c: 0, s: 0 }, prev: v });
    });
    return Array.from(map.values())
      .filter(r => r.cur.c > 0 || r.prev.c > 0)
      .sort((a, b) => b.cur.s - a.cur.s);
  })();

  const renderDelta = (cur: number, prev: number) => {
    const pct = pctChange(cur, prev);
    if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
    const up = pct >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="page-header">Reports</h1>
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales & P&L</TabsTrigger>
          <TabsTrigger value="category">Category & Size</TabsTrigger>
          <TabsTrigger value="aging">Inventory Aging</TabsTrigger>
          <TabsTrigger value="visitors">Shop Visitors</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch id="use-current-price" checked={useCurrentPrice} onCheckedChange={setUseCurrentPrice} />
              <Label htmlFor="use-current-price" className="cursor-pointer text-sm">
                Recalculate using current product price
              </Label>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
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
              <Select value={compareMode} onValueChange={(v) => setCompareMode(v as CompareMode)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Compare with..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Comparison</SelectItem>
                  <SelectItem value="prev_period">Previous Period (same length)</SelectItem>
                  <SelectItem value="prev_week">Previous Week</SelectItem>
                  <SelectItem value="prev_month">Previous Month</SelectItem>
                  <SelectItem value="custom">Custom Comparison</SelectItem>
                </SelectContent>
              </Select>
              {compareMode === "custom" && (
                <div className="flex gap-2 items-center">
                  <Input type="date" value={compareStart} onChange={e => setCompareStart(e.target.value)} className="w-36" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={compareEnd} onChange={e => setCompareEnd(e.target.value)} className="w-36" />
                </div>
              )}
            </div>
          </div>

          {previous && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 inline-block">
              <span className="font-medium text-foreground">Current:</span> {formatDateRange(current.rangeStart, current.rangeEnd)}
              {"  •  "}
              <span className="font-medium text-foreground">Previous:</span> {formatDateRange(previous.rangeStart, previous.rangeEnd)}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: "Revenue", cur: current.summary.revenue, prev: previous?.summary.revenue ?? 0 },
              { label: "Cost of Goods", cur: current.summary.cost, prev: previous?.summary.cost ?? 0 },
              { label: "GST Collected", cur: current.summary.tax, prev: previous?.summary.tax ?? 0 },
              { label: "Delivery Cost", cur: current.summary.deliveryCost, prev: previous?.summary.deliveryCost ?? 0 },
              { label: "Gross Profit", cur: current.summary.profit, prev: previous?.summary.profit ?? 0, profit: true },
              { label: "Operating Costs", cur: current.summary.operatingCost, prev: previous?.summary.operatingCost ?? 0 },
              { label: "Operating Profit", cur: current.summary.operatingProfit, prev: previous?.summary.operatingProfit ?? 0, profit: true },
            ] as const).map(card => (
              <Card key={card.label}>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-2xl font-bold font-display ${("profit" in card) && card.cur < 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(card.cur)}
                    </p>
                    {previous && renderDelta(card.cur, card.prev)}
                  </div>
                  {previous && (
                    <p className="text-xs text-muted-foreground mt-1">Previous: {formatCurrency(card.prev)}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="section-title">Sales Trend{previous ? " — Current vs Previous" : ""}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                {comparisonTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                      <XAxis dataKey="date" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                      <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="current" name="Current" stroke="hsl(221, 83%, 53%)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                      {previous && (
                        <Line type="monotone" dataKey="previous" name="Previous" stroke="hsl(24, 95%, 53%)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} connectNulls />
                      )}
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
                {sourceCompareData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sourceCompareData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                        <XAxis dataKey="name" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                        <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="current" name="Current" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                        {previous && <Bar dataKey="previous" name="Previous" fill="hsl(24, 95%, 53%)" radius={[4, 4, 0, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground">No sales data for this period</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="section-title">Payment Source Split</CardTitle></CardHeader>
              <CardContent>
                {paymentCompareData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paymentCompareData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                        <XAxis dataKey="name" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                        <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="current" name="Current" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                        {previous && <Bar dataKey="previous" name="Previous" fill="hsl(24, 95%, 53%)" radius={[4, 4, 0, 0]} />}
                      </BarChart>
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
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="section-title">Employee Sales Performance</CardTitle>
                <Select value={empSourceFilter} onValueChange={(v) => setEmpSourceFilter(v as SourceFilter)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {employeeCompareRows.length > 0 ? (
                <>
                  <div className="h-64 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employeeCompareRows.map(r => ({ name: r.name, current: r.cur.s, previous: r.prev.s }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                        <XAxis dataKey="name" fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} />
                        <YAxis fontSize={12} tick={{ fill: "hsl(220, 9%, 46%)" }} tickFormatter={v => `₹${v}`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="current" name="Current" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                        {previous && <Bar dataKey="previous" name="Previous" fill="hsl(24, 95%, 53%)" radius={[4, 4, 0, 0]} />}
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
                        {previous && <TableHead className="text-right">Previous Sales</TableHead>}
                        {previous && <TableHead className="text-right">Change</TableHead>}
                        <TableHead className="text-right">Avg per Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeCompareRows.map(emp => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-muted-foreground capitalize">{emp.role}</TableCell>
                          <TableCell className="text-center">{emp.cur.c}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(emp.cur.s)}</TableCell>
                          {previous && <TableCell className="text-right text-muted-foreground">{formatCurrency(emp.prev.s)}</TableCell>}
                          {previous && <TableCell className="text-right">{renderDelta(emp.cur.s, emp.prev.s)}</TableCell>}
                          <TableCell className="text-right">{emp.cur.c > 0 ? formatCurrency(Math.round(emp.cur.s / emp.cur.c)) : "—"}</TableCell>
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

        <TabsContent value="visitors">
          <ShopVisitorsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
