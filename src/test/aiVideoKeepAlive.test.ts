import { describe, expect, it } from "vitest";
import { keepAliveJson } from "../../supabase/functions/ai-product-from-photo/keepAlive";

describe("long video recognition connection", () => {
  it("sends bytes before AI finishes and returns the original products as valid JSON", async () => {
    let finish: (response: Response) => void = () => {};
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const response = keepAliveJson(() => pending, {}, 5);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response stream");
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("\n");
    const heartbeat = await reader.read();
    expect(new TextDecoder().decode(heartbeat.value)).toBe("\n");
    finish(Response.json({ products: [{ name: "Shirt", quantity: 5, size: "XXL" }] }));
    let result = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      result += new TextDecoder().decode(chunk.value);
    }
    expect(JSON.parse(result)).toEqual({ products: [{ name: "Shirt", quantity: 5, size: "XXL" }] });
  });
  it("preserves a credit denial and never repeats the AI request", async () => {
    let calls = 0;
    const response = keepAliveJson(async () => {
      calls++;
      return Response.json({ error: "Workspace credit limit reached" }, { status: 403 });
    }, {});
    expect(await response.json()).toEqual({ error: "Workspace credit limit reached", status: 403 });
    expect(calls).toBe(1);
  });
});