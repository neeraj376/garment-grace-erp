import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, X, Link2, Trash2, Package, RefreshCw, CheckCircle2 } from "lucide-react";
import PhotoPreviewDialog from "@/components/photos/PhotoPreviewDialog";
import { parsePhotoUrls, serializePhotoUrls, MAX_PHOTOS } from "@/lib/photoUtils";

interface StoragePhoto {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  photo_url: string | null;
  category: string | null;
  brand: string | null;
}

interface StoragePhotosTabProps {
  storeId: string | null;
}

export default function StoragePhotosTab({ storeId }: StoragePhotosTabProps) {
  const { toast } = useToast();

  const [storagePhotos, setStoragePhotos] = useState<StoragePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignedUrls, setAssignedUrls] = useState<Set<string>>(new Set());

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<StoragePhoto | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<StoragePhoto | null>(null);

  const loadStoragePhotos = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("product-media")
        .list(`${storeId}/bulk-photos`, {
          limit: 500,
          sortBy: { column: "created_at", order: "desc" },
        });

      if (error) throw error;

      const photos: StoragePhoto[] = (data || [])
        .filter((f) => !f.id?.startsWith(".") && f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i))
        .map((f) => {
          const { data: urlData } = supabase.storage
            .from("product-media")
            .getPublicUrl(`${storeId}/bulk-photos/${f.name}`);
          return {
            id: f.id || f.name,
            name: f.name,
            url: urlData.publicUrl,
            created_at: f.created_at || "",
          };
        });

      setStoragePhotos(photos);
    } catch (err: any) {
      toast({ title: "Failed to load photos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [storeId, toast]);

  const loadAssignedUrls = useCallback(async () => {
    if (!storeId) return;
    try {
      let allUrls: string[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("products")
          .select("photo_url")
          .eq("store_id", storeId)
          .not("photo_url", "is", null)
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        data.forEach((p) => {
          parsePhotoUrls(p.photo_url).forEach((url) => allUrls.push(url));
        });
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setAssignedUrls(new Set(allUrls));
    } catch (err) {
      console.error("Failed to load assigned URLs", err);
    }
  }, [storeId]);

  useEffect(() => {
    loadStoragePhotos();
    loadAssignedUrls();
  }, [loadStoragePhotos, loadAssignedUrls]);

  const deletePhoto = async (photo: StoragePhoto) => {
    if (!storeId) return;
    setDeleting(photo.id);
    try {
      const { error } = await supabase.storage
        .from("product-media")
        .remove([`${storeId}/bulk-photos/${photo.name}`]);
      if (error) throw error;
      setStoragePhotos((prev) => prev.filter((p) => p.id !== photo.id));
      toast({ title: "Photo deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const openAssignDialog = async (photo: StoragePhoto) => {
    setSelectedPhoto(photo);
    setAssignDialogOpen(true);
    setProductSearch("");
    if (!storeId) return;
    setLoadingProducts(true);
    let allProducts: Product[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("products")
        .select("id, sku, name, photo_url, category, brand")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("name")
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allProducts = [...allProducts, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setProducts(allProducts);
    setLoadingProducts(false);
  };

  const assignPhotoToProduct = async (product: Product) => {
    if (!selectedPhoto) return;
    setAssigning(true);
    try {
      const existingPhotos = parsePhotoUrls(product.photo_url);
      if (existingPhotos.length >= MAX_PHOTOS) {
        toast({ title: `Product already has ${MAX_PHOTOS} photos`, variant: "destructive" });
        setAssigning(false);
        return;
      }
      const updatedPhotos = [...existingPhotos, selectedPhoto.url];
      const { error } = await supabase
        .from("products")
        .update({ photo_url: serializePhotoUrls(updatedPhotos) })
        .eq("id", product.id);
      if (error) throw error;
      toast({ title: `Photo assigned to ${product.name}` });
      setAssignDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to assign", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const filteredPhotos = storagePhotos.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadStoragePhotos} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Badge variant="secondary">{storagePhotos.length} photos</Badge>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{searchQuery ? "No matching photos" : "No uploaded photos yet"}</p>
          <p className="text-xs mt-1">Upload a ZIP file to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="relative group rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all"
            >
              <div className="aspect-square cursor-pointer" onClick={() => setPreviewPhoto(photo)}>
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
              </div>
              <div className="p-1.5 bg-background/95 backdrop-blur-sm">
                <p className="text-[10px] text-muted-foreground truncate">{photo.name}</p>
              </div>
              {/* Overlay actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs gap-1 pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); openAssignDialog(photo); }}
                >
                  <Link2 className="h-3 w-3" />
                  Assign
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 w-7 p-0 pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); deletePhoto(photo); }}
                  disabled={deleting === photo.id}
                >
                  {deleting === photo.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Assign Photo to Product</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="flex gap-3 pb-3 border-b">
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.name}
                className="w-20 h-20 rounded-lg object-cover border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedPhoto.name}</p>
              </div>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, brand, category..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
            />
            {productSearch && (
              <button
                onClick={() => setProductSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[400px]">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No products found</p>
            ) : (
              filteredProducts.map((product) => {
                const existingPhotos = parsePhotoUrls(product.photo_url);
                return (
                  <button
                    key={product.id}
                    onClick={() => assignPhotoToProduct(product)}
                    disabled={assigning}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent text-left transition-colors disabled:opacity-50"
                  >
                    {existingPhotos[0] ? (
                      <img src={existingPhotos[0]} alt="" className="w-10 h-10 rounded border object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {product.sku} {product.brand ? `• ${product.brand}` : ""} {product.category ? `• ${product.category}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {existingPhotos.length}/{MAX_PHOTOS}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Preview */}
      <PhotoPreviewDialog
        open={!!previewPhoto}
        onOpenChange={(open) => !open && setPreviewPhoto(null)}
        photoUrl={previewPhoto?.url || ""}
        photoName={previewPhoto?.name || ""}
        storagePath={previewPhoto && storeId ? `${storeId}/bulk-photos/${previewPhoto.name}` : undefined}
        storeId={storeId}
        onAssign={() => {
          if (previewPhoto) {
            setPreviewPhoto(null);
            openAssignDialog(previewPhoto);
          }
        }}
        onDelete={previewPhoto ? () => {
          const photo = previewPhoto;
          setPreviewPhoto(null);
          deletePhoto(photo);
        } : undefined}
        onImageUpdated={(newUrl) => {
          if (previewPhoto) {
            setStoragePhotos((prev) =>
              prev.map((p) => p.id === previewPhoto.id ? { ...p, url: newUrl } : p)
            );
            setPreviewPhoto((prev) => prev ? { ...prev, url: newUrl } : null);
          }
        }}
      />
    </div>
  );
}
