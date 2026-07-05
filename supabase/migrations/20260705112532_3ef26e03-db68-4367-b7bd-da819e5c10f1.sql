
-- 1) Invoicing: in-stock products with computed stock, in ONE query
CREATE OR REPLACE FUNCTION public.get_invoicing_products(p_store_id uuid)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  selling_price numeric,
  tax_rate numeric,
  category text,
  subcategory text,
  color text,
  size text,
  brand text,
  stock integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.selling_price, p.tax_rate,
         p.category, p.subcategory, p.color, p.size, p.brand,
         COALESCE(SUM(ib.quantity), 0)::int AS stock
  FROM products p
  JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
  WHERE p.store_id = p_store_id AND p.is_active = true
  GROUP BY p.id
  HAVING COALESCE(SUM(ib.quantity), 0) > 0
  ORDER BY p.created_at DESC;
$$;

-- 2) Invoicing search: trigram / ilike search with stock (in-stock only), in ONE query
CREATE OR REPLACE FUNCTION public.search_invoicing_products(p_store_id uuid, p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  selling_price numeric,
  tax_rate numeric,
  category text,
  subcategory text,
  color text,
  size text,
  brand text,
  stock integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.selling_price, p.tax_rate,
         p.category, p.subcategory, p.color, p.size, p.brand,
         COALESCE(SUM(ib.quantity), 0)::int AS stock
  FROM products p
  JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND (p.sku ILIKE '%' || p_query || '%' OR p.name ILIKE '%' || p_query || '%')
  GROUP BY p.id
  HAVING COALESCE(SUM(ib.quantity), 0) > 0
  ORDER BY p.created_at DESC
  LIMIT p_limit;
$$;

-- 3) Inventory overview: products + total_stock + avg_buying_price + sold_qty + latest_batch_date, ONE query
CREATE OR REPLACE FUNCTION public.get_inventory_overview(p_store_id uuid)
RETURNS TABLE (
  product jsonb,
  total_stock integer,
  avg_buying_price numeric,
  sold_quantity integer,
  last_stock_added_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH batch_agg AS (
    SELECT ib.product_id,
           COALESCE(SUM(ib.quantity), 0)::int AS total_stock,
           CASE WHEN SUM(ib.quantity) > 0
                THEN SUM(ib.buying_price * ib.quantity) / NULLIF(SUM(ib.quantity), 0)
                ELSE 0 END AS avg_buying_price,
           MAX(ib.received_at) AS last_stock_added_at
    FROM inventory_batches ib
    WHERE ib.store_id = p_store_id
    GROUP BY ib.product_id
  ),
  sold_agg AS (
    SELECT ii.product_id,
           COALESCE(SUM(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0)), 0)::int AS sold_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
    GROUP BY ii.product_id
  )
  SELECT to_jsonb(p.*) AS product,
         COALESCE(b.total_stock, 0)::int,
         COALESCE(b.avg_buying_price, 0)::numeric,
         COALESCE(s.sold_quantity, 0)::int,
         b.last_stock_added_at
  FROM products p
  LEFT JOIN batch_agg b ON b.product_id = p.id
  LEFT JOIN sold_agg s ON s.product_id = p.id
  WHERE p.store_id = p_store_id AND p.is_active = true
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoicing_products(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_invoicing_products(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview(uuid) TO authenticated, service_role;
