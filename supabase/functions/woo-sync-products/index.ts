import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wooUrl = Deno.env.get("WOO_STORE_URL")!;
    const wooKey = Deno.env.get("WOO_CONSUMER_KEY")!;
    const wooSecret = Deno.env.get("WOO_CONSUMER_SECRET")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { store_id, direction = "pull" } = await req.json();

    if (!store_id) throw new Error("store_id is required");

    const cleanUrl = wooUrl.replace(/\/$/, "").replace(/\/(shop|store|product)$/i, "");
    const wooBase = `${cleanUrl}/wp-json/wc/v3`;
    const authHeader = "Basic " + btoa(`${wooKey}:${wooSecret}`);

    if (direction === "pull") {
      // Pull products from WooCommerce into local DB
      let page = 1;
      let imported = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(`${wooBase}/products?page=${page}&per_page=50`, {
          headers: { Authorization: authHeader },
        });
        if (!res.ok) throw new Error(`WooCommerce API error: ${res.status} ${await res.text()}`);

        const wooProducts = await res.json();
        if (wooProducts.length === 0) { hasMore = false; break; }

        for (const wp of wooProducts) {
          const sku = wp.sku || `WOO-${wp.id}`;
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("store_id", store_id)
            .eq("sku", sku)
            .maybeSingle();

          const productData = {
            store_id,
            sku,
            name: wp.name,
            selling_price: parseFloat(wp.price || wp.regular_price || "0"),
            mrp: wp.regular_price ? parseFloat(wp.regular_price) : null,
            category: wp.categories?.[0]?.name || null,
            photo_url: wp.images?.[0]?.src || null,
            is_active: wp.status === "publish",
            tax_rate: wp.tax_class === "zero-rate" ? 0 : 18,
          };

          if (existing) {
            await supabase.from("products").update(productData).eq("id", existing.id);
          } else {
            await supabase.from("products").insert(productData);
          }
          imported++;
        }
        page++;
      }

      // Update last sync timestamp
      await supabase
        .from("woocommerce_config")
        .update({ last_product_sync: new Date().toISOString() })
        .eq("store_id", store_id);

      return new Response(JSON.stringify({ success: true, imported }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (direction === "push") {
      // Push local products to WooCommerce
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store_id)
        .eq("is_active", true);

      // Fetch all existing WooCommerce categories
      let allWooCategories: any[] = [];
      let catPage = 1;
      let catHasMore = true;
      while (catHasMore) {
        const catRes = await fetch(`${wooBase}/products/categories?page=${catPage}&per_page=100`, {
          headers: { Authorization: authHeader },
        });
        const cats = await catRes.json();
        if (!Array.isArray(cats) || cats.length === 0) { catHasMore = false; break; }
        allWooCategories = allWooCategories.concat(cats);
        catPage++;
      }

      // Helper to find or create a WooCommerce category
      const categoryCache = new Map<string, number>();
      for (const c of allWooCategories) {
        categoryCache.set(c.name.toLowerCase(), c.id);
      }

      const getOrCreateCategory = async (name: string, parentId?: number): Promise<number> => {
        const key = parentId ? `${parentId}:${name.toLowerCase()}` : name.toLowerCase();
        if (categoryCache.has(key)) return categoryCache.get(key)!;
        // Also check without parent key for top-level
        if (!parentId && categoryCache.has(name.toLowerCase())) return categoryCache.get(name.toLowerCase())!;

        const body: any = { name };
        if (parentId) body.parent = parentId;
        const res = await fetch(`${wooBase}/products/categories`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const created = await res.json();
        if (created.id) {
          categoryCache.set(key, created.id);
          return created.id;
        }
        // If creation failed because it exists, try to find it
        if (created.code === "term_exists" && created.data?.resource_id) {
          categoryCache.set(key, created.data.resource_id);
          return created.data.resource_id;
        }
        console.warn(`Failed to create category "${name}":`, JSON.stringify(created));
        return 0;
      };

      let pushed = 0;
      for (const p of products || []) {
        // Build categories array
        const categories: { id: number }[] = [];
        if (p.category) {
          const catId = await getOrCreateCategory(p.category);
          if (catId) {
            categories.push({ id: catId });
            // Subcategory as child of category
            if (p.subcategory) {
              const subId = await getOrCreateCategory(p.subcategory, catId);
              if (subId) categories.push({ id: subId });
            }
          }
        }

        const wooProduct: any = {
          name: p.name,
          sku: p.sku,
          regular_price: String(p.mrp || p.selling_price),
          sale_price: String(p.selling_price),
          status: "publish",
          manage_stock: true,
        };
        if (categories.length > 0) wooProduct.categories = categories;

        // Add size and color as product attributes
        const attributes: any[] = [];
        if (p.size) {
          attributes.push({
            name: "Size",
            position: 0,
            visible: true,
            options: [p.size],
          });
        }
        if (p.color) {
          attributes.push({
            name: "Color",
            position: 1,
            visible: true,
            options: [p.color],
          });
        }
        if (attributes.length > 0) wooProduct.attributes = attributes;

        // Add images from photo_url (JSON array or single URL)
        if (p.photo_url) {
          let photoUrls: string[] = [];
          try {
            const parsed = JSON.parse(p.photo_url);
            if (Array.isArray(parsed)) photoUrls = parsed;
            else photoUrls = [p.photo_url];
          } catch {
            photoUrls = [p.photo_url];
          }
          if (photoUrls.length > 0) {
            wooProduct.images = photoUrls.map((src: string, i: number) => ({
              src,
              position: i,
            }));
          }
        }

        // Add video URL in short description if available
        if (p.video_url) {
          wooProduct.short_description = `<video src="${p.video_url}" controls style="max-width:100%"></video>`;
        }

        // Check if product exists in WooCommerce by SKU
        const searchRes = await fetch(`${wooBase}/products?sku=${encodeURIComponent(p.sku)}`, {
          headers: { Authorization: authHeader },
        });
        const searchResults = await searchRes.json();

        if (Array.isArray(searchResults) && searchResults.length > 0) {
          await fetch(`${wooBase}/products/${searchResults[0].id}`, {
            method: "PUT",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(wooProduct),
          });
        } else {
          await fetch(`${wooBase}/products`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify(wooProduct),
          });
        }
        pushed++;
        console.log(`Pushed ${p.sku} (${p.name}) with categories: ${JSON.stringify(categories)}`);
      }

      await supabase
        .from("woocommerce_config")
        .update({ last_product_sync: new Date().toISOString() })
        .eq("store_id", store_id);

      return new Response(JSON.stringify({ success: true, pushed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid direction. Use 'pull' or 'push'.");
  } catch (error) {
    console.error("woo-sync-products error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
