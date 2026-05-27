import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}

const REGION_ID = "qr-scanner-region";

export default function QRScannerDialog({ open, onClose, onScan }: QRScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    (async () => {
      try {
        // Wait for DOM region to mount
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;
        const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = html5;
        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            onScan(decodedText.trim());
          },
          () => {}
        );
        setStarting(false);
      } catch (e: any) {
        setError(e?.message || "Unable to access camera. Please allow camera permission.");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) {
        inst.stop().catch(() => {}).finally(() => {
          try { inst.clear(); } catch {}
        });
      }
    };
  }, [open, onScan]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan product QR</DialogTitle>
          <DialogDescription>Point your camera at the product QR sticker.</DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
          <div id={REGION_ID} className="w-full h-full" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
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
