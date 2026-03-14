import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";
import heic2any from "heic2any";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, ImagePlus, Trash2, Link2, Search, X, Loader2, CheckCircle2, Package, FolderOpen } from "lucide-react";
import { parsePhotoUrls, serializePhotoUrls, MAX_PHOTOS } from "@/lib/photoUtils";
import StoragePhotosTab from "@/components/photos/StoragePhotosTab";
import PhotoPreviewDialog from "@/components/photos/PhotoPreviewDialog";

interface UploadedPhoto {
  id: string;
  url: string;
  filename: string;
  assignedProductId?: string;
  assignedProductName?: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  photo_url: string | null;
  category: string | null;
  brand: string | null;
}

export default function PhotoManager() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<UploadedPhoto | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<UploadedPhoto | null>(null);

  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  const getMimeType = (name: string): string => {
    const ext = name.toLowerCase().split(".").pop();
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
      tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
    };
    return mimeMap[ext || ""] || "image/jpeg";
  };

  const convertToJpg = useCallback(async (file: Blob, filename: string): Promise<Blob> => {
    const lower = filename.toLowerCase();
    let imageBlob = new Blob([file], { type: getMimeType(lower) });

    if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
      const result = await heic2any({ blob: imageBlob, toType: "image/png", quality: 0.9 });
      imageBlob = Array.isArray(result) ? result[0] : result;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(imageBlob);
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error(`Failed to convert ${filename}`));
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load ${filename}`));
      };
      img.src = url;
    });
  }, []);

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    e.target.value = "";

    setUploading(true);
    setUploadProgress(0);
    setProcessedFiles(0);

    try {
      const zip = await JSZip.loadAsync(file);
      const imageFiles: { name: string; file: JSZip.JSZipObject }[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        const lower = relativePath.toLowerCase();
        if (lower.match(/\.(png|jpg|jpeg|webp|bmp|gif|tiff?|heic|heif)$/)) {
          if (relativePath.includes("__MACOSX")) return;
          imageFiles.push({ name: relativePath.split("/").pop() || relativePath, file: zipEntry });
        }
      });

      if (imageFiles.length === 0) {
        toast({ title: "No image files found in ZIP", variant: "destructive" });
        setUploading(false);
        return;
      }

      setTotalFiles(imageFiles.length);
      const newPhotos: UploadedPhoto[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const { name, file: zipEntry } = imageFiles[i];
        try {
          const rawBlob = await zipEntry.async("blob");
          const jpgBlob = await convertToJpg(rawBlob, name);
          const baseName = name.replace(/\.[^.]+$/, "");
          const storagePath = `${storeId}/bulk-photos/${baseName}-${Date.now()}-${i}.jpg`;

          const { error } = await supabase.storage
            .from("product-media")
            .upload(storagePath, jpgBlob, { contentType: "image/jpeg", upsert: true });

          if (error) throw error;

          const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(storagePath);

          newPhotos.push({
            id: `${Date.now()}-${i}`,
            url: urlData.publicUrl,
            filename: `${baseName}.jpg`,
          });
        } catch (err: any) {
          console.error(`Failed to process ${name}:`, err.message);
        }

        setProcessedFiles(i + 1);
        setUploadProgress(Math.round(((i + 1) / imageFiles.length) * 100));
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      toast({ title: `${newPhotos.length} of ${imageFiles.length} photos uploaded` });
    } catch (err: any) {
      toast({ title: "Failed to read ZIP", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const openAssignDialog = async (photo: UploadedPhoto) => {
    setSelectedPhoto(photo);
    setAssignDialogOpen(true);
    setProductSearch("");
    await loadProducts();
  };

  const loadProducts = async () => {
    if (!storeId) return;
    setLoadingProducts(true);
    const { data } = await supabase
      .from("products")
      .select("id, sku, name, photo_url, category, brand")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("name")
      .limit(500);
    setProducts(data || []);
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

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === selectedPhoto.id
            ? { ...p, assignedProductId: product.id, assignedProductName: product.name }
            : p
        )
      );
      toast({ title: `Photo assigned to ${product.name}` });
      setAssignDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to assign", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  const assignedCount = photos.filter((p) => p.assignedProductId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Photo Manager</h1>
          <p className="text-sm text-muted-foreground">Upload, manage, and assign product photos to inventory</p>
        </div>
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload ZIP
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Uploaded Photos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          {/* Upload Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> Upload ZIP File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  variant="outline"
                  className="gap-2"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {uploading ? "Processing..." : "Select ZIP File"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Supports PNG, JPG, WEBP, BMP, GIF, TIFF, HEIC — auto-converted to optimized JPG (max 1600px)
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleZipUpload}
              />
              {uploading && (
                <div className="mt-4 space-y-2">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Processing {processedFiles} of {totalFiles} images...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Session Photos Grid */}
          {photos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" /> Session Photos ({photos.length})
                  </CardTitle>
                  <Badge variant="secondary">
                    {assignedCount} / {photos.length} assigned
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className={`relative group rounded-lg border overflow-hidden transition-all ${
                        photo.assignedProductId
                          ? "border-primary/50 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="aspect-square cursor-pointer" onClick={() => setPreviewPhoto(photo)}>
                        <img
                          src={photo.url}
                          alt={photo.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                      </div>
                      <div className="p-1.5 bg-background/95 backdrop-blur-sm">
                        <p className="text-[10px] text-muted-foreground truncate">{photo.filename}</p>
                        {photo.assignedProductName ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                            <p className="text-[10px] font-medium text-primary truncate">{photo.assignedProductName}</p>
                          </div>
                        ) : null}
                      </div>
                      {/* Overlay actions */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs gap-1"
                          onClick={() => openAssignDialog(photo)}
                        >
                          <Link2 className="h-3 w-3" />
                          {photo.assignedProductId ? "Reassign" : "Assign"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 w-7 p-0"
                          onClick={() => removePhoto(photo.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="library">
          <StoragePhotosTab storeId={storeId} />
        </TabsContent>
      </Tabs>

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
                alt={selectedPhoto.filename}
                className="w-20 h-20 rounded-lg object-cover border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedPhoto.filename}</p>
                {selectedPhoto.assignedProductName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Currently assigned to: <span className="text-primary font-medium">{selectedPhoto.assignedProductName}</span>
                  </p>
                )}
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
    </div>
  );
}
