import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Video, X, Loader2 } from "lucide-react";
import PhotoUploader from "@/components/inventory/PhotoUploader";
import MediaSourceDialog from "@/components/inventory/MediaSourceDialog";
import { parsePhotoUrls, serializePhotoUrls } from "@/lib/photoUtils";
import { normalizeCategoryWithMappings, loadCategoryMappings } from "@/lib/categoryUtils";

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
  buying_price?: number | null;
}

interface EditProductDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSaved: () => void;
}

export default function EditProductDialog({ product, open, onOpenChange, storeId, onSaved }: EditProductDialogProps) {
  const { toast } = useToast();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoCameraInputRef = useRef<HTMLInputElement>(null);
  const [videoSourceOpen, setVideoSourceOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentStock, setCurrentStock] = useState(0);
  const [stockAdjustment, setStockAdjustment] = useState("");
  const [stockMode, setStockMode] = useState<"add" | "set">("add");
  const [photos, setPhotos] = useState<string[]>([]);
  const [form, setForm] = useState({
    sku: "", name: "", category: "", subcategory: "", brand: "", size: "", color: "",
    selling_price: "", mrp: "", tax_rate: "18", buying_price: "",
    video_url: "" as string | null,
  });

  const [lastProductId, setLastProductId] = useState<string | null>(null);
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id);
    setCurrentStock(product.total_stock ?? 0);
    setStockAdjustment("");
    setStockMode("add");
    setPhotos(parsePhotoUrls(product.photo_url));
    setForm({
      sku: product.sku,
      name: product.name,
      category: product.category || "",
      subcategory: product.subcategory || "",
      brand: product.brand || "",
      size: product.size || "",
      color: product.color || "",
      selling_price: String(product.selling_price),
      mrp: product.mrp ? String(product.mrp) : "",
      tax_rate: String(product.tax_rate),
      buying_price: product.buying_price ? String(product.buying_price) : "",
      video_url: product.video_url,
    });
  }

  const uploadVideo = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${storeId}/${product?.id || "new"}-video-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(path);
      setForm(f => ({ ...f, video_url: urlData.publicUrl }));
      toast({ title: "Video uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    try {
      await loadCategoryMappings(storeId);
      const { error } = await supabase
        .from("products")
        .update({
          sku: form.sku,
          name: form.name,
          category: normalizeCategoryWithMappings(form.category, "category"),
          subcategory: normalizeCategoryWithMappings(form.subcategory, "subcategory"),
          brand: form.brand || null,
          size: normalizeCategoryWithMappings(form.size, "size"),
          color: normalizeCategoryWithMappings(form.color, "color"),
          selling_price: parseFloat(form.selling_price),
          mrp: form.mrp ? parseFloat(form.mrp) : null,
          tax_rate: parseFloat(form.tax_rate),
          buying_price: form.buying_price ? parseFloat(form.buying_price) : 0,
          photo_url: serializePhotoUrls(photos),
          video_url: form.video_url || null,
        })
        .eq("id", product.id);

      if (error) throw error;

      if (stockAdjustment && parseInt(stockAdjustment) !== 0) {
        const adj = parseInt(stockAdjustment);
        if (stockMode === "set") {
          const diff = adj - currentStock;
          if (diff !== 0) {
            await supabase.from("inventory_batches").insert({
              product_id: product.id,
              store_id: storeId,
              buying_price: form.buying_price ? parseFloat(form.buying_price) : 0,
              quantity: diff,
              batch_number: `ADJ-${Date.now()}`,
            });
          }
        } else {
          await supabase.from("inventory_batches").insert({
            product_id: product.id,
            store_id: storeId,
            buying_price: form.buying_price ? parseFloat(form.buying_price) : 0,
            quantity: adj,
            batch_number: `ADJ-${Date.now()}`,
          });
        }
      }

      toast({ title: "Product updated" });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>SKU *</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} required /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Subcategory</Label><Input value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} /></div>
            <div><Label>Brand</Label><Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></div>
            <div><Label>Size</Label><Input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} /></div>
            <div><Label>Color</Label><Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></div>
            <div><Label>Selling Price *</Label><Input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} required /></div>
            <div><Label>MRP</Label><Input type="number" step="0.01" value={form.mrp} onChange={e => setForm({ ...form, mrp: e.target.value })} /></div>
            <div><Label>Tax Rate %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></div>
            <div><Label>Buying Price</Label><Input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({ ...form, buying_price: e.target.value })} /></div>
          </div>

          {/* Media Section */}
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-medium">Product Media</p>
            <PhotoUploader photos={photos} onChange={setPhotos} storeId={storeId} productId={product?.id} />

            {/* Video */}
            <div>
              <Label className="text-xs text-muted-foreground">Product Video</Label>
              {form.video_url ? (
                <div className="relative mt-1">
                  <video src={form.video_url} controls className="w-48 h-32 rounded-lg border object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, video_url: null }))}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  disabled={uploading}
                  onClick={() => setVideoSourceOpen(true)}
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Video className="h-4 w-4 mr-2" />}
                  Upload Video
                </Button>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadVideo(file);
                  e.target.value = "";
                }}
              />
              <input
                ref={videoCameraInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadVideo(file);
                  e.target.value = "";
                }}
              />
              <MediaSourceDialog
                open={videoSourceOpen}
                onOpenChange={setVideoSourceOpen}
                mediaType="video"
                onSelect={(source) => {
                  const target = source === "camera" ? videoCameraInputRef.current : videoInputRef.current;
                  if (target) {
                    target.value = "";
                    target.click();
                  }
                }}
              />
            </div>
          </div>


          {/* Stock Section */}
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Stock Management</p>
              <span className="text-sm text-muted-foreground">Current: <span className="font-semibold text-foreground">{currentStock}</span></span>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  {stockMode === "add" ? "Add/Remove Quantity" : "Set Stock To"}
                </Label>
                <div className="flex gap-1 items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => setStockAdjustment(prev => String((parseInt(prev) || 0) - 1))}
                  >
                    −
                  </Button>
                  <Input
                    type="number"
                    value={stockAdjustment}
                    onChange={e => setStockAdjustment(e.target.value)}
                    placeholder={stockMode === "add" ? "e.g. 10 or -5" : "e.g. 50"}
                    className="text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => setStockAdjustment(prev => String((parseInt(prev) || 0) + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => setStockMode(m => m === "add" ? "set" : "add")}
              >
                {stockMode === "add" ? "Switch to Set" : "Switch to Add"}
              </Button>
            </div>
            {stockAdjustment && parseInt(stockAdjustment) !== 0 && (
              <p className="text-xs text-muted-foreground">
                New stock will be: <span className="font-semibold text-foreground">
                  {stockMode === "set" ? parseInt(stockAdjustment) : currentStock + parseInt(stockAdjustment)}
                </span>
              </p>
            )}
          </div>

          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
