// Code 128 (subset B) barcode -> inline SVG string, plus a DTDC-style 4x6 shipping label builder.
import QRCode from "qrcode";

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

export function code128Svg(value: string, opts?: { height?: number; moduleWidth?: number }): string {
  const text = (value || "").replace(/[^\x20-\x7E]/g, "");
  if (!text) return "";
  const height = opts?.height ?? 60;
  const mw = opts?.moduleWidth ?? 1.6;

  const codes: number[] = [104]; // START B
  for (const ch of text) codes.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  codes.slice(1).forEach((c, i) => { sum += c * (i + 1); });
  codes.push(sum % 103);
  codes.push(106); // STOP

  let x = 0;
  let bars = "";
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c];
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]) * mw;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">${bars}</svg>`;
}

/** Crisp, print-safe QR code (SVG string) generated synchronously. */
export function qrSvg(value: string, opts?: { size?: number; quietZone?: number }): string {
  const text = (value || "").trim();
  if (!text) return "";
  const size = opts?.size ?? 90;
  const quiet = opts?.quietZone ?? 2;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const count: number = qr.modules.size;
    const data: Uint8Array = qr.modules.data;
    const total = count + quiet * 2;
    let rects = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (data[r * count + c]) {
          rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" fill="#000"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" style="display:block"><rect width="${total}" height="${total}" fill="#fff"/>${rects}</svg>`;
  } catch {
    return "";
  }
}

export interface DtdcLabelData {
  awb?: string | null;
  courier?: string | null;
  serviceType?: string | null;
  referenceNo: string;
  date: string;
  paymentMode?: string;
  pieces?: number;
  weightKg?: number;
  declaredValue?: number;
  /** Short routing code printed in the big box, e.g. "7D" */
  routingCode?: string | null;
  originCode?: string | null;
  destinationCode?: string | null;
  productDescription?: string;
  consignee: {
    name: string;
    phone: string;
    altPhone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

const SHIPPER = {
  name: "Originee",
  line1: "I-132, Sector 50, South City 2, Gurugram 122018",
  line2: "GURGAON, PIN:122018, HARYANA, IN",
  phone: "+91 93109 04557, +91 88828 66833",
  pincode: "122018",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** DTDC official-style 4x6in shipping label. */
export function buildDtdcLabelHtml(d: DtdcLabelData): string {
  const awb = (d.awb || "").trim();
  const service = d.serviceType || "B2C SMART EXPRESS";
  const isAir = /priority|air/i.test(service);
  const mode = isAir ? "AI" : "SF";
  const pin = d.consignee.pincode || "";
  const pieces = d.pieces ?? 1;
  const weight = d.weightKg ?? 0.4 * pieces;
  const routing = (d.routingCode || awb.slice(0, 2) || "").toUpperCase();
  const bottomCode = awb ? `${awb}${String(pieces).padStart(4, "0")}${pin}` : "";
  const awbBarcode = awb ? code128Svg(awb, { height: 44, moduleWidth: 1.15 }) : "";
  const bottomBarcode = bottomCode ? code128Svg(bottomCode, { height: 52, moduleWidth: 1.0 }) : "";
  const pad = (n: number) => String(n).padStart(3, "0");

  const cell = "padding:4px 6px;box-sizing:border-box";
  const lbl = "font-size:9px;color:#111";

  return `
  <div class="label-page" style="width:99mm;height:148mm;max-height:148mm;border:1.5px solid #000;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;line-height:1.22;overflow:hidden;display:flex;flex-direction:column;color:#000;background:#fff;page-break-inside:avoid;break-inside:avoid">

    <!-- Brand strip -->
    <div style="display:flex;justify-content:flex-end;align-items:center;padding:2px 8px;border-bottom:1.5px solid #000">
      <div style="font-size:19px;font-weight:900;letter-spacing:-1px;font-style:italic">DTDC<span style="color:#d0021b">.</span></div>
    </div>

    <!-- FROM + ship meta -->
    <div style="display:flex;border-bottom:1.5px solid #000">
      <div style="flex:1;${cell};border-right:1.5px solid #000">
        <div style="font-size:10px;font-weight:700">FROM:</div>
        <div style="font-size:9.5px">${SHIPPER.name},</div>
        <div style="font-size:9.5px">${SHIPPER.line1}</div>
        <div style="font-size:9.5px">${SHIPPER.line2}</div>
      </div>
      <div style="width:1.45in;${cell};font-size:9.5px">
        <div><b>Ship Date :</b> ${esc(d.date)}</div>
        <div><b>Ship value :</b> ${esc(d.declaredValue ?? "")}</div>
        <div><b>Inv No :</b> ${esc(d.referenceNo)}</div>
        <div><b>Inv Date :</b> ${esc(d.date)}</div>
        <div style="font-weight:600">Bill Sender</div>
      </div>
    </div>

    <!-- TO + AWB barcode + routing box -->
    <div style="display:flex;border-bottom:1.5px solid #000">
      <div style="flex:1;${cell}">
        <div style="font-size:10px;font-weight:700">TO:</div>
        <div style="font-size:11px;font-weight:700">${esc(d.consignee.name)},</div>
        <div style="font-size:10px">${esc(d.consignee.line1 || "")}</div>
        ${d.consignee.line2 ? `<div style="font-size:10px">${esc(d.consignee.line2)}</div>` : ""}
        <div style="font-size:10px">Ph no.${esc(d.consignee.phone)}${d.consignee.altPhone ? ` / ${esc(d.consignee.altPhone)}` : ""}</div>
        <div style="font-size:10px;text-transform:uppercase">${esc(d.consignee.city || "")}${pin ? `, PIN:${esc(pin)}` : ""}${d.consignee.state ? `, ${esc(d.consignee.state)}, IN` : ""}</div>
        <div style="font-size:30px;font-weight:800;letter-spacing:1px;margin-top:6px">${esc(pin || "—")}</div>
      </div>
      <div style="width:1.55in;border-left:0;${cell};text-align:center">
        ${awbBarcode || `<div style="font-size:10px;font-weight:700;padding:14px 0">AWB NOT ASSIGNED</div>`}
        <div style="font-size:13px;font-weight:700;letter-spacing:1px">${esc(awb || "—")}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px">
          ${awbQr ? `<div style="width:0.72in;height:0.72in;background:#fff">${awbQr}</div>` : ""}
          <div style="border:3px solid #000;width:0.78in;height:0.72in;display:flex;align-items:center;justify-content:center">
            <span style="font-size:28px;font-weight:800;letter-spacing:1px">${esc(routing || "—")}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Service + eway -->
    <div style="display:flex;border-bottom:1.5px solid #000;font-size:12px;font-weight:700">
      <div style="flex:1;${cell}">${esc(service.replace(/\b[A-Za-z0-9]+/g, (w) => (/\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())))}</div>
      <div style="${cell};font-weight:600">E-Way Bill:</div>
    </div>

    <!-- Mode + pcs -->
    <div style="display:flex;border-bottom:1.5px solid #000;font-size:12px;font-weight:700">
      <div style="flex:1;${cell}">Mode: ${mode}</div>
      <div style="${cell}">Pcs: ${pad(pieces)} OF ${pad(pieces)}</div>
    </div>

    <!-- Product description + ORG/DST/payment -->
    <div style="display:flex;border-bottom:1.5px solid #000;flex:1">
      <div style="flex:1;${cell};border-right:1.5px solid #000">
        <div style="font-size:12px;font-weight:700">Product Description:</div>
        <div style="font-size:10px;margin-top:4px">${esc(d.productDescription || "Apparel")}</div>
      </div>
      <div style="width:1.55in;text-align:center">
        <div style="border-bottom:1.5px solid #000;padding:1px 0">
          <div style="${lbl}">ORG</div>
          <div style="font-size:17px;font-weight:700">${esc(d.originCode || SHIPPER.pincode.slice(0, 3))}</div>
        </div>
        <div style="border-bottom:1.5px solid #000;padding:1px 0">
          <div style="${lbl}">DST</div>
          <div style="font-size:17px;font-weight:700">${esc(d.destinationCode || pin.slice(0, 3) || "—")}</div>
        </div>
        <div style="padding:2px 0">
          <div style="${lbl}">${esc(d.paymentMode || "PREPAID")}</div>
          <div style="font-size:11px;font-weight:700">Don't collect money</div>
        </div>
      </div>
    </div>

    <!-- Bottom barcode -->
    <div style="text-align:center;padding:3px 8px;border-bottom:1.5px solid #000">
      ${bottomBarcode || ""}
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px">${esc(bottomCode || "—")}</div>
    </div>

    <div style="display:flex;border-bottom:1.5px solid #000;font-size:10px;font-weight:700">
      <div style="flex:1;${cell}">Ref. No: ${esc(d.referenceNo)}</div>
      <div style="${cell}">LV :</div>
    </div>

    <div style="display:flex;align-items:center;font-size:10px">
      <div style="flex:1;${cell};text-align:center;font-size:12px">Weight: ${weight.toFixed(1)}</div>
      <div style="${cell};text-align:right;font-size:9px">${esc(d.date)}</div>
    </div>
  </div>`;
}

