/**
 * Category / subcategory normalization.
 * Maps common spelling variants, plurals, and abbreviations to a single canonical name.
 * Case-insensitive. Returns the canonical form or the original (title-cased) if no mapping found.
 */

const CATEGORY_MAP: Record<string, string> = {
  // Bottoms
  pant: "Pant",
  pants: "Pant",
  trouser: "Trouser",
  trousers: "Trouser",
  jean: "Jean",
  jeans: "Jean",
  denim: "Jean",
  denims: "Jean",
  short: "Short",
  shorts: "Short",
  bermuda: "Bermuda",
  bermudas: "Bermuda",
  capri: "Capri",
  capris: "Capri",
  legging: "Legging",
  leggings: "Legging",
  jogger: "Jogger",
  joggers: "Jogger",
  "track pant": "Track Pant",
  "track pants": "Track Pant",
  "trackpant": "Track Pant",
  "trackpants": "Track Pant",
  cargo: "Cargo",
  cargos: "Cargo",
  chino: "Chino",
  chinos: "Chino",
  palazzo: "Palazzo",
  palazzos: "Palazzo",

  // Tops
  "t-shirt": "T-Shirt",
  "t-shirts": "T-Shirt",
  tshirt: "T-Shirt",
  tshirts: "T-Shirt",
  "t shirt": "T-Shirt",
  "t shirts": "T-Shirt",
  tee: "T-Shirt",
  tees: "T-Shirt",
  shirt: "Shirt",
  shirts: "Shirt",
  top: "Top",
  tops: "Top",
  blouse: "Blouse",
  blouses: "Blouse",
  tunic: "Tunic",
  tunics: "Tunic",
  polo: "Polo",
  polos: "Polo",
  "polo shirt": "Polo",
  "polo shirts": "Polo",
  henley: "Henley",
  henleys: "Henley",
  tank: "Tank Top",
  "tank top": "Tank Top",
  "tank tops": "Tank Top",
  vest: "Vest",
  vests: "Vest",
  crop: "Crop Top",
  "crop top": "Crop Top",
  "crop tops": "Crop Top",
  hoodie: "Hoodies",
  hoodies: "Hoodies",
  sweatshirt: "Sweatshirts",
  sweatshirts: "Sweatshirts",
  sweater: "Sweaters",
  sweaters: "Sweaters",
  pullover: "Pullovers",
  pullovers: "Pullovers",
  cardigan: "Cardigans",
  cardigans: "Cardigans",

  // Ethnic
  kurta: "Kurtas",
  kurtas: "Kurtas",
  kurti: "Kurtis",
  kurtis: "Kurtis",
  saree: "Sarees",
  sarees: "Sarees",
  sari: "Sarees",
  saris: "Sarees",
  salwar: "Salwar",
  salwars: "Salwar",
  churidar: "Churidars",
  churidars: "Churidars",
  dupatta: "Dupattas",
  dupattas: "Dupattas",
  sherwani: "Sherwanis",
  sherwanis: "Sherwanis",
  lehenga: "Lehengas",
  lehengas: "Lehengas",

  // Outerwear
  jacket: "Jackets",
  jackets: "Jackets",
  blazer: "Blazers",
  blazers: "Blazers",
  coat: "Coats",
  coats: "Coats",
  overcoat: "Overcoats",
  overcoats: "Overcoats",
  windcheater: "Windcheaters",
  windcheaters: "Windcheaters",

  // Suits
  suit: "Suits",
  suits: "Suits",
  "suit set": "Suits",

  // Dresses
  dress: "Dresses",
  dresses: "Dresses",
  gown: "Gowns",
  gowns: "Gowns",
  frock: "Frocks",
  frocks: "Frocks",
  jumpsuit: "Jumpsuits",
  jumpsuits: "Jumpsuits",

  // Innerwear
  underwear: "Underwear",
  undergarment: "Underwear",
  undergarments: "Underwear",
  brief: "Briefs",
  briefs: "Briefs",
  boxer: "Boxers",
  boxers: "Boxers",
  bra: "Bras",
  bras: "Bras",
  lingerie: "Lingerie",
  sock: "Socks",
  socks: "Socks",
  stocking: "Stockings",
  stockings: "Stockings",
  thermal: "Thermals",
  thermals: "Thermals",

  // Accessories
  scarf: "Scarves",
  scarves: "Scarves",
  belt: "Belts",
  belts: "Belts",
  tie: "Ties",
  ties: "Ties",
  cap: "Caps",
  caps: "Caps",
  hat: "Hats",
  hats: "Hats",
  glove: "Gloves",
  gloves: "Gloves",
  shawl: "Shawls",
  shawls: "Shawls",
  stole: "Stoles",
  stoles: "Stoles",
  handkerchief: "Handkerchiefs",
  handkerchiefs: "Handkerchiefs",
  hanky: "Handkerchiefs",
  muffler: "Mufflers",
  mufflers: "Mufflers",
  wallet: "Wallets",
  wallets: "Wallets",
  bag: "Bags",
  bags: "Bags",

  // Footwear
  shoe: "Shoes",
  shoes: "Shoes",
  sandal: "Sandals",
  sandals: "Sandals",
  slipper: "Slippers",
  slippers: "Slippers",
  sneaker: "Sneakers",
  sneakers: "Sneakers",
  boot: "Boots",
  boots: "Boots",
  loafer: "Loafers",
  loafers: "Loafers",
  heel: "Heels",
  heels: "Heels",
  flat: "Flats",
  flats: "Flats",
};

function titleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Normalize a category or subcategory name.
 * Returns null/empty as-is.
 */
export function normalizeCategory(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const key = value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return CATEGORY_MAP[key] || titleCase(value.trim());
}
