// Volumetric (dimensional) shipping cost calculator.
// Pickup: Gurugram, Haryana - 122018
// Volumetric weight (kg) = (L x W x H in cm) / 5000
// Slab rates depend on the destination zone (see RATE_CARD below).
// A 15% fuel surcharge is applied on the slab amount.

export const VOLUMETRIC_DIVISOR = 5000;
export const FIRST_SLAB_KG = 0.5;
export const FUEL_SURCHARGE_PCT = 15;

export const ORIGIN = { city: "Gurugram", state: "Haryana", pincode: "122018" };

export type ShippingZone = "City" | "Region" | "Zone" | "Metro" | "ROI" | "Special";

export const ZONE_LABELS: Record<ShippingZone, string> = {
  City: "City (within Gurugram)",
  Region: "Region (Haryana / Delhi NCR)",
  Zone: "Zone (North India)",
  Metro: "Metro cities",
  ROI: "Rest of India",
  Special: "Special destinations",
};

// Rate card from the courier: 500 g flat rate, then per-kg rates for 1-5 kg and 5-10 kg.
export const RATE_CARD: Record<ShippingZone, { upto500g: number; perKg1to5: number; perKg5to10: number }> = {
  City:    { upto500g: 20, perKg1to5: 40, perKg5to10: 38 },
  Region:  { upto500g: 25, perKg1to5: 45, perKg5to10: 40 },
  Zone:    { upto500g: 35, perKg1to5: 60, perKg5to10: 55 },
  Metro:   { upto500g: 40, perKg1to5: 80, perKg5to10: 70 },
  ROI:     { upto500g: 47, perKg1to5: 85, perKg5to10: 80 },
  Special: { upto500g: 58, perKg1to5: 90, perKg5to10: 80 },
};

const SPECIAL_STATES = [
  "Jammu and Kashmir", "Ladakh", "Assam", "Arunachal Pradesh", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Tripura", "Sikkim",
  "Andaman and Nicobar Islands", "Lakshadweep",
];

const REGION_STATES = ["Haryana", "Delhi"];

const ZONE_STATES = [
  "Punjab", "Uttar Pradesh", "Uttarakhand", "Himachal Pradesh", "Rajasthan", "Chandigarh",
];

const METRO_CITIES = [
  "mumbai", "navi mumbai", "thane", "bengaluru", "bangalore", "chennai", "kolkata",
  "hyderabad", "secunderabad", "ahmedabad", "pune", "new delhi", "delhi",
];

/** Work out the destination zone from state + city (pickup is Gurugram, Haryana). */
export function getZone(state: string, city?: string): ShippingZone {
  const c = (city || "").trim().toLowerCase();
  const s = (state || "").trim();

  if (s === "Haryana" && (c === "gurugram" || c === "gurgaon")) return "City";
  if (SPECIAL_STATES.includes(s)) return "Special";
  if (REGION_STATES.includes(s)) return "Region";
  if (METRO_CITIES.includes(c)) return "Metro";
  if (ZONE_STATES.includes(s)) return "Zone";
  return "ROI";
}

// ---- Pincode based zone detection ----

// First two digits of an Indian PIN -> state (broad mapping, good enough for zoning)
const PIN_STATE: Record<string, string> = {
  "11": "Delhi",
  "12": "Haryana", "13": "Haryana",
  "14": "Punjab", "15": "Punjab", "16": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu and Kashmir", "19": "Jammu and Kashmir",
  "20": "Uttar Pradesh", "21": "Uttar Pradesh", "22": "Uttar Pradesh", "23": "Uttar Pradesh",
  "24": "Uttarakhand", "25": "Uttar Pradesh", "26": "Uttar Pradesh", "27": "Uttar Pradesh",
  "28": "Uttar Pradesh",
  "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan",
  "36": "Gujarat", "37": "Gujarat", "38": "Gujarat", "39": "Gujarat",
  "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra", "44": "Maharashtra",
  "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh",
  "49": "Chhattisgarh",
  "50": "Telangana", "51": "Telangana",
  "52": "Andhra Pradesh", "53": "Andhra Pradesh",
  "56": "Karnataka", "57": "Karnataka", "58": "Karnataka", "59": "Karnataka",
  "60": "Tamil Nadu", "61": "Tamil Nadu", "62": "Tamil Nadu", "63": "Tamil Nadu", "64": "Tamil Nadu",
  "67": "Kerala", "68": "Kerala", "69": "Kerala",
  "70": "West Bengal", "71": "West Bengal", "72": "West Bengal", "73": "West Bengal", "74": "West Bengal",
  "75": "Odisha", "76": "Odisha", "77": "Odisha",
  "78": "Assam",
  "79": "Arunachal Pradesh",
  "80": "Bihar", "81": "Bihar", "82": "Jharkhand", "83": "Jharkhand", "84": "Bihar", "85": "Bihar",
};

// More specific prefixes that override the two-digit mapping
const PIN_STATE_3: Record<string, string> = {
  "160": "Chandigarh", "140": "Punjab",
  "682": "Lakshadweep", "744": "Andaman and Nicobar Islands", "737": "Sikkim",
  "793": "Meghalaya", "794": "Meghalaya", "795": "Manipur", "796": "Mizoram",
  "797": "Nagaland", "798": "Nagaland", "799": "Tripura", "792": "Arunachal Pradesh",
  "605": "Puducherry", "607": "Puducherry",
};

// Metro PIN prefixes (first three digits)
const METRO_PIN_PREFIX = ["110", "400", "401", "410", "411", "500", "560", "600", "700", "380"];

export function stateForPincode(pin: string): string | null {
  const p = (pin || "").trim();
  if (!/^[1-9]\d{5}$/.test(p)) return null;
  return PIN_STATE_3[p.slice(0, 3)] ?? PIN_STATE[p.slice(0, 2)] ?? null;
}

/** Zone between two pincodes: same city, same region, north zone, metro, rest of India or special. */
export function getZoneForPincodes(originPin: string, destPin: string): ShippingZone | null {
  const o = (originPin || "").trim();
  const d = (destPin || "").trim();
  if (!/^[1-9]\d{5}$/.test(o) || !/^[1-9]\d{5}$/.test(d)) return null;

  const oState = stateForPincode(o);
  const dState = stateForPincode(d);

  // Same city / local area — first three digits identify the delivery city
  if (o.slice(0, 3) === d.slice(0, 3)) return "City";
  if (dState && SPECIAL_STATES.includes(dState)) return "Special";

  // Same state, or Delhi <-> Haryana (NCR)
  const ncr = ["Delhi", "Haryana"];
  if (oState && dState && (oState === dState || (ncr.includes(oState) && ncr.includes(dState)))) return "Region";

  if (METRO_PIN_PREFIX.includes(d.slice(0, 3))) return "Metro";
  if (dState && ZONE_STATES.concat(REGION_STATES).includes(dState)) return "Zone";
  return "ROI";
}

export interface ShippingQuote {
  volumetricWeight: number;
  actualWeight: number;
  chargeableWeight: number;
  zone: ShippingZone;
  slabCost: number;
  fuelSurcharge: number;
  cost: number;
  breakdown: string;
}

export function volumetricWeightKg(lengthCm: number, widthCm: number, heightCm: number) {
  const l = Math.max(0, lengthCm || 0);
  const w = Math.max(0, widthCm || 0);
  const h = Math.max(0, heightCm || 0);
  return (l * w * h) / VOLUMETRIC_DIVISOR;
}

export function costForWeight(weightKg: number, zone: ShippingZone = "ROI"): {
  slabCost: number;
  fuelSurcharge: number;
  cost: number;
  breakdown: string;
} {
  const w = Math.max(0, weightKg || 0);
  const card = RATE_CARD[zone];
  if (w <= 0) return { slabCost: 0, fuelSurcharge: 0, cost: 0, breakdown: "No weight" };

  let slabCost: number;
  let slabLabel: string;
  if (w <= FIRST_SLAB_KG) {
    slabCost = card.upto500g;
    slabLabel = `Up to 500 g (${zone}) = ₹${card.upto500g}`;
  } else {
    const kgSlabs = Math.ceil(w); // 1.2 kg -> 2 kg charged
    const perKg = kgSlabs > 5 ? card.perKg5to10 : card.perKg1to5;
    slabCost = kgSlabs * perKg;
    slabLabel = `${kgSlabs} kg × ₹${perKg} (${zone}) = ₹${slabCost}`;
  }

  const fuelSurcharge = Math.round(slabCost * (FUEL_SURCHARGE_PCT / 100));
  const cost = slabCost + fuelSurcharge;
  return {
    slabCost,
    fuelSurcharge,
    cost,
    breakdown: `${slabLabel} + ${FUEL_SURCHARGE_PCT}% fuel surcharge (₹${fuelSurcharge}) = ₹${cost}`,
  };
}

export function calculateVolumetricShipping(params: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  actualWeightKg?: number;
  boxes?: number;
  state?: string;
  city?: string;
  originPincode?: string;
  destPincode?: string;
  zone?: ShippingZone;
}): ShippingQuote {
  const boxes = Math.max(1, Math.floor(params.boxes || 1));
  const volPerBox = volumetricWeightKg(params.lengthCm, params.widthCm, params.heightCm);
  const volumetricWeight = volPerBox * boxes;
  const actualWeight = Math.max(0, params.actualWeightKg || 0);
  const chargeableWeight = Math.max(volumetricWeight, actualWeight);
  const zone =
    params.zone ??
    getZoneForPincodes(params.originPincode || ORIGIN.pincode, params.destPincode || "") ??
    getZone(params.state || "", params.city);
  const { slabCost, fuelSurcharge, cost, breakdown } = costForWeight(chargeableWeight, zone);
  return {
    volumetricWeight: Number(volumetricWeight.toFixed(3)),
    actualWeight: Number(actualWeight.toFixed(3)),
    chargeableWeight: Number(chargeableWeight.toFixed(3)),
    zone,
    slabCost,
    fuelSurcharge,
    cost,
    breakdown,
  };
}
