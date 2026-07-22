
-- Rename source 'online' to 'whatsapp' for backend-created invoices.
-- Website orders live in the `orders` table (unchanged) and remain the true "Online" channel.
UPDATE public.invoices SET source = 'whatsapp' WHERE source = 'online';

-- Update the sold-invoices RPC so drill-downs distinguish backend WhatsApp invoices
-- from real website orders instead of labeling everything 'offline'.
CREATE OR REPLACE FUNCTION public.get_sold_invoices_for_products(
  p_store_id uuid,
  p_product_ids uuid[]
)
RETURNS TABLE (
  invoice_id uuid,
  source text,
  invoice_number text,
  created_at timestamptz,
  total_amount numeric,
  customer_id uuid,
  customer_name text,
  customer_mobile text,
  sold_qty int,
  sold_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Invoices (offline, whatsapp, wholesale) — use each invoice's own source
  SELECT i.id AS invoice_id,
         COALESCE(i.source, 'offline')::text AS source,
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

  -- Real online orders from the website (paid, not cancelled, not already invoiced)
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
$$;
