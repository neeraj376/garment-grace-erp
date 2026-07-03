import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users, Search, X } from "lucide-react";

interface Visitor {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  verified_at: string;
  last_seen_at: string;
  created_at: string;
}

function formatPhone(p: string | null) {
  if (!p) return "—";
  if (p.length === 12 && p.startsWith("91")) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ShopVisitorsReport() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const pageSize = 1000;
      let from = 0;
      const all: Visitor[] = [];
      // Paginate to bypass PostgREST's default row cap and fetch all visitors
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("shop_visitors")
          .select("id, name, phone, email, verified_at, last_seen_at, created_at")
          .order("verified_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as Visitor[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setVisitors(all);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return visitors;
    return visitors.filter(
      (v) =>
        (v.name ?? "").toLowerCase().includes(s) ||
        (v.email ?? "").toLowerCase().includes(s) ||
        (v.phone ?? "").includes(s.replace(/\D/g, ""))
    );
  }, [q, visitors]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || s.length < 1) return [];
    const seen = new Set<string>();
    const out: { name: string; phone: string | null }[] = [];
    for (const v of visitors) {
      const n = v.name ?? "";
      if (n.toLowerCase().includes(s) && n.trim()) {
        if (!seen.has(n)) {
          seen.add(n);
          out.push({ name: n, phone: v.phone });
          if (out.length >= 8) break;
        }
      }
    }
    return out;
  }, [q, visitors]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function exportCsv() {
    const header = ["Name", "Email", "Phone", "Verified At", "Last Seen At"];
    const rows = filtered.map((v) => [
      `"${(v.name ?? "").replace(/"/g, '""')}"`,
      `"${(v.email ?? "").replace(/"/g, '""')}"`,
      formatPhone(v.phone),
      new Date(v.verified_at).toISOString(),
      new Date(v.last_seen_at).toISOString(),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shop-visitors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Shop Visitors
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Customers who verified their mobile number on the storefront.
            <span className="ml-2 font-medium text-foreground">{visitors.length} total</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={searchRef} className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search name or phone"
              className="pl-8 w-[220px]"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(""); setOpen(false); }}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {open && suggestions.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                {suggestions.map((s) => (
                  <li
                    key={s.name + (s.phone ?? "")}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                    onClick={() => { setQ(s.name); setOpen(false); }}
                  >
                    {s.name}
                    {s.phone && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatPhone(s.phone)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">No visitors yet</div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Verified On</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{v.email ?? "—"}</TableCell>
                    <TableCell>{formatPhone(v.phone)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(v.verified_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(v.last_seen_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
