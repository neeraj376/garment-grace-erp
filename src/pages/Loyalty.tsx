import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, TrendingUp } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

export default function Loyalty() {
  const { storeId } = useStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    if (!storeId) return;

    supabase
      .from("loyalty_transactions")
      .select("*, customers(name, mobile)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setTransactions(data ?? []));

    supabase
      .from("customers")
      .select("name, mobile, loyalty_points, total_spent")
      .eq("store_id", storeId)
      .order("loyalty_points", { ascending: false })
      .limit(10)
      .then(({ data }) => setTopCustomers(data ?? []));
  }, [storeId]);

  const totalPointsIssued = transactions
    .filter(t => t.type === "earned")
    .reduce((s, t) => s + t.points, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="page-header">Loyalty Program</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Total Points Issued" value={totalPointsIssued.toLocaleString()} icon={Award} />
        <StatCard title="Top Members" value={topCustomers.length.toString()} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="section-title">Top Loyalty Members</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium">{c.name || c.mobile}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{c.loyalty_points}</Badge>
                    </TableCell>
                    <TableCell className="text-right">₹{Number(c.total_spent).toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
                {topCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No loyalty members yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="section-title">Recent Transactions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{(t.customers as any)?.name || (t.customers as any)?.mobile || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "earned" ? "default" : "secondary"}>{t.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {t.type === "earned" ? "+" : "-"}{t.points}
                    </TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No transactions yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
