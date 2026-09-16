// Volumetric (dimensional) shipping cost calculator.
// Volumetric weight (kg) = (L x W x H in cm) / 5000
// Slabs: up to 0.5 kg = Rs 50, up to 1 kg = Rs 85, every additional kg = Rs 85

export const VOLUMETRIC_DIVISOR = 5000;
export const FIRST_SLAB_KG = 0.5;
export const FIRST_SLAB_RATE = 50;
export const PER_KG_RATE = 85;

export interface ShippingQuote {
  volumetricWeight: number;
  actualWeight: number;
  chargeableWeight: number;
  cost: number;
  breakdown: string;
}

export function volumetricWeightKg(lengthCm: number, widthCm: number, heightCm: number) {
  const l = Math.max(0, lengthCm || 0);
  const w = Math.max(0, widthCm || 0);
  const h = Math.max(0, heightCm || 0);
  return (l * w * h) / VOLUMETRIC_DIVISOR;
}

export function costForWeight(weightKg: number): { cost: number; breakdown: string } {
  const w = Math.max(0, weightKg || 0);
  if (w <= 0) return { cost: 0, breakdown: "No weight" };
  if (w <= FIRST_SLAB_KG) {
    return { cost: FIRST_SLAB_RATE, breakdown: `Up to 500 g slab = ₹${FIRST_SLAB_RATE}` };
  }
  const kgSlabs = Math.ceil(w); // 1 kg = 85, 1.2 kg -> 2 slabs, etc.
  const cost = kgSlabs * PER_KG_RATE;
  return {
    cost,
    breakdown: `${kgSlabs} kg slab${kgSlabs > 1 ? "s" : ""} × ₹${PER_KG_RATE} = ₹${cost}`,
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
  const { cost, breakdown } = costForWeight(chargeableWeight);
  return {
    volumetricWeight: Number(volumetricWeight.toFixed(3)),
    actualWeight: Number(actualWeight.toFixed(3)),
    chargeableWeight: Number(chargeableWeight.toFixed(3)),
    cost,
    breakdown,
  };
}
