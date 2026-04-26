import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Camera, Circle, Square, Loader2 } from "lucide-react";

interface WebcamCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: "image" | "video";
  onCapture: (file: File) => void;
}

export default function WebcamCaptureDialog({ open, onOpenChange, mediaType, onCapture }: WebcamCaptureDialogProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopStream = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const startStream = async () => {
    setError(null);
    setStarting(true);
    try {
      const constraints: MediaStreamConstraints = mediaType === "video"
        ? { video: { facingMode: "user" }, audio: true }
        : { video: { facingMode: "user" }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* autoplay may need gesture */ });
      }
    } catch (err: any) {
      let msg = "Could not access camera.";
      if (err?.name === "NotAllowedError") msg = "Camera permission denied. Please enable camera access in your browser settings.";
      else if (err?.name === "NotFoundError") msg = "No camera found on this device.";
      else if (err?.name === "NotReadableError") msg = "Camera is already in use by another application.";
      setError(msg);
      toast({ title: "Camera error", description: msg, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !streamRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
      onOpenChange(false);
    }, "image/jpeg", 0.92);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const mime = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || "";
    const recorder = mime ? new MediaRecorder(streamRef.current, { mimeType: mime }) : new MediaRecorder(streamRef.current);
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `capture-${Date.now()}.${ext}`, { type });
      onCapture(file);
      onOpenChange(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mediaType === "image" ? "Take Photo" : "Record Video"}</DialogTitle>
          <DialogDescription>
            {mediaType === "image" ? "Position yourself and click capture." : "Click record to start, then stop when done."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
            {starting && <Loader2 className="h-8 w-8 animate-spin text-white absolute" />}
            {error ? (
              <p className="text-destructive-foreground bg-destructive/80 p-3 text-sm rounded">{error}</p>
            ) : (
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
            )}
          </div>
          <div className="flex justify-center gap-2">
            {mediaType === "image" ? (
              <Button type="button" onClick={takePhoto} disabled={!!error || starting}>
                <Camera className="h-4 w-4 mr-2" />
                Capture
              </Button>
            ) : recording ? (
              <Button type="button" variant="destructive" onClick={stopRecording}>
                <Square className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>
            ) : (
              <Button type="button" onClick={startRecording} disabled={!!error || starting}>
                <Circle className="h-4 w-4 mr-2 fill-current" />
                Start Recording
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
