/**
 * Derives the selling price for a CSV-imported product.
 * Rule: an explicit selling price always wins. Otherwise, when an MRP and a
 * discount percentage (0 < pct < 100) are given, the selling price is
 * MRP reduced by that discount, rounded to 2 decimals.
 */
export function deriveSellingPrice(
  sellingPrice: number,
  mrp: number,
  discountPct: number,
): number {
  if (sellingPrice > 0) return sellingPrice;
  if (mrp > 0 && discountPct > 0 && discountPct < 100) {
    return Math.round(mrp * (1 - discountPct / 100) * 100) / 100;
  }
  return sellingPrice;
}
