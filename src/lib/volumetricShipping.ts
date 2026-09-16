// Volumetric (dimensional) shipping cost calculator.
// Volumetric weight (kg) = (L x W x H in cm) / 5000
// Slabs: up to 0.5 kg = Rs 50, up to 1 kg = Rs 85, every additional kg = Rs 85
// A 15% fuel surcharge is applied on the slab amount.

export const VOLUMETRIC_DIVISOR = 5000;
export const FIRST_SLAB_KG = 0.5;
export const FIRST_SLAB_RATE = 50;
export const PER_KG_RATE = 85;
export const FUEL_SURCHARGE_PCT = 15;

export interface ShippingQuote {
  volumetricWeight: number;
  actualWeight: number;
  chargeableWeight: number;
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

export function costForWeight(weightKg: number): {
  slabCost: number;
  fuelSurcharge: number;
  cost: number;
  breakdown: string;
} {
  const w = Math.max(0, weightKg || 0);
  if (w <= 0) return { slabCost: 0, fuelSurcharge: 0, cost: 0, breakdown: "No weight" };

  let slabCost: number;
  let slabLabel: string;
  if (w <= FIRST_SLAB_KG) {
    slabCost = FIRST_SLAB_RATE;
    slabLabel = `Up to 500 g slab = ₹${FIRST_SLAB_RATE}`;
  } else {
    const kgSlabs = Math.ceil(w); // 1 kg = 85, 1.2 kg -> 2 slabs, etc.
    slabCost = kgSlabs * PER_KG_RATE;
    slabLabel = `${kgSlabs} kg slab${kgSlabs > 1 ? "s" : ""} × ₹${PER_KG_RATE} = ₹${slabCost}`;
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
}): ShippingQuote {
  const boxes = Math.max(1, Math.floor(params.boxes || 1));
  const volPerBox = volumetricWeightKg(params.lengthCm, params.widthCm, params.heightCm);
  const volumetricWeight = volPerBox * boxes;
  const actualWeight = Math.max(0, params.actualWeightKg || 0);
  const chargeableWeight = Math.max(volumetricWeight, actualWeight);
  const { slabCost, fuelSurcharge, cost, breakdown } = costForWeight(chargeableWeight);
  return {
    volumetricWeight: Number(volumetricWeight.toFixed(3)),
    actualWeight: Number(actualWeight.toFixed(3)),
    chargeableWeight: Number(chargeableWeight.toFixed(3)),
    slabCost,
    fuelSurcharge,
    cost,
    breakdown,
  };
}
