// Quantity offers: when the combined quantity of a group's products in one
// order reaches minQty, every piece in that group is charged unitPrice.
export interface BulkOffer { label: string; productIds: string[]; minQty: number; unitPrice: number }

export const BULK_OFFERS: BulkOffer[] = [
  {
    label: "Calvin Klein underwear 20 NOV — any 3 for ₹200 each",
    productIds: [
      "6e3adec0-43fb-40d1-9514-8232bccddd47",
      "951649cc-452f-436b-94a7-d596350374a9",
      "3b717606-6971-4de5-9c90-015d9de1168c",
      "de1601ee-c37b-4174-b9f2-d84a9ebae5d8",
      "09133dd6-149e-4f4b-808b-c2bf577d22e7",
      "459c5f7f-0cfe-4ff6-8573-f4786e8ddd3f",
    ],
    minQty: 3,
    unitPrice: 200,
  },
];

/** Returns product_id -> effective unit price for every line in the order. */
export function effectiveUnitPrices(
  lines: { product_id: string; quantity: number; selling_price: number }[],
  offers: BulkOffer[] = BULK_OFFERS,
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const l of lines) prices.set(l.product_id, Number(l.selling_price) || 0);
  for (const o of offers) {
    const ids = new Set(o.productIds);
    const qty = lines.filter((l) => ids.has(l.product_id)).reduce((s, l) => s + (l.quantity || 0), 0);
    if (qty >= o.minQty) for (const l of lines) if (ids.has(l.product_id)) prices.set(l.product_id, Math.min(prices.get(l.product_id)!, o.unitPrice));
  }
  return prices;
}
