// Extract evenly spaced JPEG frames from a local video file, client-side.
export async function extractVideoFrames(
  file: File,
  opts: { count?: number; maxDimension?: number; quality?: number } = {}
): Promise<Blob[]> {
  const { count = 16, maxDimension = 1024, quality = 0.82 } = opts;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const once = (ev: string) =>
    new Promise<void>((res, rej) => {
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error("Could not read this video")); };
      const cleanup = () => { video.removeEventListener(ev, ok); video.removeEventListener("error", bad); };
      video.addEventListener(ev, ok);
      video.addEventListener("error", bad);
    });

  try {
    await once("loadedmetadata");
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error("Video has no length");
    const n = Math.max(1, Math.min(count, Math.ceil(duration * 2)));
    const frames: Blob[] = [];
    const canvas = document.createElement("canvas");
    for (let i = 0; i < n; i++) {
      const t = Math.min(duration - 0.05, ((i + 0.5) / n) * duration);
      const p = once("seeked");
      video.currentTime = t;
      await p;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) continue;
      const s = Math.min(1, maxDimension / Math.max(vw, vh));
      canvas.width = Math.round(vw * s);
      canvas.height = Math.round(vh * s);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", quality));
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
