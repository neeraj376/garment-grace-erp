import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, X, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageZoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  startIndex?: number;
  alt?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export default function ImageZoomDialog({
  open,
  onOpenChange,
  images,
  startIndex = 0,
  alt = "",
}: ImageZoomDialogProps) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; baseZoom: number } | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(startIndex);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    }
  }, [open, startIndex]);

  const reset = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  const changeIndex = (delta: number) => {
    if (!images.length) return;
    setIndex((i) => (i + delta + images.length) % images.length);
    reset();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  };

  // Mouse drag
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.baseX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.baseY + (e.clientY - dragRef.current.startY),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // Touch pinch + pan
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), baseZoom: zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      dragRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        baseX: pos.x,
        baseY: pos.y,
      };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = pinchRef.current.baseZoom * (dist / pinchRef.current.dist);
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +next.toFixed(2))));
    } else if (e.touches.length === 1 && dragRef.current) {
      setPos({
        x: dragRef.current.baseX + (e.touches[0].clientX - dragRef.current.startX),
        y: dragRef.current.baseY + (e.touches[0].clientY - dragRef.current.startY),
      });
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) dragRef.current = null;
  };

  // Double-tap / double-click to toggle 1x ↔ 2.5x
  const lastTap = useRef(0);
  const onDoubleAction = () => {
    setZoom((z) => (z > 1 ? 1 : 2.5));
    setPos({ x: 0, y: 0 });
  };
  const onClickImg = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) onDoubleAction();
    lastTap.current = now;
  };

  const url = images[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] sm:max-w-5xl sm:h-[90vh] p-0 gap-0 bg-background border-0 sm:border rounded-none sm:rounded-lg overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 py-2 bg-background/80 backdrop-blur">
          <span className="text-xs text-muted-foreground">
            {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.5).toFixed(2)))}
              disabled={zoom <= MIN_ZOOM}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.5).toFixed(2)))}
              disabled={zoom >= MAX_ZOOM}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={reset} disabled={zoom === 1 && pos.x === 0 && pos.y === 0}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Image area */}
        <div
          className="w-full h-full bg-muted/40 flex items-center justify-center overflow-hidden touch-none select-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {url && (
            <img
              src={url}
              alt={alt}
              draggable={false}
              onClick={onClickImg}
              onDoubleClick={onDoubleAction}
              className="max-w-full max-h-full object-contain transition-transform duration-100"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
                cursor: zoom > 1 ? "grab" : "zoom-in",
              }}
            />
          )}
        </div>

        {/* Nav arrows */}
        {images.length > 1 && (
          <>
            <Button variant="secondary" size="sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 p-0 rounded-full opacity-80"
              onClick={() => changeIndex(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="secondary" size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 p-0 rounded-full opacity-80"
              onClick={() => changeIndex(1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        <p className="absolute bottom-2 inset-x-0 text-center text-[10px] text-muted-foreground pointer-events-none">
          Pinch / scroll to zoom · Double-tap to toggle · Drag to pan
        </p>
      </DialogContent>
    </Dialog>
  );
}
