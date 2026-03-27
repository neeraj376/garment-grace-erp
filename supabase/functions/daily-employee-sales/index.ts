import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
    const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");

    if (!WHATSAPP_API_KEY || !WHATSAPP_API_URL) {
      throw new Error("WhatsApp API credentials not configured");
    }

    // Get today's date range in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayStart = new Date(istNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(istNow);
    todayEnd.setHours(23, 59, 59, 999);

    // Convert back to UTC for query
    const utcStart = new Date(todayStart.getTime() - istOffset).toISOString();
    const utcEnd = new Date(todayEnd.getTime() - istOffset).toISOString();

    // Get all stores
    const { data: stores } = await supabaseAdmin.from("stores").select("id, name");
    if (!stores?.length) {
      return new Response(JSON.stringify({ success: true, message: "No stores" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messagesSent = 0;

    for (const store of stores) {
      // Get active employees with phone numbers for this store
      const { data: employees } = await supabaseAdmin
        .from("employees")
        .select("id, name, phone")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .not("phone", "is", null);

      if (!employees?.length) continue;

      // Get today's invoices for this store
      const { data: invoices } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, total_amount, employee_id, created_at")
        .eq("store_id", store.id)
        .gte("created_at", utcStart)
        .lte("created_at", utcEnd);

      if (!invoices?.length) continue;

      for (const emp of employees) {
        if (!emp.phone) continue;

        // Filter invoices for this employee
        const empInvoices = invoices.filter((inv) => inv.employee_id === emp.id);
        const totalSales = empInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
        const invoiceCount = empInvoices.length;

        if (invoiceCount === 0) continue;

        // Clean phone
        let cleanPhone = emp.phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
        if (!cleanPhone.startsWith("+")) cleanPhone = "+91" + cleanPhone;
        const phoneNumber = cleanPhone.replace("+", "");

        const todayDate = istNow.toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
        });

        // Send WhatsApp text message
        const payload = {
          countryCode: phoneNumber.substring(0, 2),
          phoneNumber: phoneNumber.substring(2),
          callbackData: `employee_sales_${emp.id}`,
          type: "Text",
          body: `🧾 *Daily Sales Summary*\n\nHi ${emp.name},\n\n📅 Date: ${todayDate}\n🏪 Store: ${store.name}\n📊 Invoices: ${invoiceCount}\n💰 Total Sales: ₹${totalSales.toLocaleString("en-IN")}\n\nKeep up the great work! 👏\n\n— Originee`,
        };

        try {
          const response = await fetch(WHATSAPP_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${WHATSAPP_API_KEY}`,
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            messagesSent++;
            console.log(`Sent sales summary to ${emp.name} (${emp.phone}): ${invoiceCount} invoices, ₹${totalSales}`);
          } else {
            const errData = await response.json();
            console.error(`Failed to send to ${emp.name}:`, errData);
          }
        } catch (sendErr) {
          console.error(`Error sending to ${emp.name}:`, sendErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, messagesSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("daily-employee-sales error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
