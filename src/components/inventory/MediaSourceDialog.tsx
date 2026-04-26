import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, FolderOpen } from "lucide-react";

interface MediaSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: "image" | "video";
  onSelect: (source: "gallery" | "camera") => void;
}

export default function MediaSourceDialog({ open, onOpenChange, mediaType, onSelect }: MediaSourceDialogProps) {
  const label = mediaType === "image" ? "Photo" : "Video";
  const cameraLabel = mediaType === "image" ? "Take Photo" : "Record Video";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Add {label}</DialogTitle>
          <DialogDescription>Choose how you want to add the {label.toLowerCase()}.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => {
              onSelect("gallery");
              onOpenChange(false);
            }}
          >
            <FolderOpen className="h-6 w-6" />
            <span className="text-xs">From Device</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => {
              onSelect("camera");
              onOpenChange(false);
            }}
          >
            <Camera className="h-6 w-6" />
            <span className="text-xs">{cameraLabel}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
