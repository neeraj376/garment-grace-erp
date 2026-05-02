// Extract a thumbnail (JPEG Blob) from a video URL, client-side.
// Captures a frame at `seekTime` seconds (default 1s, or 10% of duration).
export async function extractVideoThumbnail(
  videoUrl: string,
  opts: { seekTime?: number; maxDimension?: number; quality?: number } = {}
): Promise<Blob> {
  const { maxDimension = 1280, quality = 0.85 } = opts;

  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    let settled = false;
    const cleanup = () => {
      try { video.src = ""; video.load(); } catch {}
    };
    const fail = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const done = (blob: Blob) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    };

    const timeout = setTimeout(() => fail(new Error("Video load timeout")), 30000);

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      fail(new Error("Failed to load video"));
    });

    video.addEventListener("loadedmetadata", () => {
      const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const seek = opts.seekTime ?? Math.min(1, duration * 0.1 || 0.1);
      try {
        video.currentTime = Math.min(seek, Math.max(0, duration - 0.05));
      } catch (e) {
        fail(e);
      }
    });

    video.addEventListener("seeked", () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return fail(new Error("Video has no dimensions"));

        const scale = Math.min(1, maxDimension / Math.max(vw, vh));
        const w = Math.round(vw * scale);
        const h = Math.round(vh * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail(new Error("Canvas unsupported"));
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout);
            if (!blob) return fail(new Error("Thumbnail encode failed"));
            done(blob);
          },
          "image/jpeg",
          quality
        );
      } catch (e) {
        clearTimeout(timeout);
        fail(e);
      }
    });
  });
}
