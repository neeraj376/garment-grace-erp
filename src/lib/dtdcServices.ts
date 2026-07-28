export interface DtdcServiceOption {
  id: string;
  label: string;
  eta: string;
}

export const DTDC_SERVICE_OPTIONS: DtdcServiceOption[] = [
  { id: "GROUND EXPRESS", label: "Ground Express (Surface)", eta: "3-6 days" },
  { id: "EXPRESS", label: "Express (Air)", eta: "2-4 days" },
  { id: "PREMIUM", label: "Premium (Priority Air)", eta: "1-3 days" },
  { id: "B2C PRIORITY", label: "B2C Priority", eta: "2-5 days" },
];

export const DEFAULT_DTDC_SERVICE = "GROUND EXPRESS";
