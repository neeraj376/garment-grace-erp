// DTDC S/F (Surface/Freight) shipping rate calculator
// Pickup: Delhi (110001). Rate row: S/F Per kg, minimum 5kg billable.
// Surcharges: +35% fuel, +0.20% FOB on invoice value, +18% GST.

export type DtdcZone = "City" | "North" | "Metro" | "Rest" | "Special";

// S/F Per kg rates (INR/kg) — minimum 5kg billed
const RATE_PER_KG: Record<DtdcZone, number> = {
  City: 45,
  North: 80,
  Metro: 70,
  Rest: 70,
  Special: 100,
};

const MIN_BILLABLE_KG = 5;
const FUEL_SURCHARGE = 0.35;
const FOB_RATE = 0.002; // 0.20% on invoice value
const GST = 0.18;

// State -> zone mapping (pickup = Delhi)
const ZONE_BY_STATE: Record<string, DtdcZone> = {
  // City
  "Delhi": "City",

  // North
  "Haryana": "North",
  "Punjab": "North",
  "Uttar Pradesh": "North",
  "Uttarakhand": "North",
  "Himachal Pradesh": "North",
  "Rajasthan": "North",
  "Chandigarh": "North",

  // Metro-to-Metro
  "Maharashtra": "Metro",
  "Karnataka": "Metro",
  "Tamil Nadu": "Metro",
  "West Bengal": "Metro",
  "Telangana": "Metro",
  "Gujarat": "Metro",

  // Special Zone (NE, J&K, Ladakh, Islands)
  "Jammu and Kashmir": "Special",
  "Ladakh": "Special",
  "Assam": "Special",
  "Arunachal Pradesh": "Special",
  "Manipur": "Special",
  "Meghalaya": "Special",
  "Mizoram": "Special",
  "Nagaland": "Special",
  "Tripura": "Special",
  "Sikkim": "Special",
  "Andaman and Nicobar Islands": "Special",
  "Lakshadweep": "Special",
};

export function getZoneForState(state: string): DtdcZone {
  return ZONE_BY_STATE[state] ?? "Rest";
}

/**
 * Calculate DTDC S/F shipping cost.
 * @param state - destination state name
 * @param weightKg - actual weight in kg
 * @param invoiceValue - order subtotal in INR (used for 0.20% FOB)
 */
export function calculateDtdcShipping(
  state: string,
  weightKg: number,
  invoiceValue: number
): { cost: number; zone: DtdcZone; base: number; billableKg: number } {
  const zone = getZoneForState(state);
  const perKg = RATE_PER_KG[zone];
  const billableKg = Math.max(MIN_BILLABLE_KG, Math.ceil(weightKg));
  const base = perKg * billableKg;
  const withFuel = base * (1 + FUEL_SURCHARGE);
  const withFob = withFuel + invoiceValue * FOB_RATE;
  const cost = Math.round(withFob * (1 + GST));
  return { cost, zone, base, billableKg };
}
