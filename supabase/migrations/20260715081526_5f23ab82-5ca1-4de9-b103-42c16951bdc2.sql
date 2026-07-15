
-- Trigram indexes for customer search (mobile/name ILIKE '%...%')
CREATE INDEX IF NOT EXISTS idx_customers_mobile_trgm ON public.customers USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON public.customers USING gin (email gin_trgm_ops);

-- Composite index to speed invoice_items aggregation per product within a store
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_invoice ON public.invoice_items (product_id, invoice_id);

-- Aggregated per-invoice sales for a given set of products in a single server-side call.
-- Replaces the chunked client-side loop that was firing 45k invoice_items queries.
CREATE OR REPLACE FUNCTION public.get_sold_invoices_for_products(
  p_store_id uuid,
  p_product_ids uuid[]
)
RETURNS TABLE(
  invoice_id uuid,
  invoice_number text,
  created_at timestamptz,
  total_amount numeric,
  customer_id uuid,
  customer_name text,
  customer_mobile text,
  sold_qty integer,
  sold_value numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
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
  )
  SELECT i.id,
         i.invoice_number,
         i.created_at,
         i.total_amount,
         i.customer_id,
         c.name,
         c.mobile,
         a.sold_qty,
         ROUND(a.sold_value::numeric, 2)
  FROM agg a
  JOIN invoices i ON i.id = a.invoice_id AND i.store_id = p_store_id
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE a.sold_qty > 0
  ORDER BY i.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_sold_invoices_for_products(uuid, uuid[]) TO authenticated, service_role;
