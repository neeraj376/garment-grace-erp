import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  calculateVolumetricShipping,
  FIRST_SLAB_RATE,
  FUEL_SURCHARGE_PCT,
  PER_KG_RATE,
  VOLUMETRIC_DIVISOR,
} from "@/lib/volumetricShipping";

export default function ShippingCalculator() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [actualWeight, setActualWeight] = useState("");
  const [boxes, setBoxes] = useState("1");

  const quote = useMemo(
    () =>
      calculateVolumetricShipping({
        lengthCm: parseFloat(length) || 0,
        widthCm: parseFloat(width) || 0,
        heightCm: parseFloat(height) || 0,
        actualWeightKg: parseFloat(actualWeight) || 0,
        boxes: parseInt(boxes) || 1,
      }),
    [length, width, height, actualWeight, boxes]
  );

  const reset = () => {
    setLength("");
    setWidth("");
    setHeight("");
    setActualWeight("");
    setBoxes("1");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" /> Shipping Cost Calculator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Volumetric weight = (Length × Width × Height) ÷ {VOLUMETRIC_DIVISOR}. Up to 500 g costs ₹
          {FIRST_SLAB_RATE}, then ₹{PER_KG_RATE} per kg.
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
            <div className="border-t border-border pt-3">
              <div className="flex justify-between items-baseline">
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
          <CardTitle className="text-lg">Rate Slabs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-1">
            <div className="flex justify-between border-b border-border pb-1"><span>Up to 500 g</span><span className="font-medium">₹{FIRST_SLAB_RATE}</span></div>
            <div className="flex justify-between border-b border-border pb-1"><span>Up to 1 kg</span><span className="font-medium">₹{PER_KG_RATE}</span></div>
            <div className="flex justify-between border-b border-border pb-1"><span>Up to 2 kg</span><span className="font-medium">₹{PER_KG_RATE * 2}</span></div>
            <div className="flex justify-between"><span>Each additional kg</span><span className="font-medium">+₹{PER_KG_RATE}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
