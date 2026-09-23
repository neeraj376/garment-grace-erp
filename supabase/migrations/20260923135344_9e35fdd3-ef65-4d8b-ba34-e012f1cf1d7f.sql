CREATE OR REPLACE FUNCTION public.get_in_stock_shop_products_page(
  p_store_id uuid,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.*
  FROM public.products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND (p_category IS NULL OR p.category = p_category)
    AND EXISTS (
      SELECT 1
      FROM public.inventory_batches ib
      WHERE ib.product_id = p.id AND ib.quantity > 0
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 1000)
  OFFSET GREATEST(p_offset, 0);
$function$;

REVOKE ALL ON FUNCTION public.get_in_stock_shop_products_page(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_in_stock_shop_products_page(uuid, text, integer, integer) TO anon, authenticated, service_role;