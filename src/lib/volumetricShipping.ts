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
  zone?: ShippingZone;
}): ShippingQuote {
  const boxes = Math.max(1, Math.floor(params.boxes || 1));
  const volPerBox = volumetricWeightKg(params.lengthCm, params.widthCm, params.heightCm);
  const volumetricWeight = volPerBox * boxes;
  const actualWeight = Math.max(0, params.actualWeightKg || 0);
  const chargeableWeight = Math.max(volumetricWeight, actualWeight);
  const zone = params.zone ?? getZone(params.state || "", params.city);
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
