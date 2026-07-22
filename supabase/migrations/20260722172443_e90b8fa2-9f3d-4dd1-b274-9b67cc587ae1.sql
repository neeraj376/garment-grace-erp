CREATE OR REPLACE FUNCTION public.get_inventory_overview(p_store_id uuid)
 RETURNS TABLE(product jsonb, total_stock integer, avg_buying_price numeric, sold_quantity integer, last_stock_added_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
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
  invoice_sold_agg AS (
    SELECT ii.product_id,
           COALESCE(SUM(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0)), 0)::int AS sold_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status != 'pending_address'
    GROUP BY ii.product_id
  ),
  online_sold_agg AS (
    SELECT oi.product_id,
           COALESCE(SUM(oi.quantity), 0)::int AS sold_quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND o.payment_status = 'paid'
      AND o.status != 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.store_id = o.store_id
          AND SUBSTRING(i.invoice_number FROM 5) = SUBSTRING(o.order_number FROM 5)
          AND i.status != 'pending_address'
      )
    GROUP BY oi.product_id
  )
  SELECT to_jsonb(p.*) AS product,
         COALESCE(b.total_stock, 0)::int,
         COALESCE(b.avg_buying_price, 0)::numeric,
         COALESCE(invoice_sold_agg.sold_quantity, 0)::int + COALESCE(online_sold_agg.sold_quantity, 0)::int AS sold_quantity,
         b.last_stock_added_at
  FROM products p
  LEFT JOIN batch_agg b ON b.product_id = p.id
  LEFT JOIN invoice_sold_agg ON invoice_sold_agg.product_id = p.id
  LEFT JOIN online_sold_agg ON online_sold_agg.product_id = p.id
  WHERE p.store_id = p_store_id AND p.is_active = true
  ORDER BY p.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_overview_paged(p_store_id uuid, p_limit integer, p_offset integer)
 RETURNS TABLE(product jsonb, total_stock integer, avg_buying_price numeric, sold_quantity integer, last_stock_added_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
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
  invoice_sold_agg AS (
    SELECT ii.product_id,
           COALESCE(SUM(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0)), 0)::int AS sold_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status != 'pending_address'
    GROUP BY ii.product_id
  ),
  online_sold_agg AS (
    SELECT oi.product_id,
           COALESCE(SUM(oi.quantity), 0)::int AS sold_quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND o.payment_status = 'paid'
      AND o.status != 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.store_id = o.store_id
          AND SUBSTRING(i.invoice_number FROM 5) = SUBSTRING(o.order_number FROM 5)
          AND i.status != 'pending_address'
      )
    GROUP BY oi.product_id
  )
  SELECT to_jsonb(p.*) AS product,
         COALESCE(b.total_stock, 0)::int,
         COALESCE(b.avg_buying_price, 0)::numeric,
         COALESCE(invoice_sold_agg.sold_quantity, 0)::int + COALESCE(online_sold_agg.sold_quantity, 0)::int AS sold_quantity,
         b.last_stock_added_at
  FROM products p
  LEFT JOIN batch_agg b ON b.product_id = p.id
  LEFT JOIN invoice_sold_agg ON invoice_sold_agg.product_id = p.id
  LEFT JOIN online_sold_agg ON online_sold_agg.product_id = p.id
  WHERE p.store_id = p_store_id AND p.is_active = true
  ORDER BY p.created_at DESC, p.id
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_sold_invoices_for_products(p_store_id uuid, p_product_ids uuid[])
 RETURNS TABLE(invoice_id uuid, source text, invoice_number text, created_at timestamp with time zone, total_amount numeric, customer_id uuid, customer_name text, customer_mobile text, sold_qty integer, sold_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  -- Offline invoices
  SELECT i.id AS invoice_id,
         'offline'::text AS source,
         i.invoice_number,
         i.created_at,
         i.total_amount,
         i.customer_id,
         c.name AS customer_name,
         c.mobile AS customer_mobile,
         a.sold_qty,
         ROUND(a.sold_value::numeric, 2) AS sold_value
  FROM (
    SELECT ii.invoice_id,
           SUM(GREATEST(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0), 0))::int AS sold_qty,
           SUM(
             CASE WHEN COALESCE(ii.quantity,0) > 0
                  THEN COALESCE(ii.total,0) *
                       (GREATEST(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0), 0)::numeric
                        / ii.quantity::numeric)
                  ELSE 0 END
           ) AS sold_value
    FROM invoice_items ii
    WHERE ii.product_id = ANY(p_product_ids)
    GROUP BY ii.invoice_id
  ) a
  JOIN invoices i ON i.id = a.invoice_id AND i.store_id = p_store_id AND i.status != 'pending_address'
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE a.sold_qty > 0

  UNION ALL

  -- Online orders (paid, not cancelled, not already converted to a matching invoice)
  SELECT o.id AS invoice_id,
         'online'::text AS source,
         o.order_number AS invoice_number,
         o.created_at,
         o.total_amount,
         o.customer_id,
         sa.name AS customer_name,
         sa.phone AS customer_mobile,
         b.sold_qty,
         ROUND(b.sold_value::numeric, 2) AS sold_value
  FROM (
    SELECT oi.order_id,
           SUM(oi.quantity)::int AS sold_qty,
           SUM(oi.total) AS sold_value
    FROM order_items oi
    WHERE oi.product_id = ANY(p_product_ids)
    GROUP BY oi.order_id
  ) b
  JOIN orders o ON o.id = b.order_id AND o.store_id = p_store_id AND o.payment_status = 'paid' AND o.status != 'cancelled'
  LEFT JOIN shipping_addresses sa ON sa.id = o.shipping_address_id
  WHERE b.sold_qty > 0
    AND NOT EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.store_id = o.store_id
        AND SUBSTRING(i.invoice_number FROM 5) = SUBSTRING(o.order_number FROM 5)
        AND i.status != 'pending_address'
    )
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_online_orders_for_products(p_store_id uuid, p_product_ids uuid[])
 RETURNS TABLE(order_id uuid, order_number text, created_at timestamp with time zone, total_amount numeric, customer_id uuid, customer_name text, customer_mobile text, sold_qty integer, sold_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  WITH agg AS (
    SELECT oi.order_id,
           SUM(oi.quantity)::int AS sold_qty,
           SUM(oi.total) AS sold_value
    FROM order_items oi
    WHERE oi.product_id = ANY(p_product_ids)
    GROUP BY oi.order_id
  )
  SELECT o.id,
         o.order_number,
         o.created_at,
         o.total_amount,
         o.customer_id,
         sa.name,
         sa.phone,
         agg.sold_qty,
         ROUND(agg.sold_value::numeric, 2)
  FROM agg
  JOIN orders o ON o.id = agg.order_id AND o.store_id = p_store_id AND o.payment_status = 'paid' AND o.status != 'cancelled'
  LEFT JOIN shipping_addresses sa ON sa.id = o.shipping_address_id
  WHERE agg.sold_qty > 0
    AND NOT EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.store_id = o.store_id
        AND SUBSTRING(i.invoice_number FROM 5) = SUBSTRING(o.order_number FROM 5)
        AND i.status != 'pending_address'
    )
  ORDER BY o.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_inventory_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview_paged(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sold_invoices_for_products(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_online_orders_for_products(uuid, uuid[]) TO authenticated, service_role;
