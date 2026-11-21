import { describe, expect, it } from "vitest";
import { matchShoppingProducts, productPhotos, sellablePhotoProducts, ShoppingProduct } from "../../supabase/functions/_shared/whatsappShopping";

const product: ShoppingProduct = {
  id: "34d7b2af-95f1-47c7-abfc-6baedc83cc42", sku: "VEST-XL", name: "Quilted Puffer Vest",
  brand: "Old Navy", category: "Jackets", subcategory: "Vests", color: "Orange", size: "XL",
  selling_price: 1180, photo_url: 'https://example.com/orange-vest.jpg', is_active: true,
};
const requirement = { terms: ["vest"], size: "XL", color: "Orange", max_price: 1200, intent: "search" as const };

describe("WhatsApp shopping uses real catalog products", () => {
  it("returns catalog pictures, including distinct additional angles", () => {
    expect(productPhotos('["https://example.com/front.jpg","https://example.com/back.jpg"]')).toEqual([
      "https://example.com/front.jpg", "https://example.com/back.jpg",
    ]);
  });
  it("never recommends a product without an uploaded picture", () => {
    expect(sellablePhotoProducts([{ ...product, photo_url: null }])).toEqual([]);
  });
  it("never recommends an inactive product", () => {
    expect(sellablePhotoProducts([{ ...product, is_active: false }])).toEqual([]);
  });
  it("matches the customer's requested size", () => {
    expect(matchShoppingProducts([product, { ...product, id: "other", size: "M" }], requirement).map(p => p.id)).toEqual([product.id]);
  });
  it("matches the customer's requested colour", () => {
    expect(matchShoppingProducts([{ ...product, color: "Black" }], requirement)).toEqual([]);
  });
  it("keeps recommendations within the customer's budget", () => {
    expect(matchShoppingProducts([product], { ...requirement, max_price: 1179 })).toEqual([]);
  });
  it("does not substitute unrelated products when a requested item is absent", () => {
    expect(matchShoppingProducts([product], { ...requirement, terms: ["sandals"] })).toEqual([]);
  });
  it("does not substitute a different requested brand", () => {
    expect(matchShoppingProducts([product], { ...requirement, terms: ["vest", "zara"] })).toEqual([]);
  });
});