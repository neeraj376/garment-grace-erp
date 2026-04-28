// Client-side image optimization: resize (max 1600px), convert to JPEG, target small size.
// Used before uploading product photos to keep storefront fast.

export interface OptimizeOptions {
  maxDimension?: number; // longest edge in px
  quality?: number; // 0..1
  mimeType?: "image/jpeg" | "image/webp";
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

export async function optimizeImage(file: File, opts: OptimizeOptions = {}): Promise<File> {
  // Skip non-images (e.g. videos) — return as-is
  if (!file.type.startsWith("image/")) return file;

  const { maxDimension = 1600, quality = 0.82, mimeType = "image/jpeg" } = opts;

  try {
    const img = await loadImage(file);
    const { width, height } = img;
    const longest = Math.max(width, height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Fill white background so transparent PNGs become clean JPEGs
    if (mimeType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), mimeType, quality)
    );
    if (!blob) return file;

    // If our re-encode is bigger than the original, keep the smaller one.
    if (blob.size >= file.size && file.type === mimeType) return file;

    const ext = mimeType === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.${ext}`, { type: mimeType });
  } catch {
    return file;
  }
}
