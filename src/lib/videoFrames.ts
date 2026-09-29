// Extract evenly spaced, sharp JPEG frames from a local video file, client-side.
export type TimedFrame = { blob: Blob; time: number };

// Sharpness score: variance of a Laplacian on a small greyscale copy (higher = crisper).
function sharpness(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      sum += l; sq += l * l; n++;
    }
  }
  const m = sum / n;
  return sq / n - m * m;
}

export async function extractTimedVideoFrames(
  file: File,
  opts: { count?: number; maxDimension?: number; quality?: number } = {}
): Promise<TimedFrame[]> {
  const { count = 16, maxDimension = 1600, quality = 0.92 } = opts;
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
  const seek = async (t: number) => { const p = once("seeked"); video.currentTime = t; await p; };

  try {
    await once("loadedmetadata");
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error("Video has no length");
    const n = Math.max(1, Math.min(count, Math.ceil(duration * 2)));
    const slot = duration / n;
    const frames: TimedFrame[] = [];
    const canvas = document.createElement("canvas");
    const probe = document.createElement("canvas");
    const pctx = probe.getContext("2d", { willReadFrequently: true })!;
    for (let i = 0; i < n; i++) {
      const center = (i + 0.5) * slot;
      // Try a few moments inside this slot and keep the least blurry one.
      const candidates = [center - slot * 0.3, center, center + slot * 0.3]
        .map(t => Math.min(duration - 0.05, Math.max(0, t)));
      let best = { t: center, score: -1 };
      for (const t of candidates) {
        await seek(t);
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) continue;
        const s = Math.min(1, 320 / Math.max(vw, vh));
        probe.width = Math.round(vw * s); probe.height = Math.round(vh * s);
        pctx.drawImage(video, 0, 0, probe.width, probe.height);
        const score = sharpness(pctx, probe.width, probe.height);
        if (score > best.score) best = { t, score };
      }
      await seek(best.t);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) continue;
      const s = Math.min(1, maxDimension / Math.max(vw, vh));
      canvas.width = Math.round(vw * s);
      canvas.height = Math.round(vh * s);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", quality));
      if (blob) frames.push({ blob, time: best.t });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractVideoFrames(
  file: File,
  opts: { count?: number; maxDimension?: number; quality?: number } = {}
): Promise<Blob[]> {
  return (await extractTimedVideoFrames(file, opts)).map(f => f.blob);
}
