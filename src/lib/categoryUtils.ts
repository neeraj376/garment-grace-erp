/**
 * Category / subcategory normalization.
 * Uses a database-driven mapping system with a hardcoded fallback.
 */

import { supabase } from "@/integrations/supabase/client";

// Hardcoded fallback map (kept for offline / guest / edge cases)
const FALLBACK_MAP: Record<string, string> = {
  pant: "Pant", pants: "Pant", trouser: "Trouser", trousers: "Trouser",
  jean: "Jean", jeans: "Jean", denim: "Jean", denims: "Jean",
  short: "Short", shorts: "Short", bermuda: "Bermuda", bermudas: "Bermuda",
  capri: "Capri", capris: "Capri", legging: "Legging", leggings: "Legging",
  jogger: "Jogger", joggers: "Jogger", "track pant": "Track Pant",
  "track pants": "Track Pant", trackpant: "Track Pant", trackpants: "Track Pant",
  cargo: "Cargo", cargos: "Cargo", chino: "Chino", chinos: "Chino",
  palazzo: "Palazzo", palazzos: "Palazzo",
  "t-shirt": "T-Shirt", "t-shirts": "T-Shirt", tshirt: "T-Shirt", tshirts: "T-Shirt",
  "t shirt": "T-Shirt", "t shirts": "T-Shirt", tee: "T-Shirt", tees: "T-Shirt",
  shirt: "Shirt", shirts: "Shirt", top: "Top", tops: "Top",
  blouse: "Blouse", blouses: "Blouse", tunic: "Tunic", tunics: "Tunic",
  polo: "Polo", polos: "Polo", "polo shirt": "Polo", "polo shirts": "Polo",
  henley: "Henley", henleys: "Henley", tank: "Tank Top", "tank top": "Tank Top",
  "tank tops": "Tank Top", vest: "Vest", vests: "Vest", crop: "Crop Top",
  "crop top": "Crop Top", "crop tops": "Crop Top", hoodie: "Hoodie",
  hoodies: "Hoodie", sweatshirt: "Sweatshirt", sweatshirts: "Sweatshirt",
  sweater: "Sweater", sweaters: "Sweater", pullover: "Pullover", pullovers: "Pullover",
  cardigan: "Cardigan", cardigans: "Cardigan",
  kurta: "Kurta", kurtas: "Kurta", kurti: "Kurti", kurtis: "Kurti",
  saree: "Saree", sarees: "Saree", sari: "Saree", saris: "Saree",
  salwar: "Salwar", salwars: "Salwar", churidar: "Churidar", churidars: "Churidar",
  dupatta: "Dupatta", dupattas: "Dupatta", sherwani: "Sherwani", sherwanis: "Sherwani",
  lehenga: "Lehenga", lehengas: "Lehenga",
  jacket: "Jacket", jackets: "Jacket", blazer: "Blazer", blazers: "Blazer",
  coat: "Coat", coats: "Coat", overcoat: "Overcoat", overcoats: "Overcoat",
  windcheater: "Windcheater", windcheaters: "Windcheater",
  suit: "Suit", suits: "Suit", "suit set": "Suit",
  dress: "Dress", dresses: "Dress", gown: "Gown", gowns: "Gown",
  frock: "Frock", frocks: "Frock", jumpsuit: "Jumpsuit", jumpsuits: "Jumpsuit",
  underwear: "Underwear", undergarment: "Underwear", undergarments: "Underwear",
  brief: "Brief", briefs: "Brief", boxer: "Boxer", boxers: "Boxer",
  bra: "Bra", bras: "Bra", lingerie: "Lingerie",
  sock: "Sock", socks: "Sock", stocking: "Stocking", stockings: "Stocking",
  thermal: "Thermal", thermals: "Thermal",
  scarf: "Scarf", scarves: "Scarf", belt: "Belt", belts: "Belt",
  tie: "Tie", ties: "Tie", cap: "Cap", caps: "Cap", hat: "Hat", hats: "Hat",
  glove: "Glove", gloves: "Glove", shawl: "Shawl", shawls: "Shawl",
  stole: "Stole", stoles: "Stole", handkerchief: "Handkerchief",
  handkerchiefs: "Handkerchief", hanky: "Handkerchief",
  muffler: "Muffler", mufflers: "Muffler", wallet: "Wallet", wallets: "Wallet",
  bag: "Bag", bags: "Bag",
  shoe: "Shoe", shoes: "Shoe", sandal: "Sandal", sandals: "Sandal",
  slipper: "Slipper", slippers: "Slipper", sneaker: "Sneaker", sneakers: "Sneaker",
  boot: "Boot", boots: "Boot", loafer: "Loafer", loafers: "Loafer",
  heel: "Heel", heels: "Heel", flat: "Flat", flats: "Flat",
};

function titleCase(str: string): string {
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Synchronous normalizer (uses hardcoded fallback only).
 * Used where async is not possible.
 */
export function normalizeCategory(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const key = normalizeKey(value);
  return FALLBACK_MAP[key] || titleCase(value.trim());
}

// ── In-memory cache for DB mappings ──
let _dbCache: Record<string, Record<string, string>> | null = null;
let _cacheStoreId: string | null = null;

export async function loadCategoryMappings(storeId: string): Promise<void> {
  if (_cacheStoreId === storeId && _dbCache) return;
  const { data } = await supabase
    .from("category_mappings")
    .select("type, variation, canonical")
    .eq("store_id", storeId);
  const map: Record<string, Record<string, string>> = { category: {}, subcategory: {}, size: {}, color: {} };
  (data ?? []).forEach((r: any) => {
    map[r.type][normalizeKey(r.variation)] = r.canonical;
  });
  _dbCache = map;
  _cacheStoreId = storeId;
}

export function invalidateMappingCache() {
  _dbCache = null;
  _cacheStoreId = null;
}

/**
 * Normalize using DB mappings (with hardcoded fallback).
 * Call loadCategoryMappings first to populate cache.
 */
export function normalizeCategoryWithMappings(
  value: string | null | undefined,
  type: "category" | "subcategory" | "size" | "color" = "category"
): string | null {
  if (!value || !value.trim()) return null;
  const key = normalizeKey(value);

  // DB mappings take priority
  if (_dbCache && _dbCache[type] && _dbCache[type][key]) {
    return _dbCache[type][key];
  }

  // Fallback to hardcoded map
  return FALLBACK_MAP[key] || titleCase(value.trim());
}
