// Resolve only this store's media; never fetch caller-supplied hosts.
export function resolveFramePath(frameUrl: string, backendUrl: string, storeId: string): string {
  const prefix = `${backendUrl.replace(/\/$/, "")}/storage/v1/object/public/product-media/`;
  if (!frameUrl.startsWith(prefix)) throw new Error("Video frame does not belong to this store");
  const path = frameUrl.slice(prefix.length);
  if (!path.startsWith(`${storeId}/`) || path.includes("%") || path.includes("\\") ||
      path.includes("?") || path.includes("#") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Video frame does not belong to this store");
  }
  return path;
}

export async function inlineFrame(source: Blob): Promise<string> {
  if (!source.size || source.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(source.type)) {
    throw new Error("Video frame is invalid or too large. Please choose the video again.");
  }
  const bytes = new Uint8Array(await source.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${source.type};base64,${btoa(binary)}`;
}