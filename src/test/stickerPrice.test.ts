import { describe, it, expect } from "vitest";
import { formatStickerPrice } from "@/lib/stickerPrice";

describe("formatStickerPrice (sticker price line)", () => {
  it("prints whole rupee prices without trailing decimals", () => {
    expect(formatStickerPrice(755)).toBe("₹755");
    expect(formatStickerPrice(0)).toBe("₹0");
  });

  it("keeps two decimals when the price has paise", () => {
    expect(formatStickerPrice(839.3)).toBe("₹839.30");
    expect(formatStickerPrice(99.99)).toBe("₹99.99");
  });

  it("uses Indian digit grouping for large prices", () => {
    expect(formatStickerPrice(123456)).toBe("₹1,23,456");
    expect(formatStickerPrice(1234567.5)).toBe("₹12,34,567.50");
  });

  it("returns empty text when no price is set", () => {
    expect(formatStickerPrice(null)).toBe("");
    expect(formatStickerPrice(undefined)).toBe("");
  });
});
