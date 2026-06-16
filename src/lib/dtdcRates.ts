// DTDC Non-Dox shipping rate calculator
// Pickup: Delhi (110001). Rate row: Non Dox per kg.
// Surcharges: +35% fuel, +0.20% FOB on invoice value, +18% GST.

export type DtdcZone = "City" | "North" | "Metro" | "Rest" | "Special";

// Non Dox per-kg rates (INR/kg). City & North not published on this row —
// fall back to the same ₹100/kg used for Metro/Rest.
const RATE_PER_KG: Record<DtdcZone, number> = {
  City: 100,
  North: 100,
  Metro: 100,
  Rest: 100,
  Special: 130,
};

const MIN_BILLABLE_KG = 1;
const FUEL_SURCHARGE = 0.35;
const FOB_RATE = 0.002; // 0.20% on invoice value
const GST = 0.18;

// State -> zone mapping (pickup = Delhi)
const ZONE_BY_STATE: Record<string, DtdcZone> = {
  "Delhi": "City",

  "Haryana": "North",
  "Punjab": "North",
  "Uttar Pradesh": "North",
  "Uttarakhand": "North",
  "Himachal Pradesh": "North",
  "Rajasthan": "North",
  "Chandigarh": "North",

  "Maharashtra": "Metro",
  "Karnataka": "Metro",
  "Tamil Nadu": "Metro",
  "West Bengal": "Metro",
  "Telangana": "Metro",
  "Gujarat": "Metro",

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
 * Calculate DTDC Non-Dox shipping cost.
 * @param state - destination state
 * @param weightKg - actual weight in kg
 * @param invoiceValue - order subtotal in INR (for 0.20% FOB)
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
