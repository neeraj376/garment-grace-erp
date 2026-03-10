CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(ib.quantity), 0)::integer
  FROM inventory_batches ib
  WHERE ib.product_id = p_product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stock(uuid) TO anon, authenticated;