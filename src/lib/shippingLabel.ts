// Code 128 (subset B) barcode -> inline SVG string, plus a DTDC-style 4x6 shipping label builder.

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
  consignee: {
    name: string;
    phone: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

const SHIPPER = {
  name: "Originee",
  line1: "I-132, Sector 50, South City 2",
  line2: "Gurugram, Haryana — 122018",
  phone: "+91 93109 04557, +91 88828 66833",
  pincode: "122018",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** DTDC-style 4x6in shipping label (destination pincode block, AWB barcode, routing strip). */
export function buildDtdcLabelHtml(d: DtdcLabelData): string {
  const awb = (d.awb || "").trim();
  const courier = d.courier || (awb ? "DTDC" : "");
  const service = d.serviceType || "B2C SMART EXPRESS";
  const pin = d.consignee.pincode || "";
  const awbBarcode = awb ? code128Svg(awb, { height: 58 }) : "";
  const refBarcode = code128Svg(d.referenceNo, { height: 34, moduleWidth: 1.1 });

  return `
  <div style="width:4in;height:6in;border:2px solid #000;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;line-height:1.2;overflow:hidden;display:flex;flex-direction:column">
    <div style="display:flex;border-bottom:2px solid #000">
      <div style="flex:1;padding:5px 7px">
        <div style="font-size:17px;font-weight:800;letter-spacing:1px">${esc(courier || "COURIER")}</div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase">${esc(service)}</div>
      </div>
      <div style="width:1.35in;border-left:2px solid #000;padding:4px 6px;text-align:center">
        <div style="font-size:8px;font-weight:700;color:#333">DESTINATION PIN</div>
        <div style="font-size:21px;font-weight:800;letter-spacing:1px">${esc(pin || "—")}</div>
      </div>
    </div>

    <div style="text-align:center;padding:5px 7px;border-bottom:2px solid #000">
      ${awbBarcode || `<div style="font-size:11px;padding:16px 0;font-weight:700">AWB NOT ASSIGNED</div>`}
      <div style="font-size:13px;font-weight:800;font-family:'Courier New',monospace;letter-spacing:2px;margin-top:2px">${esc(awb || "—")}</div>
    </div>

    <div style="display:flex;border-bottom:1px solid #000;font-size:9px">
      <div style="flex:1;padding:3px 6px;border-right:1px solid #000"><b>Mode:</b> ${esc(d.paymentMode || "PREPAID")}</div>
      <div style="flex:1;padding:3px 6px;border-right:1px solid #000"><b>Pcs:</b> ${esc(d.pieces ?? 1)}</div>
      <div style="flex:1;padding:3px 6px"><b>Wt:</b> ${esc((d.weightKg ?? 0.5).toFixed ? (d.weightKg ?? 0.5).toFixed(2) : d.weightKg)} kg</div>
    </div>

    <div style="padding:5px 7px;border-bottom:1px solid #000;flex:1">
      <div style="font-size:8px;font-weight:700;color:#444;letter-spacing:.5px">CONSIGNEE</div>
      <div style="font-size:13px;font-weight:800">${esc(d.consignee.name)}</div>
      <div style="font-size:10.5px">${esc(d.consignee.line1 || "")}</div>
      ${d.consignee.line2 ? `<div style="font-size:10.5px">${esc(d.consignee.line2)}</div>` : ""}
      <div style="font-size:10.5px;font-weight:700">${esc([d.consignee.city, d.consignee.state].filter(Boolean).join(", "))} ${pin ? "— " + esc(pin) : ""}</div>
      <div style="font-size:10.5px;margin-top:2px"><b>Ph:</b> ${esc(d.consignee.phone)}</div>
    </div>

    <div style="padding:4px 7px;border-bottom:1px solid #000">
      <div style="font-size:8px;font-weight:700;color:#444;letter-spacing:.5px">SHIPPER / RETURN ADDRESS</div>
      <div style="font-size:10px;font-weight:700">${SHIPPER.name}</div>
      <div style="font-size:9.5px">${SHIPPER.line1}</div>
      <div style="font-size:9.5px">${SHIPPER.line2}</div>
      <div style="font-size:9.5px">Ph: ${SHIPPER.phone}</div>
    </div>

    <div style="display:flex;align-items:center;padding:4px 7px;gap:8px">
      <div style="flex:1">
        <div style="font-size:8px;font-weight:700;color:#444">REFERENCE NO</div>
        ${refBarcode}
        <div style="font-size:9.5px;font-family:'Courier New',monospace;font-weight:700">${esc(d.referenceNo)}</div>
      </div>
      <div style="text-align:right;font-size:9px">
        <div><b>Date:</b> ${esc(d.date)}</div>
        <div><b>Origin:</b> ${SHIPPER.pincode}</div>
      </div>
    </div>
  </div>`;
}
