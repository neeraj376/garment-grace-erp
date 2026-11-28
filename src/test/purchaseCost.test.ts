import { describe, it, expect } from "vitest";
import { purchaseTotal } from "@/lib/purchaseCost";
describe("purchaseTotal", () => {
  it("adds 5% when GST is yes", () => expect(purchaseTotal(1000, true)).toBe(1050));
  it("keeps amount when GST is no", () => expect(purchaseTotal(1000, false)).toBe(1000));
});
