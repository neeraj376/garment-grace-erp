import { describe, it, expect } from "vitest";
import { slugify, productPath, productIdFromParam, categoryPath } from "@/lib/seoUrls";
const id = "1b2c3d4e-0000-4abc-8def-1234567890ab";
describe("seo urls", () => {
  it("builds readable product path ending in id", () => {
    expect(productPath({ id, name: "Linen Shirt", brand: "Zara", color: "Sky Blue" })).toBe(`/product/zara-linen-shirt-sky-blue-${id}`);
  });
  it("parses both new and old product urls", () => {
    expect(productIdFromParam(`zara-linen-shirt-${id}`)).toBe(id);
    expect(productIdFromParam(id)).toBe(id);
  });
  it("slugs categories", () => {
    expect(categoryPath("Linen Pants")).toBe("/category/linen-pants");
    expect(slugify("T-shirt")).toBe("t-shirt");
  });
});
