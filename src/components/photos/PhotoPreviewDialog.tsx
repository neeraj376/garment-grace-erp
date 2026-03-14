import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link2, Trash2, ZoomIn, ZoomOut, RotateCw, Save, Sparkles, Loader2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhotoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string;
  photoName: string;
  onAssign: () => void;
  onDelete?: () => void;
  assignLabel?: string;
  /** Storage path like storeId/bulk-photos/filename.jpg — needed for save/bg-remove */
  storagePath?: string;
  storeId?: string | null;
  /** Called after image is replaced in storage with new URL */
  onImageUpdated?: (newUrl: string) => void;
}

export default function PhotoPreviewDialog({
  open,
  onOpenChange,
  photoUrl,
  photoName,
  onAssign,
  onDelete,
  assignLabel = "Assign to Product",
  storagePath,
  storeId,
  onImageUpdated,
}: PhotoPreviewDialogProps) {
  const { toast } = useToast();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(photoUrl);
  const [originalUrl, setOriginalUrl] = useState(photoUrl);
  const [bgRemoved, setBgRemoved] = useState(false);

  // Sync URL when dialog opens with new photo
  const [lastPhotoUrl, setLastPhotoUrl] = useState(photoUrl);
  if (photoUrl !== lastPhotoUrl) {
    setLastPhotoUrl(photoUrl);
    setCurrentUrl(photoUrl);
    setOriginalUrl(photoUrl);
    setBgRemoved(false);
    setZoom(1);
    setRotation(0);
  }

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setZoom(1);
      setRotation(0);
    }
    onOpenChange(val);
  };

  const saveRotation = async () => {
    if (rotation === 0 || !storagePath) {
      toast({ title: "No rotation to save" });
      return;
    }
    setSaving(true);
    try {
      // Load current image onto canvas with rotation applied
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = currentUrl + (currentUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
      });

      const isPortraitRotation = rotation === 90 || rotation === 270;
      const w = isPortraitRotation ? img.naturalHeight : img.naturalWidth;
      const h = isPortraitRotation ? img.naturalWidth : img.naturalHeight;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
          "image/jpeg",
          0.88
        );
      });

      const { error } = await supabase.storage
        .from("product-media")
        .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("product-media")
        .getPublicUrl(storagePath);

      const newUrl = urlData.publicUrl + "?t=" + Date.now();
      setCurrentUrl(newUrl);
      setRotation(0);
      onImageUpdated?.(newUrl);
      toast({ title: "Rotation saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeBackground = async () => {
    if (!storagePath || !storeId) {
      toast({ title: "Cannot process this image", variant: "destructive" });
      return;
    }
    setRemovingBg(true);
    try {
      // Build the no-bg storage path
      const baseName = storagePath.replace(/\.[^.]+$/, "");
      const bgRemovedPath = `${baseName}-nobg.png`;

      const { data, error } = await supabase.functions.invoke("remove-background", {
        body: { imageUrl: currentUrl, storagePath: bgRemovedPath },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newUrl = data.url + "?t=" + Date.now();
      setOriginalUrl(currentUrl); // save current as original before replacing
      setCurrentUrl(newUrl);
      setBgRemoved(true);
      onImageUpdated?.(newUrl);
      toast({ title: "Background removed! Image is now e-commerce ready." });
    } catch (err: any) {
      toast({ title: "Background removal failed", description: err.message, variant: "destructive" });
    } finally {
      setRemovingBg(false);
    }
  };
  const undoBackgroundRemoval = () => {
    setCurrentUrl(originalUrl);
    setBgRemoved(false);
    onImageUpdated?.(originalUrl);
    toast({ title: "Reverted to original image" });
  };

  const isProcessing = saving || removingBg;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background">
          <p className="text-sm font-medium truncate max-w-[40%]">{photoName}</p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              disabled={zoom <= 0.25}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
              disabled={zoom >= 4}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={isProcessing}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            {rotation !== 0 && storagePath && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 text-xs gap-1.5 px-2.5"
                onClick={saveRotation}
                disabled={isProcessing}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Rotation
              </Button>
            )}
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto bg-muted/50 flex items-center justify-center min-h-[400px] cursor-grab active:cursor-grabbing relative">
          {removingBg && (
            <div className="absolute inset-0 z-10 bg-background/70 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Removing background...</p>
              <p className="text-xs text-muted-foreground">This may take 15-30 seconds</p>
            </div>
          )}
          <img
            src={currentUrl}
            alt={photoName}
            className="max-w-none transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
            draggable={false}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-background gap-2">
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={onDelete} disabled={isProcessing}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            {storagePath && storeId && !bgRemoved && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={removeBackground}
                disabled={isProcessing}
              >
                {removingBg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Remove Background
              </Button>
            )}
            {bgRemoved && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={undoBackgroundRemoval}
                disabled={isProcessing}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo BG Removal
              </Button>
            )}
          </div>
          <Button size="sm" className="gap-2" onClick={onAssign} disabled={isProcessing}>
            <Link2 className="h-3.5 w-3.5" />
            {assignLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
