import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  calculateVolumetricShipping,
  FUEL_SURCHARGE_PCT,
  ORIGIN,
  RATE_CARD,
  VOLUMETRIC_DIVISOR,
  ZONE_LABELS,
  getZone,
  getZoneForPincodes,
  stateForPincode,
  type ShippingZone,
} from "@/lib/volumetricShipping";

const STATES = [
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh",
  "Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana",
  "Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry",
  "Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand",
  "West Bengal",
];

const ZONES: ShippingZone[] = ["City", "Region", "Zone", "Metro", "ROI", "Special"];

export default function ShippingCalculator() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [actualWeight, setActualWeight] = useState("");
  const [boxes, setBoxes] = useState("1");
  const [state, setState] = useState("Haryana");
  const [city, setCity] = useState("");
  const [originPin, setOriginPin] = useState(ORIGIN.pincode);
  const [destPin, setDestPin] = useState("");

  const pinZone = useMemo(() => getZoneForPincodes(originPin, destPin), [originPin, destPin]);
  const detectedZone = pinZone ?? getZone(state, city);
  const destPinState = useMemo(() => stateForPincode(destPin), [destPin]);

  const quote = useMemo(
    () =>
      calculateVolumetricShipping({
        lengthCm: parseFloat(length) || 0,
        widthCm: parseFloat(width) || 0,
        heightCm: parseFloat(height) || 0,
        actualWeightKg: parseFloat(actualWeight) || 0,
        boxes: parseInt(boxes) || 1,
        state,
        city,
        originPincode: originPin,
        destPincode: destPin,
      }),
    [length, width, height, actualWeight, boxes, state, city, originPin, destPin]
  );

  const reset = () => {
    setLength("");
    setWidth("");
    setHeight("");
    setActualWeight("");
    setBoxes("1");
    setState("Haryana");
    setCity("");
    setOriginPin(ORIGIN.pincode);
    setDestPin("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" /> Shipping Cost Calculator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pickup from {ORIGIN.city}, {ORIGIN.state} – {ORIGIN.pincode}. Volumetric weight = (Length × Width × Height) ÷ {VOLUMETRIC_DIVISOR}.
          Rates depend on the destination zone, plus {FUEL_SURCHARGE_PCT}% fuel surcharge.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Package Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="len">Length (cm)</Label>
                <Input id="len" type="number" min="0" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} placeholder="30" />
              </div>
              <div>
                <Label htmlFor="wid">Width (cm)</Label>
                <Input id="wid" type="number" min="0" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="25" />
              </div>
              <div>
                <Label htmlFor="hei">Height (cm)</Label>
                <Input id="hei" type="number" min="0" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="aw">Actual Weight (kg, optional)</Label>
                <Input id="aw" type="number" min="0" step="0.01" value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} placeholder="0.5" />
              </div>
              <div>
                <Label htmlFor="bx">Number of Boxes</Label>
                <Input id="bx" type="number" min="1" step="1" value={boxes} onChange={(e) => setBoxes(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Destination State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="city">Destination City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Gurugram" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Zone applied: <span className="font-medium text-foreground">{ZONE_LABELS[detectedZone]}</span></p>
            <Button variant="outline" onClick={reset} className="w-full">Clear</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Calculated Cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Volumetric weight</span>
              <span className="font-medium">{quote.volumetricWeight} kg</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Actual weight</span>
              <span className="font-medium">{quote.actualWeight} kg</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Chargeable weight (higher of the two)</span>
              <span className="font-medium">{quote.chargeableWeight} kg</span>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Slab cost ({quote.zone})</span>
                <span className="font-medium">₹{quote.slabCost.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fuel surcharge ({FUEL_SURCHARGE_PCT}%)</span>
                <span className="font-medium">₹{quote.fuelSurcharge.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="font-semibold">Shipping Cost</span>
                <span className="text-2xl font-bold text-primary">₹{quote.cost.toLocaleString("en-IN")}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{quote.breakdown}</p>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={quote.cost === 0}
              onClick={() => {
                navigator.clipboard.writeText(String(quote.cost));
                toast.success("Shipping cost copied");
              }}
            >
              <Copy className="h-4 w-4 mr-2" /> Copy amount
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Card (before {FUEL_SURCHARGE_PCT}% fuel surcharge)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold">Weight</th>
                {ZONES.map((z) => <th key={z} className="py-2 px-3 font-semibold text-center">{z}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-3">Up to 500 g</td>
                {ZONES.map((z) => <td key={z} className="py-2 px-3 text-center">₹{RATE_CARD[z].upto500g}</td>)}
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-3">1–5 kg (per kg)</td>
                {ZONES.map((z) => <td key={z} className="py-2 px-3 text-center">₹{RATE_CARD[z].perKg1to5}</td>)}
              </tr>
              <tr>
                <td className="py-2 pr-3">5–10 kg (per kg)</td>
                {ZONES.map((z) => <td key={z} className="py-2 px-3 text-center">₹{RATE_CARD[z].perKg5to10}</td>)}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
