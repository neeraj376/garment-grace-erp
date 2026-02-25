import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  // Extract invoice ID from path: /invoice-og/<id>
  const pathParts = url.pathname.split("/");
  const invoiceId = pathParts[pathParts.length - 1] || url.searchParams.get("id");

  if (!invoiceId) {
    return new Response("Missing invoice ID", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch invoice data for OG tags
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      invoice_number, total_amount, created_at,
      stores!invoices_store_id_fkey(name, logo_url),
      customers!invoices_customer_id_fkey(name)
    `)
    .eq("id", invoiceId)
    .single();

  const storeName = (invoice?.stores as any)?.name || "Store";
  const logoUrl = (invoice?.stores as any)?.logo_url || "";
  const invoiceNumber = invoice?.invoice_number || "Invoice";
  const totalAmount = invoice?.total_amount ? `₹${Number(invoice.total_amount).toLocaleString("en-IN")}` : "";
  const customerName = (invoice?.customers as any)?.name || "Customer";
  const date = invoice?.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  // The actual SPA URL where the invoice renders
  const spaUrl = `${supabaseUrl.replace(".supabase.co", ".lovable.app").replace("https://kwbbkvfudrzznrhoumej", "https://garment-grace-erp")}/invoice/${invoiceId}`;
  // Fallback: use origin from referrer or a known published URL
  const redirectUrl = `https://garment-grace-erp.lovable.app/invoice/${invoiceId}`;

  const title = `${invoiceNumber} - ${storeName}`;
  const description = `Invoice for ${customerName} | ${totalAmount} | ${date}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  ${logoUrl ? `<meta property="og:image" content="${escapeHtml(logoUrl)}" />` : ""}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${logoUrl ? `<meta name="twitter:image" content="${escapeHtml(logoUrl)}" />` : ""}
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
