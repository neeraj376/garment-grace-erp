import { describe, it, expect } from "vitest";
import { effectiveUnitPrices } from "@/lib/bulkPricing";
const S = "459c5f7f-0cfe-4ff6-8573-f4786e8ddd3f", M = "09133dd6-149e-4f4b-808b-c2bf577d22e7", OTHER = "x";
describe("CK underwear 3-piece offer", () => {
  it("2 pieces stay at ₹250", () => {
    expect(effectiveUnitPrices([{ product_id: S, quantity: 2, selling_price: 250 }]).get(S)).toBe(250);
  });
  it("3 pieces mixed sizes become ₹200 each", () => {
    const p = effectiveUnitPrices([{ product_id: S, quantity: 2, selling_price: 250 }, { product_id: M, quantity: 1, selling_price: 250 }]);
    expect(p.get(S)).toBe(200); expect(p.get(M)).toBe(200);
  });
  it("other products are unaffected", () => {
    const p = effectiveUnitPrices([{ product_id: S, quantity: 3, selling_price: 250 }, { product_id: OTHER, quantity: 1, selling_price: 999 }]);
    expect(p.get(OTHER)).toBe(999);
  });
});
