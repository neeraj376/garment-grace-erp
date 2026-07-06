
CREATE OR REPLACE FUNCTION public.get_inventory_overview_paged(p_store_id uuid, p_limit integer, p_offset integer)
 RETURNS TABLE(product jsonb, total_stock integer, avg_buying_price numeric, sold_quantity integer, last_stock_added_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY p.created_at DESC, p.id
  LIMIT p_limit OFFSET p_offset;
$function$;
