export type ShoppingProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  size: string | null;
  selling_price: number;
  photo_url: string | null;
  is_active?: boolean;
};

export function productPhotos(value: string | null): string[] {
  if (!value) return [];
  let photos: unknown = [value];
  if (value.trim().startsWith("[")) {
    try { photos = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(photos)) return [];
  return [...new Set(photos.filter((photo): photo is string =>
    typeof photo === "string" && /^https:\/\//i.test(photo.trim()),
  ).map(photo => photo.trim()))];
}

export function sellablePhotoProducts(products: ShoppingProduct[]): ShoppingProduct[] {
  return products.filter(p => p.is_active !== false && Number(p.selling_price) > 0 && productPhotos(p.photo_url).length > 0);
}

const normalize = (value: string | null) => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type ShoppingRequirement = {
  terms: string[];
  size: string | null;
  color: string | null;
  max_price: number | null;
  intent: "search" | "checkout" | "human" | "greeting";
};

export function matchShoppingProducts(products: ShoppingProduct[], requirement: ShoppingRequirement): ShoppingProduct[] {
  const terms = requirement.terms.map(normalize).filter(Boolean);
  const scored = sellablePhotoProducts(products).flatMap(p => {
    if (requirement.max_price !== null && Number(p.selling_price) > requirement.max_price) return [];
    if (requirement.size && normalize(p.size) !== normalize(requirement.size)) return [];
    if (requirement.color && !normalize(p.color).includes(normalize(requirement.color))) return [];
    const title = normalize([p.name, p.brand, p.category, p.subcategory].filter(Boolean).join(" "));
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 1 : 0), 0);
    // Never present unrelated inventory as a match when the requested product is absent.
    if (terms.length && score !== terms.length) return [];
    return [{ p, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, 6).map(row => row.p);
}

export function shoppingProductPath(p: ShoppingProduct): string {
  const brand = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : "";
  const slug = [brand, p.name, p.color].filter(Boolean).join(" ")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  return `/product/${slug ? `${slug}-` : ""}${p.id}`;
}