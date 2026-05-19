import { supabase } from "@/integrations/supabase/client";

export const SHOP_STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";

const PAGE_SIZE = 1000;
const MAX_PRODUCTS = 5000;

export async function fetchInStockShopProducts() {
  const products: any[] = [];

  for (let from = 0; from < MAX_PRODUCTS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_PRODUCTS - 1);
    const { data, error } = await supabase
      .rpc("get_in_stock_shop_products", {
        p_store_id: SHOP_STORE_ID,
        p_limit: MAX_PRODUCTS,
      })
      .range(from, to);

    if (error) {
      console.error("Failed to fetch shop products", error);
      break;
    }

    const page = data ?? [];
    products.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return products;
}