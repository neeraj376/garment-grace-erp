import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Tags } from "lucide-react";

interface Mapping {
  id: string;
  type: string;
  variation: string;
  canonical: string;
}

export default function CategoryMappingManager() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>("category");
  const [variation, setVariation] = useState("");
  const [canonical, setCanonical] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchMappings = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("category_mappings")
      .select("*")
      .eq("store_id", storeId)
      .order("canonical", { ascending: true });
    setMappings((data as Mapping[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchMappings(); }, [storeId]);

  const handleAdd = async () => {
    if (!storeId || !variation.trim() || !canonical.trim()) {
      toast({ title: "Please fill both variation and canonical name", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("category_mappings").insert({
      store_id: storeId,
      type,
      variation: variation.trim(),
      canonical: canonical.trim(),
    });
    if (error) {
      if (error.code === "23505") toast({ title: "This variation already exists", variant: "destructive" });
      else toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapping added" });
    setVariation("");
    setCanonical("");
    fetchMappings();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("category_mappings").delete().eq("id", id);
    toast({ title: "Mapping removed" });
    fetchMappings();
  };

  const filtered = mappings.filter(m => {
    if (filterType !== "all" && m.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.variation.toLowerCase().includes(q) || m.canonical.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by canonical for display
  const grouped: Record<string, Mapping[]> = {};
  filtered.forEach(m => {
    const key = `${m.type}::${m.canonical}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="section-title flex items-center gap-2">
          <Tags className="h-5 w-5" /> Category & Subcategory Mappings
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define spelling variations that auto-correct to a canonical name. E.g. "tshirt", "t shirt" → "T-Shirt"
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="w-full sm:w-36">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="subcategory">Subcategory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-xs">Spelling Variation</Label>
            <Input
              placeholder="e.g. tshirt, t shirt"
              value={variation}
              onChange={e => setVariation(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Correct Name</Label>
            <Input
              placeholder="e.g. T-Shirt"
              value={canonical}
              onChange={e => setCanonical(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="subcategory">Subcategory</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} mappings</span>
        </div>

        {loading ? (
          <p className="text-center py-6 text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground">No mappings yet. Add one above.</p>
        ) : (
          <div className="border rounded-md overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Variation</TableHead>
                  <TableHead>→ Correct Name</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(grouped).flat().map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.type === "category" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                        {m.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{m.variation}</TableCell>
                    <TableCell className="font-semibold">{m.canonical}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(m.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
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
