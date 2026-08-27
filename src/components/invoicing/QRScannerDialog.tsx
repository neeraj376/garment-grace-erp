import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}

const REGION_ID = "qr-scanner-region";

type CamInfo = { id: string; label: string };

export default function QRScannerDialog({ open, onClose, onScan }: QRScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<CamInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);

  // Discover cameras once the dialog opens (asks for permission first).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCameras([]);
    setCameraId(null);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API unavailable. Use Chrome or Safari over HTTPS.");
        }
        // Trigger the permission prompt so device labels are available.
        const probe = await navigator.mediaDevices.getUserMedia({ video: true });
        probe.getTracks().forEach((t) => t.stop());

        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!devices?.length) throw new Error("No camera found on this device.");

        const list = devices.map((d) => ({ id: d.id, label: d.label || "Camera" }));
        setCameras(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        setCameraId((back || list[0]).id);
      } catch (e: any) {
        if (cancelled) return;
        const name = e?.name || "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access for this site in your browser settings, then reopen."
            : name === "NotReadableError"
            ? "Camera is in use by another app (Zoom, FaceTime, Photo Booth). Close it and try again."
            : e?.message || "Unable to access the camera."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Start/stop the scanner for the selected camera.
  useEffect(() => {
    if (!open || !cameraId) return;
    let cancelled = false;
    scannedRef.current = false;
    setStarting(true);
    setError(null);

    const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = html5;

    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;
        await html5.start(
          { deviceId: { exact: cameraId } },
          {
            fps: 15,
            qrbox: (w: number, h: number) => {
              const edge = Math.min(Math.floor(w * 0.8), Math.floor(h * 0.8));
              return { width: edge, height: edge };
            },
            aspectRatio: 1,
          },
          (decodedText: string) => {
            const value = decodedText.trim();
            if (!value || scannedRef.current) return;
            scannedRef.current = true;
            onScanRef.current(value);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Unable to start the camera.");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current = null;
      try {
        if (html5.isScanning) {
          html5.stop().catch(() => {}).finally(() => {
            try { html5.clear(); } catch {}
          });
        } else {
          try { html5.clear(); } catch {}
        }
      } catch {}
    };
  }, [open, cameraId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan product QR</DialogTitle>
          <DialogDescription>Point your camera at the product QR sticker.</DialogDescription>
        </DialogHeader>

        {cameras.length > 1 && (
          <Select value={cameraId ?? undefined} onValueChange={setCameraId}>
            <SelectTrigger>
              <SelectValue placeholder="Select camera" />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
          <div id={REGION_ID} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-background/90" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-background">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
