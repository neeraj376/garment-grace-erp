import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kwbbkvfudrzznrhoumej.supabase.co";
const SERVICE_KEY = process.env.SERVICE_KEY;
const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const W = 1260, H = 540;
const PALETTES = [
  { from: "#0F172A", to: "#1E3A8A", accent: "#F8FAFC", muted: "#94A3B8" },
  { from: "#1A1A1A", to: "#3F1D1D", accent: "#F5E6CC", muted: "#C9A87C" },
  { from: "#0C2340", to: "#2D8A9E", accent: "#F0FDFA", muted: "#A7F3D0" },
  { from: "#1F1B2E", to: "#5B2A86", accent: "#FDE68A", muted: "#C4B5FD" },
  { from: "#0D0D0D", to: "#2D2D2D", accent: "#E8B84A", muted: "#A8A29E" },
];
const escapeXml = (s) => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const pickPalette = (seed) => { let h=0; for(let i=0;i<seed.length;i++) h=(h*31+seed.charCodeAt(i))>>>0; return PALETTES[h%PALETTES.length]; };
async function fetchAsDataUrl(url){ const r=await fetch(url); if(!r.ok) return null; const ct=r.headers.get("content-type")||"image/jpeg"; const buf=Buffer.from(await r.arrayBuffer()); return `data:${ct};base64,${buf.toString("base64")}`; }

function buildSvg({name,price,mrp,size,color,category,photoDataUrl}){
  const p = pickPalette(name);
  const words = name.trim().split(/\s+/);
  const lines = []; let cur=""; const MAX=22;
  for(const w of words){ if((cur+" "+w).trim().length<=MAX){cur=(cur+" "+w).trim();} else { if(cur) lines.push(cur); cur=w; if(lines.length===1) break; } }
  if(cur && lines.length<2) lines.push(cur);
  const sub=[category,color].filter(Boolean).join(" • ");
  const priceStr=`₹${Number(price).toLocaleString("en-IN")}`;
  const mrpStr=mrp&&Number(mrp)>Number(price)?`₹${Number(mrp).toLocaleString("en-IN")}`:null;
  const sizeStr=size?`Size ${escapeXml(size)}`:null;
  const PHOTO_X=720, PHOTO_Y=30, PHOTO_W=510, PHOTO_H=480;
  const photoBlock = photoDataUrl
    ? `<defs><clipPath id="pclip"><rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="18"/></clipPath></defs>
<rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="18" fill="${p.accent}" opacity="0.06"/>
<image href="${photoDataUrl}" x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pclip)"/>
<rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="18" fill="none" stroke="${p.accent}" stroke-opacity="0.18" stroke-width="1"/>`
    : `<rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="18" fill="${p.accent}" opacity="0.08"/>`;
  const TX=70;
  const headlineSize = lines.some(l=>l.length>16)?44:54;
  const headlineY1=175; const headlineLineH=headlineSize+8;
  const headlineSvg = lines.map((l,i)=>`<text x="${TX}" y="${headlineY1+i*headlineLineH}" fill="${p.accent}" font-family="Georgia, 'Times New Roman', serif" font-size="${headlineSize}" font-weight="600">${escapeXml(l)}</text>`).join("\n");
  const subY=headlineY1+lines.length*headlineLineH+22;
  const priceLabelY=subY+60; const priceY=priceLabelY+46;
  const mrpX=TX+priceStr.length*24+12; const sizeY=priceY+46;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${p.from}"/><stop offset="100%" stop-color="${p.to}"/></linearGradient>
<radialGradient id="glow" cx="20%" cy="30%" r="60%"><stop offset="0%" stop-color="${p.accent}" stop-opacity="0.10"/><stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<line x1="${TX}" y1="115" x2="${TX+50}" y2="115" stroke="${p.muted}" stroke-width="1.5"/>
<text x="${TX+62}" y="120" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif" font-size="14" letter-spacing="4" font-weight="500">NEW ARRIVAL</text>
${headlineSvg}
${sub?`<text x="${TX}" y="${subY}" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif" font-size="14" letter-spacing="3">${escapeXml(sub.toUpperCase())}</text>`:""}
<text x="${TX}" y="${priceLabelY}" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif" font-size="13" letter-spacing="3">PRICE</text>
<text x="${TX}" y="${priceY}" fill="${p.accent}" font-family="Georgia, serif" font-size="46" font-weight="700">${priceStr}</text>
${mrpStr?`<text x="${mrpX}" y="${priceY-6}" fill="${p.muted}" font-family="Helvetica, Arial, sans-serif" font-size="18" text-decoration="line-through">${mrpStr}</text>`:""}
${sizeStr?`<rect x="${TX}" y="${sizeY}" width="${36+sizeStr.length*9}" height="30" rx="15" fill="none" stroke="${p.accent}" stroke-opacity="0.4" stroke-width="1"/>
<text x="${TX+18}" y="${sizeY+20}" fill="${p.accent}" font-family="Helvetica, Arial, sans-serif" font-size="13" letter-spacing="1.5">${sizeStr}</text>`:""}
${photoBlock}
</svg>`;
}

const items = [
  { id:"33266f6a-57bf-49e6-98f8-189f4fd25ab1", slot:1, name:"No Boundaries Blue", price:590, mrp:590, size:"3XL", color:"Blue", category:"Shirt", photo:"https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/regen-thumb-1777823630-20.png" },
  { id:"b2ca0151-8dc9-4ba2-8e53-79074b7e7ded", slot:2, name:"Oakley Green XXL", price:620, mrp:620, size:"XXL", color:"Green", category:"Shirt", photo:"https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/regen-thumb-1777823630-24.png" },
  { id:"9cb599ed-14d0-470b-95ad-53bd436bff78", slot:3, name:"SuperDry Trousers", price:490, mrp:490, size:"42", color:"Orange", category:"Trouser", photo:"https://kwbbkvfudrzznrhoumej.supabase.co/storage/v1/object/public/product-media/8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6/regen-thumb-1777823630-9.png" },
];
const ts = Date.now();
for (const it of items) {
  const photoData = await fetchAsDataUrl(it.photo);
  const svg = buildSvg({ name: it.name, price: it.price, mrp: it.mrp, size: it.size, color: it.color, category: it.category, photoDataUrl: photoData });
  const path = `banners/${STORE_ID}/regen-${it.slot}-${ts}.svg`;
  const { error } = await supabase.storage.from("product-media").upload(path, new TextEncoder().encode(svg), { contentType:"image/svg+xml", upsert:true });
  if (error) { console.error(it.slot, error); continue; }
  const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
  const { error: e2 } = await supabase.from("home_banners").update({ image_url: pub.publicUrl, updated_at: new Date().toISOString() }).eq("id", it.id);
  console.log(it.slot, pub.publicUrl, e2 || "OK");
}
