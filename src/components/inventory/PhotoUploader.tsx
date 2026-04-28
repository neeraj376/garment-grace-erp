import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X, Loader2, Sparkles } from "lucide-react";
import { MAX_PHOTOS } from "@/lib/photoUtils";
import { optimizeImage } from "@/lib/imageOptimize";
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
  const [statusLabel, setStatusLabel] = useState<string>("");
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [aiCleanup, setAiCleanup] = useState(true);

  const handleUpload = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) {
      toast({ title: `Maximum ${MAX_PHOTOS} photos allowed`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // 1. Optimize: resize to 1600px max, re-encode JPEG ~82% quality
      setStatusLabel("Optimizing…");
      const optimized = await optimizeImage(file, { maxDimension: 1600, quality: 0.82 });

      // 2. Upload optimized version to storage
      setStatusLabel("Uploading…");
      const ext = (optimized.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${storeId}/${productId || "new"}-photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-media")
        .upload(path, optimized, { upsert: true, contentType: optimized.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(path);
      let finalUrl = urlData.publicUrl;

      // 3. Optional: AI background cleanup (replaces the file in-place)
      if (aiCleanup) {
        setStatusLabel("AI cleaning background…");
        try {
          const cleanPath = path.replace(/\.[^.]+$/, "") + "-clean.png";
          const { data, error: fnErr } = await supabase.functions.invoke("remove-background", {
            body: { imageUrl: finalUrl, storagePath: cleanPath },
          });
          if (fnErr) throw fnErr;
          if (data?.url) finalUrl = data.url;
        } catch (aiErr: any) {
          // Non-fatal — keep the optimized original
          console.warn("AI cleanup failed:", aiErr);
          toast({
            title: "AI cleanup skipped",
            description: aiErr?.message || "Using original image.",
          });
        }
      }

      onChange([...photos, finalUrl]);
      toast({ title: "Image ready" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setStatusLabel("");
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  const handleSourceSelect = (source: "gallery" | "camera") => {
    if (source === "camera") {
      if (isMobileDevice()) {
        const target = cameraInputRef.current;
        if (target) {
          target.value = "";
          target.click();
        }
      } else {
        setWebcamOpen(true);
      }
    } else {
      const target = galleryInputRef.current;
      if (target) {
        target.value = "";
        target.click();
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          Product Images ({photos.length}/{MAX_PHOTOS})
        </Label>
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-muted-foreground" />
          <Label htmlFor="ai-cleanup-toggle" className="text-xs text-muted-foreground cursor-pointer">
            Auto AI cleanup
          </Label>
          <Switch
            id="ai-cleanup-toggle"
            checked={aiCleanup}
            onCheckedChange={setAiCleanup}
            disabled={uploading}
          />
        </div>
      </div>
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
            <span className="text-[10px] leading-tight text-center px-1">
              {uploading ? statusLabel || "Working…" : "Add"}
            </span>
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
      <WebcamCaptureDialog
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        mediaType="image"
        onCapture={handleUpload}
      />
    </div>
  );
}
