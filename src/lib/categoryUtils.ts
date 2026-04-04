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
  hoodie: "Hoodie",
  hoodies: "Hoodie",
  sweatshirt: "Sweatshirt",
  sweatshirts: "Sweatshirt",
  sweater: "Sweater",
  sweaters: "Sweater",
  pullover: "Pullover",
  pullovers: "Pullover",
  cardigan: "Cardigan",
  cardigans: "Cardigan",

  // Ethnic
  kurta: "Kurta",
  kurtas: "Kurta",
  kurti: "Kurti",
  kurtis: "Kurti",
  saree: "Saree",
  sarees: "Saree",
  sari: "Saree",
  saris: "Saree",
  salwar: "Salwar",
  salwars: "Salwar",
  churidar: "Churidar",
  churidars: "Churidar",
  dupatta: "Dupatta",
  dupattas: "Dupatta",
  sherwani: "Sherwani",
  sherwanis: "Sherwani",
  lehenga: "Lehenga",
  lehengas: "Lehenga",

  // Outerwear
  jacket: "Jacket",
  jackets: "Jacket",
  blazer: "Blazer",
  blazers: "Blazer",
  coat: "Coat",
  coats: "Coat",
  overcoat: "Overcoat",
  overcoats: "Overcoat",
  windcheater: "Windcheater",
  windcheaters: "Windcheater",

  // Suits
  suit: "Suit",
  suits: "Suit",
  "suit set": "Suit",

  // Dresses
  dress: "Dress",
  dresses: "Dress",
  gown: "Gown",
  gowns: "Gown",
  frock: "Frock",
  frocks: "Frock",
  jumpsuit: "Jumpsuit",
  jumpsuits: "Jumpsuit",

  // Innerwear
  underwear: "Underwear",
  undergarment: "Underwear",
  undergarments: "Underwear",
  brief: "Brief",
  briefs: "Brief",
  boxer: "Boxer",
  boxers: "Boxer",
  bra: "Bra",
  bras: "Bra",
  lingerie: "Lingerie",
  sock: "Sock",
  socks: "Sock",
  stocking: "Stocking",
  stockings: "Stocking",
  thermal: "Thermal",
  thermals: "Thermal",

  // Accessories
  scarf: "Scarf",
  scarves: "Scarf",
  belt: "Belt",
  belts: "Belt",
  tie: "Tie",
  ties: "Tie",
  cap: "Cap",
  caps: "Cap",
  hat: "Hat",
  hats: "Hat",
  glove: "Glove",
  gloves: "Glove",
  shawl: "Shawl",
  shawls: "Shawl",
  stole: "Stole",
  stoles: "Stole",
  handkerchief: "Handkerchief",
  handkerchiefs: "Handkerchief",
  hanky: "Handkerchief",
  muffler: "Muffler",
  mufflers: "Muffler",
  wallet: "Wallet",
  wallets: "Wallet",
  bag: "Bag",
  bags: "Bag",

  // Footwear
  shoe: "Shoe",
  shoes: "Shoe",
  sandal: "Sandal",
  sandals: "Sandal",
  slipper: "Slipper",
  slippers: "Slipper",
  sneaker: "Sneaker",
  sneakers: "Sneaker",
  boot: "Boot",
  boots: "Boot",
  loafer: "Loafer",
  loafers: "Loafer",
  heel: "Heel",
  heels: "Heel",
  flat: "Flat",
  flats: "Flat",
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
