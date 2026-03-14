import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, X, Trash2, Package, RefreshCw, Image, ExternalLink, ArrowRightLeft } from "lucide-react";
import PhotoPreviewDialog from "@/components/photos/PhotoPreviewDialog";
import { parsePhotoUrls, serializePhotoUrls, MAX_PHOTOS } from "@/lib/photoUtils";

interface ProductWithPhotos {
  id: string;
  sku: string;
  name: string;
  photo_url: string | null;
  category: string | null;
  brand: string | null;
}

interface AssignedPhotosTabProps {
  storeId: string | null;
}

export default function AssignedPhotosTab({ storeId }: AssignedPhotosTabProps) {
  const { toast } = useToast();

  const [products, setProducts] = useState<ProductWithPhotos[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Preview
  const [previewProduct, setPreviewProduct] = useState<ProductWithPhotos | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);

  // Reassign dialog
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignPhoto, setReassignPhoto] = useState<{ url: string; fromProduct: ProductWithPhotos; photoIndex: number } | null>(null);
  const [allProducts, setAllProducts] = useState<ProductWithPhotos[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      let all: ProductWithPhotos[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, sku, name, photo_url, category, brand")
          .eq("store_id", storeId)
          .eq("is_active", true)
          .not("photo_url", "is", null)
          .order("name")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < pageSize) break;
        from += pageSize;
      }
      // Filter to only products that actually have photos
      setProducts(all.filter((p) => parsePhotoUrls(p.photo_url).length > 0));
    } catch (err: any) {
      toast({ title: "Failed to load products", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [storeId, toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const removePhotoFromProduct = async (product: ProductWithPhotos, photoIndex: number) => {
    const photos = parsePhotoUrls(product.photo_url);
    const updated = photos.filter((_, i) => i !== photoIndex);
    try {
      const { error } = await supabase
        .from("products")
        .update({ photo_url: serializePhotoUrls(updated) })
        .eq("id", product.id);
      if (error) throw error;
      toast({ title: "Photo removed from product" });
      // Update local state
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, photo_url: serializePhotoUrls(updated) } : p)
          .filter((p) => parsePhotoUrls(p.photo_url).length > 0)
      );
    } catch (err: any) {
      toast({ title: "Failed to remove photo", description: err.message, variant: "destructive" });
    }
  };

  const openReassignDialog = async (photoUrl: string, fromProduct: ProductWithPhotos, photoIndex: number) => {
    setReassignPhoto({ url: photoUrl, fromProduct, photoIndex });
    setReassignDialogOpen(true);
    setProductSearch("");
    if (!storeId) return;
    setLoadingProducts(true);
    let all: ProductWithPhotos[] = [];
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
      all = [...all, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setAllProducts(all);
    setLoadingProducts(false);
  };

  const reassignPhotoToProduct = async (targetProduct: ProductWithPhotos) => {
    if (!reassignPhoto) return;
    setReassigning(true);
    try {
      const targetPhotos = parsePhotoUrls(targetProduct.photo_url);
      if (targetPhotos.length >= MAX_PHOTOS) {
        toast({ title: `Product already has ${MAX_PHOTOS} photos`, variant: "destructive" });
        setReassigning(false);
        return;
      }

      // Add to target
      const updatedTarget = [...targetPhotos, reassignPhoto.url];
      const { error: addError } = await supabase
        .from("products")
        .update({ photo_url: serializePhotoUrls(updatedTarget) })
        .eq("id", targetProduct.id);
      if (addError) throw addError;

      // Remove from source
      const sourcePhotos = parsePhotoUrls(reassignPhoto.fromProduct.photo_url);
      const updatedSource = sourcePhotos.filter((_, i) => i !== reassignPhoto.photoIndex);
      const { error: removeError } = await supabase
        .from("products")
        .update({ photo_url: serializePhotoUrls(updatedSource) })
        .eq("id", reassignPhoto.fromProduct.id);
      if (removeError) throw removeError;

      toast({ title: `Photo reassigned to ${targetProduct.name}` });
      setReassignDialogOpen(false);

      // Update local state
      setProducts((prev) => {
        let updated = prev.map((p) => {
          if (p.id === reassignPhoto.fromProduct.id) return { ...p, photo_url: serializePhotoUrls(updatedSource) };
          if (p.id === targetProduct.id) return { ...p, photo_url: serializePhotoUrls(updatedTarget) };
          return p;
        });
        // Add target if not in list
        if (!updated.find((p) => p.id === targetProduct.id)) {
          updated.push({ ...targetProduct, photo_url: serializePhotoUrls(updatedTarget) });
        }
        return updated.filter((p) => parsePhotoUrls(p.photo_url).length > 0);
      });
    } catch (err: any) {
      toast({ title: "Failed to reassign", description: err.message, variant: "destructive" });
    } finally {
      setReassigning(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  const filteredReassignProducts = allProducts.filter((p) => {
    if (reassignPhoto && p.id === reassignPhoto.fromProduct.id) return false;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  const totalPhotos = products.reduce((sum, p) => sum + parsePhotoUrls(p.photo_url).length, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by product name, SKU, brand..."
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
        <Button variant="outline" size="sm" onClick={loadProducts} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Badge variant="secondary">{products.length} products • {totalPhotos} photos</Badge>
      </div>

      {/* Product list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{searchQuery ? "No matching products" : "No products with assigned photos"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => {
            const photos = parsePhotoUrls(product.photo_url);
            return (
              <div
                key={product.id}
                className="rounded-lg border border-border p-3 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {photos.length}/{MAX_PHOTOS}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {product.sku}
                      {product.brand ? ` • ${product.brand}` : ""}
                      {product.category ? ` • ${product.category}` : ""}
                    </p>
                  </div>
                </div>
                {/* Photo thumbnails */}
                <div className="flex gap-2 mt-2.5">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <div
                        className="w-20 h-20 rounded-md border overflow-hidden cursor-pointer"
                        onClick={() => { setPreviewProduct(product); setPreviewPhotoIndex(idx); }}
                      >
                        <img
                          src={url}
                          alt={`${product.name} photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                      </div>
                      {/* Actions overlay */}
                      <div className="absolute inset-0 rounded-md bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 w-6 p-0 pointer-events-auto"
                          title="Reassign"
                          onClick={(e) => { e.stopPropagation(); openReassignDialog(url, product, idx); }}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 w-6 p-0 pointer-events-auto"
                          title="Remove"
                          onClick={(e) => { e.stopPropagation(); removePhotoFromProduct(product, idx); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reassign Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Reassign Photo to Another Product</DialogTitle>
          </DialogHeader>
          {reassignPhoto && (
            <div className="flex gap-3 pb-3 border-b">
              <img
                src={reassignPhoto.url}
                alt="Photo to reassign"
                className="w-16 h-16 rounded-lg object-cover border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Moving from:</p>
                <p className="text-sm font-medium truncate">{reassignPhoto.fromProduct.name}</p>
                <p className="text-xs text-muted-foreground">{reassignPhoto.fromProduct.sku}</p>
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
            ) : filteredReassignProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No products found</p>
            ) : (
              filteredReassignProducts.map((product) => {
                const existingPhotos = parsePhotoUrls(product.photo_url);
                return (
                  <button
                    key={product.id}
                    onClick={() => reassignPhotoToProduct(product)}
                    disabled={reassigning}
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
      {previewProduct && (() => {
        const photos = parsePhotoUrls(previewProduct.photo_url);
        const photoUrl = photos[previewPhotoIndex] || "";
        return (
          <PhotoPreviewDialog
            open={!!previewProduct}
            onOpenChange={(open) => { if (!open) setPreviewProduct(null); }}
            photoUrl={photoUrl}
            photoName={`${previewProduct.name} — Photo ${previewPhotoIndex + 1}`}
            storeId={storeId}
            onAssign={() => {
              if (previewProduct) {
                const product = previewProduct;
                const idx = previewPhotoIndex;
                setPreviewProduct(null);
                openReassignDialog(photoUrl, product, idx);
              }
            }}
            assignLabel="Reassign"
            onDelete={() => {
              if (previewProduct) {
                const product = previewProduct;
                const idx = previewPhotoIndex;
                setPreviewProduct(null);
                removePhotoFromProduct(product, idx);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
