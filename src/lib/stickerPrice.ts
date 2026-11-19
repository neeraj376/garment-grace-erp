// Price text printed on inventory stickers: rupee symbol, Indian digit grouping,
// decimals only when the price actually has them (₹755, not ₹755.00).
export function formatStickerPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
