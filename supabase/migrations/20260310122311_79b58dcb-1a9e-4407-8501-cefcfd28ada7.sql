
DROP VIEW public.in_stock_products;

-- Create a SECURITY DEFINER function that returns full product rows for in-stock items
CREATE OR REPLACE FUNCTION public.get_in_stock_shop_products(p_store_id uuid, p_category text DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS SETOF products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND (p_category IS NULL OR p.category = p_category)
    AND EXISTS (
      SELECT 1 FROM inventory_batches ib
      WHERE ib.product_id = p.id AND ib.quantity > 0
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_in_stock_shop_products(uuid, text, int) TO anon, authenticated;
