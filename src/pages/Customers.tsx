import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Users, Download, Upload, FileDown } from "lucide-react";
import { toast } from "sonner";

const SAMPLE_CSV = `name,mobile,email,gender,location
John Doe,9876543210,john@example.com,male,Mumbai
Jane Smith,9876543211,jane@example.com,female,Delhi`;

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  }).filter(row => row.mobile);
}

export default function Customers() {
  const { storeId } = useStore();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!storeId) return;
    supabase
      .from("customers")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCustomers(data ?? []));
  }, [storeId]);

  const filtered = customers.filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    c.mobile.includes(search)
  );

  const handleExport = () => {
    if (customers.length === 0) {
      toast.error("No customers to export");
      return;
    }
    const headers = ["name", "mobile", "email", "gender", "location", "total_spent", "loyalty_points", "visit_count"];
    const rows = customers.map(c =>
      headers.map(h => `"${(c[h] ?? "").toString().replace(/"/g, '""')}"`).join(",")
    );
    downloadCSV([headers.join(","), ...rows].join("\n"), "customers.csv");
    toast.success(`Exported ${customers.length} customers`);
  };

  const handleSampleDownload = () => {
    downloadCSV(SAMPLE_CSV, "sample_customers.csv");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    setUploading(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("No valid rows found. Ensure CSV has 'mobile' column.");
        return;
      }

      const inserts = rows.map(r => ({
        store_id: storeId,
        name: r.name || null,
        mobile: r.mobile,
        email: r.email || null,
        gender: r.gender || null,
        location: r.location || null,
      }));

      // Upsert by mobile + store_id: skip duplicates
      let added = 0;
      let skipped = 0;
      const existingMobiles = new Set(customers.map(c => c.mobile));

      const newOnes = inserts.filter(i => {
        if (existingMobiles.has(i.mobile)) { skipped++; return false; }
        return true;
      });

      if (newOnes.length > 0) {
        const { error } = await supabase.from("customers").insert(newOnes);
        if (error) throw error;
        added = newOnes.length;
      }

      toast.success(`Added ${added} customers, ${skipped} duplicates skipped`);

      // Refresh
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      setCustomers(data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-header">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{customers.length} customers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleSampleDownload}>
            <FileDown className="h-4 w-4 mr-1" /> Sample CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading..." : "Upload CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or mobile..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Total Spent</TableHead>
              <TableHead className="text-right">Loyalty Points</TableHead>
              <TableHead className="text-right">Visits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No customers yet</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name || "—"}</TableCell>
                <TableCell>{c.mobile}</TableCell>
                <TableCell className="capitalize">{c.gender || "—"}</TableCell>
                <TableCell>{c.location || "—"}</TableCell>
                <TableCell className="text-right">₹{Number(c.total_spent).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{c.loyalty_points}</Badge>
                </TableCell>
                <TableCell className="text-right">{c.visit_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
