import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link2, Trash2, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface PhotoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string;
  photoName: string;
  onAssign: () => void;
  onDelete?: () => void;
  assignLabel?: string;
}

export default function PhotoPreviewDialog({
  open,
  onOpenChange,
  photoUrl,
  photoName,
  onAssign,
  onDelete,
  assignLabel = "Assign to Product",
}: PhotoPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setZoom(1);
      setRotation(0);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background">
          <p className="text-sm font-medium truncate max-w-[50%]">{photoName}</p>
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
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto bg-muted/50 flex items-center justify-center min-h-[400px] cursor-grab active:cursor-grabbing">
          <img
            src={photoUrl}
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
        <div className="flex items-center justify-between px-4 py-3 border-t bg-background">
          <div>
            {onDelete && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
          <Button size="sm" className="gap-2" onClick={onAssign}>
            <Link2 className="h-3.5 w-3.5" />
            {assignLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
