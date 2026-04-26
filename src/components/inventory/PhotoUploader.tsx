import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { MAX_PHOTOS } from "@/lib/photoUtils";
import MediaSourceDialog from "./MediaSourceDialog";
import WebcamCaptureDialog from "./WebcamCaptureDialog";

const isMobileDevice = () =>
  typeof navigator !== "undefined" &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

interface PhotoUploaderProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  storeId: string;
  productId?: string;
}

export default function PhotoUploader({ photos, onChange, storeId, productId }: PhotoUploaderProps) {
  const { toast } = useToast();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);

  const handleUpload = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) {
      toast({ title: `Maximum ${MAX_PHOTOS} photos allowed`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${storeId}/${productId || "new"}-photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(path);
      onChange([...photos, urlData.publicUrl]);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  const handleSourceSelect = (source: "gallery" | "camera") => {
    // Trigger synchronously to preserve the user-gesture chain.
    // Some browsers block camera access if there's any async gap.
    const target = source === "camera" ? cameraInputRef.current : galleryInputRef.current;
    if (target) {
      // Reset value so picking the same file twice still fires onChange
      target.value = "";
      target.click();
    }
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground">Product Images ({photos.length}/{MAX_PHOTOS})</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {photos.map((url, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
            <img src={url} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Button
            type="button"
            variant="outline"
            className="w-20 h-20 flex flex-col gap-1"
            disabled={uploading}
            onClick={() => setSourceDialogOpen(true)}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px]">Add</span>
          </Button>
        )}
      </div>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      <MediaSourceDialog
        open={sourceDialogOpen}
        onOpenChange={setSourceDialogOpen}
        mediaType="image"
        onSelect={handleSourceSelect}
      />
    </div>
  );
}
