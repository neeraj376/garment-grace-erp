import { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Search, Package, Download, Pencil, Trash2, Filter, X, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import EditProductDialog from "@/components/inventory/EditProductDialog";
import { normalizeCategory, normalizeCategoryWithMappings, loadCategoryMappings } from "@/lib/categoryUtils";
import PhotoUploader from "@/components/inventory/PhotoUploader";
import { parsePhotoUrls, serializePhotoUrls } from "@/lib/photoUtils";
import { usePermissions } from "@/hooks/usePermissions";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  selling_price: number;
  mrp: number | null;
  tax_rate: number;
  photo_url: string | null;
  video_url: string | null;
  is_active: boolean;
  total_stock?: number;
  sold_quantity?: number;
  last_stock_added_at?: string | null;
  buying_price?: number | null;
  inventory_batches?: { quantity: number; buying_price: number }[];
}

export default function Inventory() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const { role, can_upload_inventory, can_edit_invoices } = usePermissions();
  const isOwner = role === "owner";
  const canUpload = isOwner || can_upload_inventory;
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [filterBrand, setFilterBrand] = useState("__all__");
  const [filterSize, setFilterSize] = useState("__all__");
  const [filterColor, setFilterColor] = useState("__all__");
  const [filterStock, setFilterStock] = useState("__all__");
  const [filterBuyingPriceMin, setFilterBuyingPriceMin] = useState("");
  const [filterBuyingPriceMax, setFilterBuyingPriceMax] = useState("");
  const [filterMissingBuyingPrice, setFilterMissingBuyingPrice] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    sku: "", name: "", category: "", brand: "", size: "", color: "",
    selling_price: "", mrp: "", tax_rate: "5", buying_price: "", quantity: "",
  });
  const [newProductPhotos, setNewProductPhotos] = useState<string[]>([]);
  const [csvProgress, setCsvProgress] = useState<{ current: number; total: number } | null>(null);
  const [soldDialogOpen, setSoldDialogOpen] = useState(false);
  const [soldInvoicesLoading, setSoldInvoicesLoading] = useState(false);
  const [soldInvoices, setSoldInvoices] = useState<Array<{ invoice_id: string; invoice_number: string; created_at: string; customer_name: string | null; total_amount: number; sold_qty: number; sold_value: number; }>>([]);

  const fetchProducts = async () => {
    if (!storeId) return;
    // Fetch products WITHOUT embedded inventory_batches — large embedded arrays
    // can cause partial pages (response size cap) and silently truncate the catalog
    // for users with large stores.
    let allProducts: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { console.error("Inventory products fetch error:", error); break; }
      if (!page || page.length === 0) break;
      allProducts = allProducts.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // Fetch all inventory batches for this store separately, also paginated.
    let allBatches: any[] = [];
    let bFrom = 0;
    while (true) {
      const { data: bPage, error: bErr } = await supabase
        .from("inventory_batches")
        .select("product_id, quantity, buying_price, received_at")
        .eq("store_id", storeId)
        .range(bFrom, bFrom + pageSize - 1);
      if (bErr) { console.error("Inventory batches fetch error:", bErr); break; }
      if (!bPage || bPage.length === 0) break;
      allBatches = allBatches.concat(bPage);
      if (bPage.length < pageSize) break;
      bFrom += pageSize;
    }

    const batchesByProduct = new Map<string, { quantity: number; buying_price: number }[]>();
    const latestBatchDate = new Map<string, string>();
    for (const b of allBatches) {
      const arr = batchesByProduct.get(b.product_id) || [];
      arr.push({ quantity: b.quantity, buying_price: Number(b.buying_price) });
      batchesByProduct.set(b.product_id, arr);
      if (b.received_at) {
        const prev = latestBatchDate.get(b.product_id);
        if (!prev || new Date(b.received_at) > new Date(prev)) {
          latestBatchDate.set(b.product_id, b.received_at);
        }
      }
    }

    // Fetch sold quantities from invoice_items for this store's invoices.
    // First get invoice IDs for the store, then sum quantities (minus returns) per product.
    const soldByProduct = new Map<string, number>();
    let invIds: string[] = [];
    let iFrom = 0;
    while (true) {
      const { data: invPage, error: invErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("store_id", storeId)
        .range(iFrom, iFrom + pageSize - 1);
      if (invErr) { console.error("Invoices fetch error:", invErr); break; }
      if (!invPage || invPage.length === 0) break;
      invIds = invIds.concat(invPage.map((i: any) => i.id));
      if (invPage.length < pageSize) break;
      iFrom += pageSize;
    }
    if (invIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < invIds.length; i += chunkSize) {
        const chunk = invIds.slice(i, i + chunkSize);
        let itFrom = 0;
        while (true) {
          const { data: items, error: itErr } = await supabase
            .from("invoice_items")
            .select("product_id, quantity, returned_quantity")
            .in("invoice_id", chunk)
            .range(itFrom, itFrom + pageSize - 1);
          if (itErr) { console.error("Invoice items fetch error:", itErr); break; }
          if (!items || items.length === 0) break;
          for (const it of items) {
            const sold = (it.quantity || 0) - (it.returned_quantity || 0);
            soldByProduct.set(it.product_id, (soldByProduct.get(it.product_id) || 0) + sold);
          }
          if (items.length < pageSize) break;
          itFrom += pageSize;
        }
      }
    }

    const mapped = allProducts.map((p: any) => {
      const batches = batchesByProduct.get(p.id) || [];
      return {
        ...p,
        inventory_batches: batches,
        total_stock: batches.reduce((s, b) => s + b.quantity, 0),
        sold_quantity: soldByProduct.get(p.id) || 0,
        last_stock_added_at: latestBatchDate.get(p.id) || null,
      };
    });
    setProducts(mapped);
  };

  useEffect(() => { fetchProducts(); }, [storeId]);

  // Load DB mappings on mount
  useEffect(() => { if (storeId) loadCategoryMappings(storeId); }, [storeId]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    try {
        const { data: product, error } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            sku: form.sku || `SKU-${Date.now()}`,
            name: form.name,
            category: normalizeCategoryWithMappings(form.category, "category"),
            brand: form.brand || null,
            size: normalizeCategoryWithMappings(form.size, "size"),
            color: normalizeCategoryWithMappings(form.color, "color"),
            selling_price: parseFloat(form.selling_price),
            mrp: form.mrp ? parseFloat(form.mrp) : null,
            tax_rate: parseFloat(form.tax_rate),
            buying_price: form.buying_price ? parseFloat(form.buying_price) : 0,
            photo_url: serializePhotoUrls(newProductPhotos),
          })
        .select()
        .single();

      if (error) throw error;

      if (form.buying_price && form.quantity) {
        await supabase.from("inventory_batches").insert({
          product_id: product.id,
          store_id: storeId,
          buying_price: parseFloat(form.buying_price),
          quantity: parseInt(form.quantity),
        });
      }

      toast({ title: "Product added" });
      setDialogOpen(false);
      setForm({ sku: "", name: "", category: "", brand: "", size: "", color: "", selling_price: "", mrp: "", tax_rate: "5", buying_price: "", quantity: "" });
      setNewProductPhotos([]);
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const cleanNumber = (val: string | undefined): number => {
    if (!val) return 0;
    const cleaned = val.replace(/[₹$€£,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    console.log("CSV headers detected:", headers);

    const totalRows = lines.length - 1;
    setCsvProgress({ current: 0, total: totalRows });

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

      const sellingPrice = cleanNumber(row.selling_price || row.price || row.sp || row.rate);
      const mrpVal = cleanNumber(row.mrp || row.maximum_retail_price);
      const buyingPrice = cleanNumber(row.buying_price || row.purchase_price || row.purchasprice || row.purchaseprice || row.cost_price || row.cost || row.bp || row.cp);
      const quantity = parseInt(row.quantity || row.qty || row.stock || row.opening_stock || "0") || 0;
      const taxRate = cleanNumber(row.tax_rate || row.gst || row.tax) || 5;

      try {
        const photoUrl = row.photo_url || row.image_url || row.image || row.photo || row.picture || null;
        const { data: product, error } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            sku: row.sku || row.sku_code || row.barcode || `SKU-${Date.now()}-${i}`,
            name: row.name || row.product_name || row.product || row.item || row.item_name || "Unnamed",
            category: normalizeCategoryWithMappings(row.category, "category") || null,
            subcategory: normalizeCategoryWithMappings(row.subcategory || row.sub_category, "subcategory") || null,
            brand: row.brand || null,
            size: normalizeCategoryWithMappings(row.size, "size"),
            color: normalizeCategoryWithMappings(row.color || row.colour, "color"),
            selling_price: sellingPrice,
            mrp: mrpVal || null,
            tax_rate: taxRate,
            buying_price: buyingPrice,
            photo_url: photoUrl || null,
          })
          .select()
          .single();

        if (error) { console.error(`Row ${i} insert error:`, error.message); setCsvProgress({ current: i, total: totalRows }); continue; }

        if (product && (buyingPrice > 0 || quantity > 0)) {
          await supabase.from("inventory_batches").insert({
            product_id: product.id,
            store_id: storeId,
            buying_price: buyingPrice,
            quantity: quantity,
          });
        }
        count++;
      } catch (err: any) { console.error(`Row ${i} error:`, err.message); }
      setCsvProgress({ current: i, total: totalRows });
    }

    toast({ title: `${count} products imported` });
    setCsvProgress(null);
    fetchProducts();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const priceFileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdatePricesCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));

    console.log("Price update CSV headers:", headers);

    let updated = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

      const sku = row.sku || row.sku_code || row.barcode || '';
      if (!sku) continue;

      const buyingPrice = cleanNumber(row.buying_price || row.purchase_price || row.purchasprice || row.purchaseprice || row.cost_price || row.cost || row.bp || row.cp);
      if (buyingPrice <= 0) continue;

      const { error } = await supabase
        .from("products")
        .update({ buying_price: buyingPrice })
        .eq("store_id", storeId)
        .eq("sku", sku)
        .eq("is_active", true);

      if (error) { console.error(`Row ${i} price update error:`, error.message); continue; }
      updated++;
    }

    toast({ title: `${updated} product prices updated` });
    fetchProducts();
    if (priceFileInputRef.current) priceFileInputRef.current.value = "";
  };

  const handleDownloadCSV = () => {
    const headers = ["SKU", "Name", "Category", "Subcategory", "Brand", "Size", "Color", "Selling Price", "MRP", "Tax Rate %", "Purchase Price", "Stock", "Photo URL"];
    const rows = products.map(p => {
      const batches = p.inventory_batches || [];
      const avgBuyingPrice = batches.length
        ? (batches.reduce((s, b) => s + Number(b.buying_price), 0) / batches.length).toFixed(2)
        : "";
      return [
        p.sku, p.name, p.category || "", p.subcategory || "", p.brand || "", p.size || "", p.color || "",
        p.selling_price, p.mrp ?? "", p.tax_rate, avgBuyingPrice, p.total_stock ?? 0, p.photo_url || "",
      ];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", productId);
      if (error) throw error;
      toast({ title: "Product deleted" });
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} product(s)?`)) return;
    try {
      const ids = Array.from(selectedIds);
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from("products")
          .update({ is_active: false })
          .in("id", batch);
        if (error) throw error;
      }
      toast({ title: `${selectedIds.size} product(s) deleted` });
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const openSoldInvoices = async () => {
    if (!storeId) return;
    setSoldDialogOpen(true);
    setSoldInvoicesLoading(true);
    setSoldInvoices([]);
    try {
      const productIdSet = new Set(filtered.map(p => p.id));
      if (productIdSet.size === 0) { setSoldInvoicesLoading(false); return; }

      // 1. Get this store's invoice ids
      const pageSize = 1000;
      let invIds: string[] = [];
      let iFrom = 0;
      while (true) {
        const { data, error } = await supabase
          .from("invoices")
          .select("id")
          .eq("store_id", storeId)
          .range(iFrom, iFrom + pageSize - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        invIds = invIds.concat(data.map((r: any) => r.id));
        if (data.length < pageSize) break;
        iFrom += pageSize;
      }
      if (invIds.length === 0) { setSoldInvoicesLoading(false); return; }

      // 2. Fetch invoice items for those invoices, restricted to filtered products
      const productIds = Array.from(productIdSet);
      const aggregate = new Map<string, { sold_qty: number; sold_value: number }>();
      const chunkSize = 200;
      for (let i = 0; i < invIds.length; i += 500) {
        const invChunk = invIds.slice(i, i + 500);
        for (let j = 0; j < productIds.length; j += chunkSize) {
          const prodChunk = productIds.slice(j, j + chunkSize);
          let itFrom = 0;
          while (true) {
            const { data: items, error } = await supabase
              .from("invoice_items")
              .select("invoice_id, product_id, quantity, returned_quantity, unit_price, total")
              .in("invoice_id", invChunk)
              .in("product_id", prodChunk)
              .range(itFrom, itFrom + pageSize - 1);
            if (error) { console.error(error); break; }
            if (!items || items.length === 0) break;
            for (const it of items as any[]) {
              const netQty = (it.quantity || 0) - (it.returned_quantity || 0);
              if (netQty <= 0) continue;
              const ratio = it.quantity > 0 ? netQty / it.quantity : 0;
              const netValue = Number(it.total || 0) * ratio;
              const cur = aggregate.get(it.invoice_id) || { sold_qty: 0, sold_value: 0 };
              cur.sold_qty += netQty;
              cur.sold_value += netValue;
              aggregate.set(it.invoice_id, cur);
            }
            if (items.length < pageSize) break;
            itFrom += pageSize;
          }
        }
      }

      const matchingInvIds = Array.from(aggregate.keys());
      if (matchingInvIds.length === 0) { setSoldInvoicesLoading(false); return; }

      // 3. Fetch invoice metadata in chunks
      const invMeta = new Map<string, { invoice_number: string; created_at: string; total_amount: number; customer_id: string | null }>();
      for (let i = 0; i < matchingInvIds.length; i += 500) {
        const chunk = matchingInvIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from("invoices")
          .select("id, invoice_number, created_at, total_amount, customer_id")
          .in("id", chunk);
        if (error) { console.error(error); continue; }
        for (const inv of (data || []) as any[]) {
          invMeta.set(inv.id, {
            invoice_number: inv.invoice_number,
            created_at: inv.created_at,
            total_amount: Number(inv.total_amount || 0),
            customer_id: inv.customer_id,
          });
        }
      }

      // 4. Fetch customer names
      const custIds = Array.from(new Set(Array.from(invMeta.values()).map(m => m.customer_id).filter(Boolean) as string[]));
      const custName = new Map<string, string>();
      for (let i = 0; i < custIds.length; i += 500) {
        const chunk = custIds.slice(i, i + 500);
        const { data } = await supabase.from("customers").select("id, name, mobile").in("id", chunk);
        for (const c of (data || []) as any[]) custName.set(c.id, c.name || c.mobile || "—");
      }

      const rows = matchingInvIds.map(id => {
        const meta = invMeta.get(id);
        const agg = aggregate.get(id)!;
        return {
          invoice_id: id,
          invoice_number: meta?.invoice_number || "—",
          created_at: meta?.created_at || "",
          customer_name: meta?.customer_id ? custName.get(meta.customer_id) || null : null,
          total_amount: meta?.total_amount || 0,
          sold_qty: agg.sold_qty,
          sold_value: Math.round(agg.sold_value * 100) / 100,
        };
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSoldInvoices(rows);
    } finally {
      setSoldInvoicesLoading(false);
    }
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort() as string[];
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort() as string[];
  const sizes = [...new Set(products.map(p => p.size).filter(Boolean))].sort() as string[];
  const colors = [...new Set(products.map(p => p.color).filter(Boolean))].sort() as string[];

  const hasActiveFilters = filterCategory !== "__all__" || filterBrand !== "__all__" || filterSize !== "__all__" || filterColor !== "__all__" || filterStock !== "__all__" || filterBuyingPriceMin !== "" || filterBuyingPriceMax !== "" || filterMissingBuyingPrice;

  const clearFilters = () => {
    setFilterCategory("__all__");
    setFilterBrand("__all__");
    setFilterSize("__all__");
    setFilterColor("__all__");
    setFilterStock("__all__");
    setFilterBuyingPriceMin("");
    setFilterBuyingPriceMax("");
    setFilterMissingBuyingPrice(false);
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.color || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.size || "").toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === "__all__" || p.category === filterCategory;
    const matchesBrand = filterBrand === "__all__" || p.brand === filterBrand;
    const matchesSize = filterSize === "__all__" || p.size === filterSize;
    const matchesColor = filterColor === "__all__" || p.color === filterColor;
    const matchesStock = filterStock === "__all__" ||
      (filterStock === "in_stock" && (p.total_stock ?? 0) > 0) ||
      (filterStock === "out_of_stock" && (p.total_stock ?? 0) <= 0);
    const positiveBatchBuyingPrices = (p.inventory_batches ?? [])
      .map((b) => Number(b.buying_price))
      .filter((price) => price > 0);
    const effectiveBuyingPrice = positiveBatchBuyingPrices.length > 0
      ? positiveBatchBuyingPrices.reduce((sum, price) => sum + price, 0) / positiveBatchBuyingPrices.length
      : Number(p.buying_price ?? 0);
    const matchesBuyingPriceMin = filterBuyingPriceMin === "" || effectiveBuyingPrice >= parseFloat(filterBuyingPriceMin);
    const matchesBuyingPriceMax = filterBuyingPriceMax === "" || effectiveBuyingPrice <= parseFloat(filterBuyingPriceMax);
    const matchesMissingBuyingPrice = !filterMissingBuyingPrice || effectiveBuyingPrice === 0;
    return matchesSearch && matchesCategory && matchesBrand && matchesSize && matchesColor && matchesStock && matchesBuyingPriceMin && matchesBuyingPriceMax && matchesMissingBuyingPrice;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-semibold text-foreground">{filtered.length}</span> products · <span className="font-semibold text-foreground">{filtered.reduce((sum, p) => sum + (p.total_stock ?? 0), 0).toLocaleString("en-IN")}</span> pieces in stock
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          {canUpload && (
            <>
              <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload} />
              <input type="file" ref={priceFileInputRef} accept=".csv" className="hidden" onChange={handleUpdatePricesCSV} />
              <Button variant="outline" onClick={() => priceFileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Update Prices
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Import CSV
              </Button>
              <Button variant="link" size="sm" className="text-xs px-1" onClick={() => {
                const sampleHeaders = ["sku","name","category","subcategory","brand","size","color","selling_price","mrp","tax_rate","buying_price","quantity","photo_url"];
                const sampleRow = ["SKU001","Sample Product","Shirts","Casual","BrandX","M","Blue","999","1199","5","500","10","https://example.com/image.jpg"];
                const csv = [sampleHeaders.join(","), sampleRow.join(",")].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "sample-inventory-template.csv"; a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="h-3 w-3 mr-1" /> Sample CSV
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Product</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddProduct} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="Auto-generated if empty" /></div>
                      <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                      <div>
                        <Label>Category</Label>
                        <Input list="inv-categories" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Select or type new" />
                        <datalist id="inv-categories">
                          {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div>
                        <Label>Brand</Label>
                        <Input list="inv-brands" value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} placeholder="Select or type new" />
                        <datalist id="inv-brands">
                          {brands.map(b => <option key={b} value={b} />)}
                        </datalist>
                      </div>
                      <div>
                        <Label>Size</Label>
                        <Input list="inv-sizes" value={form.size} onChange={e => setForm({...form, size: e.target.value})} placeholder="Select or type new" />
                        <datalist id="inv-sizes">
                          {sizes.map(s => <option key={s} value={s} />)}
                        </datalist>
                      </div>
                      <div>
                        <Label>Color</Label>
                        <Input list="inv-colors" value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="Select or type new" />
                        <datalist id="inv-colors">
                          {colors.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div><Label>Selling Price *</Label><Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} required /></div>
                      <div><Label>MRP</Label><Input type="number" step="0.01" value={form.mrp} onChange={e => setForm({...form, mrp: e.target.value})} /></div>
                      <div><Label>Tax Rate %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={e => setForm({...form, tax_rate: e.target.value})} /></div>
                    </div>
                    <div className="border-t pt-3 space-y-3">
                      <PhotoUploader photos={newProductPhotos} onChange={setNewProductPhotos} storeId={storeId!} />
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-sm font-medium mb-2">Initial Stock (optional)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Buying Price</Label><Input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({...form, buying_price: e.target.value})} /></div>
                        <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
                      </div>
                    </div>
                    <Button type="submit" className="w-full">Add Product</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, SKU, brand, category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" /> Filters
            {hasActiveFilters && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{[filterCategory, filterBrand, filterSize, filterColor, filterStock].filter(f => f !== "__all__").length + (filterBuyingPriceMin !== "" ? 1 : 0) + (filterBuyingPriceMax !== "" ? 1 : 0) + (filterMissingBuyingPrice ? 1 : 0)}</Badge>}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
          {canUpload && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size} selected
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-3 rounded-lg border bg-muted/30">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40 bg-background"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-40 bg-background"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Brands</SelectItem>
                {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSize} onValueChange={setFilterSize}>
              <SelectTrigger className="w-32 bg-background"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Sizes</SelectItem>
                {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterColor} onValueChange={setFilterColor}>
              <SelectTrigger className="w-32 bg-background"><SelectValue placeholder="Color" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Colors</SelectItem>
                {colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStock} onValueChange={setFilterStock}>
              <SelectTrigger className="w-36 bg-background"><SelectValue placeholder="Stock" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Stock</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Buying ₹</span>
              <Input type="number" placeholder="Min" value={filterBuyingPriceMin} onChange={e => setFilterBuyingPriceMin(e.target.value)} className="w-24 h-9 bg-background" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="number" placeholder="Max" value={filterBuyingPriceMax} onChange={e => setFilterBuyingPriceMax(e.target.value)} className="w-24 h-9 bg-background" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="missing-buying-price"
                checked={filterMissingBuyingPrice}
                onCheckedChange={(checked) => setFilterMissingBuyingPrice(Boolean(checked))}
              />
              <Label htmlFor="missing-buying-price" className="text-sm cursor-pointer">No Buying Price</Label>
            </div>
          </div>
        )}
      </div>

      {csvProgress && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Importing products…</span>
            <span className="tabular-nums text-muted-foreground">
              {csvProgress.current} / {csvProgress.total}
            </span>
          </div>
          <Progress value={(csvProgress.current / csvProgress.total) * 100} className="h-2" />
        </div>
      )}

      <Card className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {canUpload && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-12"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Sub Category</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="whitespace-nowrap">Stock Added</TableHead>
              {canUpload && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
              <TableCell colSpan={canUpload ? 12 : 10} className="text-center py-12">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No products found</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className={selectedIds.has(p.id) ? "bg-muted/50" : ""}>
                  {canUpload && (
                    <TableCell className="p-2">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={() => toggleSelect(p.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="p-1">
                    {(() => {
                      const photos = parsePhotoUrls(p.photo_url);
                      return photos.length > 0 ? (
                        <img src={photos[0]} alt={p.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.subcategory || "—"}</TableCell>
                  <TableCell>
                    {p.size && <Badge variant="secondary" className="mr-1">{p.size}</Badge>}
                    {p.color && <Badge variant="outline">{p.color}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">₹{Number(p.selling_price).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.total_stock! > 0 ? "default" : "destructive"}>
                      {p.total_stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {(p.sold_quantity ?? 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {p.last_stock_added_at
                      ? new Date(p.last_stock_added_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </TableCell>
                  {canUpload && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditProduct(p); setEditOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProduct(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Inventory Summary */}
      {(() => {
        const totalProducts = filtered.length;
        const inStockProducts = filtered.filter(p => (p.total_stock ?? 0) > 0).length;
        const outOfStockProducts = totalProducts - inStockProducts;
        const inStockPieces = filtered.reduce((sum, p) => sum + (p.total_stock ?? 0), 0);
        const soldPieces = filtered.reduce((sum, p) => sum + (p.sold_quantity ?? 0), 0);
        const totalPieces = inStockPieces + soldPieces;
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="rounded-lg border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">{totalProducts.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Inventory (pcs)</p>
              <p className="text-2xl font-bold">{totalPieces.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">in-stock + sold</p>
            </div>
            <div className="rounded-lg border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">In-Stock (pcs)</p>
              <p className="text-2xl font-bold text-success">{inStockPieces.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{inStockProducts} products</p>
            </div>
            <button
              type="button"
              onClick={openSoldInvoices}
              className="rounded-lg border bg-card p-4 text-center hover:bg-accent hover:border-primary/50 transition-colors cursor-pointer"
              title="Click to view invoices"
            >
              <p className="text-sm text-muted-foreground">Sold (pcs)</p>
              <p className="text-2xl font-bold text-primary">{soldPieces.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">net of returns · click to view</p>
            </button>
            <div className="rounded-lg border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">Out of Stock</p>
              <p className="text-2xl font-bold text-destructive">{outOfStockProducts.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">products</p>
            </div>
          </div>
        );
      })()}

      {canUpload && storeId && (
        <EditProductDialog
          product={editProduct}
          open={editOpen}
          onOpenChange={setEditOpen}
          storeId={storeId}
          onSaved={fetchProducts}
        />
      )}

      <Dialog open={soldDialogOpen} onOpenChange={setSoldDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Invoices with sold items
              {!soldInvoicesLoading && soldInvoices.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({soldInvoices.length} invoice{soldInvoices.length === 1 ? "" : "s"})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {soldInvoicesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading invoices…
            </div>
          ) : soldInvoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No invoices found for the current filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Item Value</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soldInvoices.map(r => (
                  <TableRow key={r.invoice_id}>
                    <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>{r.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sold_qty.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.sold_value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.total_amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Link to={`/invoice/${r.invoice_id}`} target="_blank" className="text-primary hover:opacity-70">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}
