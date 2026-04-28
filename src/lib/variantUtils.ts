// Group products into variant groups by (name + brand).
// Each group exposes the "primary" variant (first in-stock, or first overall)
// plus aggregated metadata for display on listing pages.

export interface VariantProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  selling_price: number;
  mrp: number | null;
  photo_url: string | null;
  video_url?: string | null;
  [key: string]: any;
}

export interface VariantGroup {
  key: string;
  primary: VariantProduct;
  variants: VariantProduct[];
  colors: string[];
  sizes: string[];
  minPrice: number;
  maxPrice: number;
}

// Normalize a string for fuzzy variant grouping:
// - lowercase, trim
// - strip punctuation
// - collapse whitespace
// - singularize trailing plural "s" on each word (pants -> pant, shoes -> shoe)
const normalize = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
};

const groupKey = (p: { name: string; brand: string | null; category?: string | null }) =>
  `${normalize(p.brand)}|${normalize(p.category ?? "")}|${normalize(p.name)}`;

export function groupVariants(products: VariantProduct[]): VariantGroup[] {
  const map = new Map<string, VariantProduct[]>();
  for (const p of products) {
    const k = groupKey(p);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }

  const groups: VariantGroup[] = [];
  for (const [key, variants] of map) {
    const withPhoto = variants.find((v) => v.photo_url);
    const primary = withPhoto ?? variants[0];
    const colors = Array.from(
      new Set(variants.map((v) => v.color).filter(Boolean) as string[])
    );
    const sizes = Array.from(
      new Set(variants.map((v) => v.size).filter(Boolean) as string[])
    );
    const prices = variants.map((v) => Number(v.selling_price) || 0);
    groups.push({
      key,
      primary,
      variants,
      colors,
      sizes,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    });
  }
  return groups;
}

// Stable size sort: standard apparel sizing first, then numeric, then alpha.
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL", "5XL"];
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.toUpperCase());
    const bi = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    const an = parseFloat(a);
    const bn = parseFloat(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
  });
}

// Common color → hex map for swatch rendering. Falls back to a neutral chip.
const COLOR_HEX: Record<string, string> = {
  black: "#000000", white: "#ffffff", grey: "#808080", gray: "#808080",
  red: "#dc2626", maroon: "#7f1d1d", pink: "#ec4899", orange: "#f97316",
  yellow: "#facc15", green: "#16a34a", olive: "#65a30d", teal: "#0d9488",
  blue: "#2563eb", navy: "#1e3a8a", "navy blue": "#1e3a8a", royal: "#1d4ed8",
  purple: "#7c3aed", brown: "#78350f", beige: "#d6c7a1", cream: "#fef3c7",
  khaki: "#a3a380", mustard: "#d4a017", silver: "#c0c0c0", gold: "#d4af37",
};
export function colorToHex(name: string): string | null {
  const k = name.trim().toLowerCase();
  return COLOR_HEX[k] ?? null;
}
