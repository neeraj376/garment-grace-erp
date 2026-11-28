export const PURCHASE_GST_RATE = 0.05;
export function purchaseTotal(amount: number, gst: boolean): number {
  const a = Number.isFinite(amount) ? amount : 0;
  return Math.round((gst ? a * (1 + PURCHASE_GST_RATE) : a) * 100) / 100;
}
