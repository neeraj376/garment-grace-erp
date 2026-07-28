export interface DtdcServiceOption {
  id: string;
  label: string;
  eta: string;
}

export const DTDC_SERVICE_OPTIONS: DtdcServiceOption[] = [
  { id: "B2C PRIORITY", label: "B2C Priority (Air)", eta: "2-4 days" },
  { id: "B2C SMART EXPRESS", label: "B2C Smart Express (Surface)", eta: "3-6 days" },
];

export const DEFAULT_DTDC_SERVICE = "B2C PRIORITY";
