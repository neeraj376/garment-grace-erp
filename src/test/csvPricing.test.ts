import { describe, it, expect } from "vitest";
import { deriveSellingPrice } from "@/lib/csvPricing";

describe("deriveSellingPrice (CSV bulk upload)", () => {
  it("computes selling price from MRP and discount % when no selling price is given", () => {
    // MRP 1199 with 30% off -> 839.30
    expect(deriveSellingPrice(0, 1199, 30)).toBe(839.3);
  });

  it("keeps an explicit selling price even when discount % is present", () => {
    expect(deriveSellingPrice(999, 1199, 30)).toBe(999);
  });

  it("returns 0 when neither selling price nor a valid MRP+discount pair is given", () => {
    expect(deriveSellingPrice(0, 1199, 0)).toBe(0);
    expect(deriveSellingPrice(0, 0, 30)).toBe(0);
  });

  it("ignores discount values of 100% or more", () => {
    expect(deriveSellingPrice(0, 1199, 100)).toBe(0);
    expect(deriveSellingPrice(0, 1199, 150)).toBe(0);
  });
});
