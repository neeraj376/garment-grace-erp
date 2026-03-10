
CREATE OR REPLACE FUNCTION public.get_in_stock_product_ids(p_store_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ib.product_id
  FROM inventory_batches ib
  WHERE ib.store_id = p_store_id
  GROUP BY ib.product_id
  HAVING SUM(ib.quantity) > 0;
$$;
