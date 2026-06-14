// DTDC Express shipping rate calculator
// Pickup: Delhi (110001). Rate row: Exp. 0-0.5kg + Exp. Add. 0.5kg.
// Surcharges: +35% fuel, +0.20% FOB on invoice value, +18% GST.

export type DtdcZone = "City" | "North" | "Metro" | "Rest" | "Special";

// Base DTDC Express rates (INR) for each zone
const BASE_RATES: Record<DtdcZone, { first: number; addl: number }> = {
  City: { first: 99, addl: 50 },
  North: { first: 210, addl: 150 },
  Metro: { first: 250, addl: 180 },
  Rest: { first: 350, addl: 250 },
  Special: { first: 420, addl: 290 },
};

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
 * Calculate DTDC shipping cost.
 * @param state - destination state name (matches checkout dropdown)
 * @param weightKg - billable weight in kg (already include any buffer)
 * @param invoiceValue - order subtotal in INR, used for 0.20% FOB
 */
export function calculateDtdcShipping(
  state: string,
  weightKg: number,
  invoiceValue: number
): { cost: number; zone: DtdcZone; base: number } {
  const zone = getZoneForState(state);
  const { first, addl } = BASE_RATES[zone];
  const billable = Math.max(0.5, weightKg);
  const addlUnits = Math.ceil((billable - 0.5) / 0.5);
  const base = first + Math.max(0, addlUnits) * addl;
  const withFuel = base * (1 + FUEL_SURCHARGE);
  const withFob = withFuel + invoiceValue * FOB_RATE;
  const cost = Math.round(withFob * (1 + GST));
  return { cost, zone, base };
}
