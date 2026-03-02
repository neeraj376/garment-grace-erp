import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import resvg-wasm for SVG to PNG conversion
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

let wasmInitialized = false;

async function ensureWasmInitialized() {
  if (!wasmInitialized) {
    const wasmResponse = await fetch(
      "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"
    );
    await initWasm(wasmResponse);
    wasmInitialized = true;
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const invoiceId = pathParts[pathParts.length - 1] || url.searchParams.get("id");
  const format = url.searchParams.get("format"); // "image" for PNG

  if (!invoiceId) {
    return new Response("Missing invoice ID", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch invoice with items and store info
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      invoice_number, total_amount, created_at, subtotal, tax_amount, discount_amount, payment_method,
      stores!invoices_store_id_fkey(name, logo_url, address, phone, gst_number),
      customers!invoices_customer_id_fkey(name, mobile)
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return new Response("Invoice not found", { status: 404 });
  }

  // Fetch invoice items with product names
  const { data: items } = await supabase
    .from("invoice_items")
    .select("quantity, unit_price, total, tax_amount, products!invoice_items_product_id_fkey(name, sku)")
    .eq("invoice_id", invoiceId);

  const storeName = (invoice.stores as any)?.name || "Store";
  const storeAddress = (invoice.stores as any)?.address || "";
  const storePhone = (invoice.stores as any)?.phone || "";
  const storeGst = (invoice.stores as any)?.gst_number || "";
  const invoiceNumber = invoice.invoice_number || "Invoice";
  const totalAmount = invoice.total_amount ? `₹${Number(invoice.total_amount).toLocaleString("en-IN")}` : "";
  const customerName = (invoice.customers as any)?.name || "Customer";
  const customerMobile = (invoice.customers as any)?.mobile || "";
  const date = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  // If format=image, generate a PNG invoice image
  if (format === "image") {
    const invoiceItems = (items || []).map((item: any) => ({
      name: item.products?.name || "Product",
      sku: item.products?.sku || "",
      qty: item.quantity,
      price: Number(item.unit_price),
      total: Number(item.total),
    }));

    const svgImage = generateInvoiceSVG({
      storeName,
      storeAddress,
      storePhone,
      storeGst,
      invoiceNumber,
      date,
      customerName,
      customerMobile,
      items: invoiceItems,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      discount: Number(invoice.discount_amount),
      total: Number(invoice.total_amount),
      paymentMethod: invoice.payment_method,
    });

    // Convert SVG to PNG using resvg-wasm
    try {
      await ensureWasmInitialized();
      const resvg = new Resvg(svgImage, {
        fitTo: { mode: "width" as const, value: 600 },
      });
      const renderResult = resvg.render();
      const pngBuffer = renderResult.asPng();

      return new Response(pngBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      console.error("PNG conversion failed, falling back to SVG:", err);
      // Fallback to SVG if PNG conversion fails
      return new Response(svgImage, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Default: OG HTML for link previews
  const redirectUrl = `https://garment-grace-erp.lovable.app/invoice/${invoiceId}`;
  const title = `${invoiceNumber} - ${storeName}`;
  const description = `Invoice for ${customerName} | ${totalAmount} | ${date}`;
  const ogImageUrl = `${supabaseUrl}/functions/v1/invoice-og/${invoiceId}?format=image`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:width" content="600" />
  <meta property="og:image:height" content="800" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <p>Redirecting to invoice...</p>
  <script>window.location.href="${escapeJs(redirectUrl)}";</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

interface InvoiceData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeGst: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerMobile: string;
  items: { name: string; sku: string; qty: number; price: number; total: number }[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paymentMethod: string;
}

function generateInvoiceSVG(data: InvoiceData): string {
  const maxItems = 10;
  const displayItems = data.items.slice(0, maxItems);
  const itemRowHeight = 28;
  const headerHeight = 220;
  const itemsHeight = displayItems.length * itemRowHeight + 40;
  const footerHeight = 160;
  const totalHeight = headerHeight + itemsHeight + footerHeight;
  const width = 600;

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  let itemRows = "";
  displayItems.forEach((item, i) => {
    const y = headerHeight + 40 + i * itemRowHeight;
    const bg = i % 2 === 0 ? `<rect x="20" y="${y - 16}" width="560" height="${itemRowHeight}" fill="#f8f9fa" rx="2"/>` : "";
    itemRows += `
      ${bg}
      <text x="30" y="${y}" font-size="12" fill="#333" font-family="Arial, sans-serif">${escapeHtml(item.name.substring(0, 28))}</text>
      <text x="340" y="${y}" font-size="12" fill="#555" font-family="Arial, sans-serif" text-anchor="middle">${item.qty}</text>
      <text x="430" y="${y}" font-size="12" fill="#555" font-family="Arial, sans-serif" text-anchor="end">${formatCurrency(item.price)}</text>
      <text x="560" y="${y}" font-size="12" fill="#333" font-family="Arial, sans-serif" text-anchor="end" font-weight="600">${formatCurrency(item.total)}</text>
    `;
  });

  if (data.items.length > maxItems) {
    const y = headerHeight + 40 + displayItems.length * itemRowHeight;
    itemRows += `<text x="300" y="${y}" font-size="11" fill="#888" font-family="Arial, sans-serif" text-anchor="middle">... and ${data.items.length - maxItems} more items</text>`;
  }

  const summaryY = headerHeight + itemsHeight + 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
  <defs>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${totalHeight}" fill="white" rx="12"/>
  <rect width="${width}" height="8" fill="url(#headerGrad)" rx="12" ry="12"/>
  <rect x="0" y="4" width="${width}" height="4" fill="url(#headerGrad)"/>
  
  <!-- Store Header -->
  <text x="300" y="45" font-size="20" font-weight="700" fill="#1a1a2e" font-family="Arial, sans-serif" text-anchor="middle">${escapeHtml(data.storeName)}</text>
  ${data.storeAddress ? `<text x="300" y="65" font-size="10" fill="#666" font-family="Arial, sans-serif" text-anchor="middle">${escapeHtml(data.storeAddress.substring(0, 70))}</text>` : ""}
  ${data.storePhone ? `<text x="300" y="80" font-size="10" fill="#666" font-family="Arial, sans-serif" text-anchor="middle">Ph: ${escapeHtml(data.storePhone)}</text>` : ""}
  ${data.storeGst ? `<text x="300" y="95" font-size="10" fill="#666" font-family="Arial, sans-serif" text-anchor="middle">GSTIN: ${escapeHtml(data.storeGst)}</text>` : ""}
  
  <!-- Divider -->
  <line x1="20" y1="105" x2="580" y2="105" stroke="#e0e0e0" stroke-width="1"/>
  
  <!-- Invoice Info -->
  <text x="30" y="130" font-size="14" font-weight="700" fill="#1a1a2e" font-family="Arial, sans-serif">INVOICE</text>
  <text x="30" y="148" font-size="11" fill="#555" font-family="Arial, sans-serif">${escapeHtml(data.invoiceNumber)}</text>
  <text x="30" y="165" font-size="11" fill="#555" font-family="Arial, sans-serif">Date: ${escapeHtml(data.date)}</text>
  
  <text x="570" y="130" font-size="11" fill="#555" font-family="Arial, sans-serif" text-anchor="end">Customer: ${escapeHtml(data.customerName)}</text>
  ${data.customerMobile ? `<text x="570" y="148" font-size="11" fill="#555" font-family="Arial, sans-serif" text-anchor="end">Mobile: ${escapeHtml(data.customerMobile)}</text>` : ""}
  <text x="570" y="165" font-size="11" fill="#555" font-family="Arial, sans-serif" text-anchor="end">Payment: ${escapeHtml(data.paymentMethod.toUpperCase())}</text>
  
  <!-- Divider -->
  <line x1="20" y1="180" x2="580" y2="180" stroke="#e0e0e0" stroke-width="1"/>
  
  <!-- Items Header -->
  <rect x="20" y="188" width="560" height="24" fill="#1a1a2e" rx="4"/>
  <text x="30" y="${headerHeight - 12}" font-size="11" fill="white" font-weight="600" font-family="Arial, sans-serif">ITEM</text>
  <text x="340" y="${headerHeight - 12}" font-size="11" fill="white" font-weight="600" font-family="Arial, sans-serif" text-anchor="middle">QTY</text>
  <text x="430" y="${headerHeight - 12}" font-size="11" fill="white" font-weight="600" font-family="Arial, sans-serif" text-anchor="end">PRICE</text>
  <text x="560" y="${headerHeight - 12}" font-size="11" fill="white" font-weight="600" font-family="Arial, sans-serif" text-anchor="end">TOTAL</text>
  
  <!-- Items -->
  ${itemRows}
  
  <!-- Summary -->
  <line x1="350" y1="${summaryY}" x2="580" y2="${summaryY}" stroke="#e0e0e0" stroke-width="1"/>
  <text x="400" y="${summaryY + 22}" font-size="11" fill="#666" font-family="Arial, sans-serif">Subtotal:</text>
  <text x="560" y="${summaryY + 22}" font-size="11" fill="#333" font-family="Arial, sans-serif" text-anchor="end">${formatCurrency(data.subtotal)}</text>
  
  <text x="400" y="${summaryY + 42}" font-size="11" fill="#666" font-family="Arial, sans-serif">Tax:</text>
  <text x="560" y="${summaryY + 42}" font-size="11" fill="#333" font-family="Arial, sans-serif" text-anchor="end">${formatCurrency(data.taxAmount)}</text>
  
  ${data.discount > 0 ? `
  <text x="400" y="${summaryY + 62}" font-size="11" fill="#666" font-family="Arial, sans-serif">Discount:</text>
  <text x="560" y="${summaryY + 62}" font-size="11" fill="#d32f2f" font-family="Arial, sans-serif" text-anchor="end">-${formatCurrency(data.discount)}</text>
  ` : ""}
  
  <rect x="380" y="${summaryY + (data.discount > 0 ? 70 : 50)}" width="200" height="30" fill="#1a1a2e" rx="6"/>
  <text x="400" y="${summaryY + (data.discount > 0 ? 90 : 70)}" font-size="13" fill="white" font-weight="700" font-family="Arial, sans-serif">TOTAL:</text>
  <text x="560" y="${summaryY + (data.discount > 0 ? 90 : 70)}" font-size="13" fill="white" font-weight="700" font-family="Arial, sans-serif" text-anchor="end">${formatCurrency(data.total)}</text>
  
  <!-- Footer -->
  <text x="300" y="${totalHeight - 20}" font-size="9" fill="#aaa" font-family="Arial, sans-serif" text-anchor="middle">Generated by Garment Grace ERP</text>
</svg>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
