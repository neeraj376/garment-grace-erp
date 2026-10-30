import { describe, expect, it } from "vitest";
import { inlineFrame, resolveFramePath } from "../../supabase/functions/ai-product-from-photo/frameMedia";

const host = "https://backend.example";
const prefix = `${host}/storage/v1/object/public/product-media/`;

describe("AI video frame transport", () => {
  it("resolves the caller's own stored frame", () => {
    expect(resolveFramePath(`${prefix}store-a/ai-video-1-0.jpg`, host, "store-a")).toBe("store-a/ai-video-1-0.jpg");
  });
  it("blocks other stores, external hosts and path traversal", () => {
    for (const url of [
      `${prefix}store-b/frame.jpg`, "https://external.example/frame.jpg",
      `${prefix}store-a/../store-b/frame.jpg`, `${prefix}store-a/%2e%2e/frame.jpg`,
      `${prefix}store-a/\\frame.jpg`, `${prefix}store-a/frame.jpg?other=1`,
    ]) expect(() => resolveFramePath(url, host, "store-a")).toThrow();
  });
  it("sends actual image bytes inline so the provider need not download a URL", async () => {
    // Use the runtime Blob: jsdom's Blob does not implement arrayBuffer.
    const { Blob } = await import("node:buffer");
    const image = new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" });
    expect(await inlineFrame(image as unknown as globalThis.Blob)).toBe("data:image/jpeg;base64,/9j/");
  });
  it("rejects non-image content before sending it to AI", async () => {
    const { Blob } = await import("node:buffer");
    await expect(inlineFrame(new Blob(["not an image"], { type: "text/html" }) as unknown as globalThis.Blob)).rejects.toThrow();
  });
});