import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, Circle, Square, Loader2, RefreshCw } from "lucide-react";

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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    initStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When user picks another device, restart the stream with that device.
  useEffect(() => {
    if (!open || !selectedDeviceId) return;
    startStream(selectedDeviceId, selectedAudioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, selectedAudioId]);

  const stopStream = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const refreshDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter(d => d.kind === "videoinput");
      const mics = list.filter(d => d.kind === "audioinput");
      setDevices(cams);
      setAudioDevices(mics);
      return { cams, mics };
    } catch {
      return { cams: [], mics: [] };
    }
  };

  const initStream = async () => {
    // First request permission with default device so labels become available,
    // then enumerate devices and let the user pick.
    await startStream();
    const { cams, mics } = await refreshDevices();
    // Sync selected ids from active stream tracks.
    const vTrack = streamRef.current?.getVideoTracks()[0];
    const aTrack = streamRef.current?.getAudioTracks()[0];
    const vId = vTrack?.getSettings().deviceId || cams[0]?.deviceId || "";
    const aId = aTrack?.getSettings().deviceId || mics[0]?.deviceId || "";
    setSelectedDeviceId(vId);
    setSelectedAudioId(aId);
  };

  const startStream = async (videoDeviceId?: string, audioDeviceId?: string) => {
    setError(null);
    setStarting(true);
    // Stop any existing stream before starting a new one.
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try {
      const videoConstraints: MediaTrackConstraints = videoDeviceId
        ? { deviceId: { exact: videoDeviceId } }
        : { facingMode: "user" };
      const audioConstraints: boolean | MediaTrackConstraints = mediaType === "video"
        ? (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true)
        : false;
      const constraints: MediaStreamConstraints = { video: videoConstraints, audio: audioConstraints };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* autoplay may need gesture */ });
      }
      // Refresh device labels (they're only populated after permission grant).
      if (devices.length === 0) await refreshDevices();
    } catch (err: any) {
      let msg = "Could not access camera.";
      if (err?.name === "NotAllowedError") msg = "Camera permission denied. Please enable camera access in your browser settings.";
      else if (err?.name === "NotFoundError") msg = "No camera found on this device.";
      else if (err?.name === "NotReadableError") msg = "Camera is in use by another app. Close Zoom/Teams/other apps and try again, or pick a different camera below.";
      else if (err?.name === "OverconstrainedError") msg = "Selected camera doesn't support the requested settings.";
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
            {starting && <Loader2 className="h-8 w-8 animate-spin text-white absolute z-10" />}
            {error ? (
              <p className="text-destructive-foreground bg-destructive/80 p-3 text-sm rounded">{error}</p>
            ) : (
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-muted-foreground">Camera</Label>
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.length === 0 && (
                      <SelectItem value="none" disabled>No cameras detected</SelectItem>
                    )}
                    {devices.map((d, i) => (
                      <SelectItem key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={refreshDevices} title="Refresh devices">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {mediaType === "video" && audioDevices.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Microphone</Label>
                <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.map((d, i) => (
                      <SelectItem key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Tip: virtual cameras like Zoom, MS Teams, OBS or Snap Camera will appear in this list once they're running.
            </p>
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
