CREATE OR REPLACE FUNCTION public.deduct_stock_fifo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _remaining integer;
  _batch record;
  _store_id uuid;
  _invoice_status text;
BEGIN
  -- Get store_id and status from the invoice
  SELECT store_id, status INTO _store_id, _invoice_status FROM invoices WHERE id = NEW.invoice_id;

  -- Do not deduct stock for draft/pending-address invoices
  IF _invoice_status = 'pending_address' THEN
    RETURN NEW;
  END IF;

  _remaining := NEW.quantity;

  -- Loop through batches FIFO (oldest first) and deduct
  FOR _batch IN
    SELECT id, quantity
    FROM inventory_batches
    WHERE product_id = NEW.product_id
      AND store_id = _store_id
      AND quantity > 0
    ORDER BY received_at ASC, created_at ASC
  LOOP
    IF _remaining <= 0 THEN EXIT; END IF;

    IF _batch.quantity >= _remaining THEN
      UPDATE inventory_batches SET quantity = quantity - _remaining WHERE id = _batch.id;
      UPDATE invoice_items SET batch_id = _batch.id WHERE id = NEW.id;
      _remaining := 0;
    ELSE
      _remaining := _remaining - _batch.quantity;
      UPDATE inventory_batches SET quantity = 0 WHERE id = _batch.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_customer_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _customer_id uuid;
  _new_total numeric;
  _new_visits integer;
BEGIN
  _customer_id := OLD.customer_id;

  IF _customer_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO _new_total, _new_visits
  FROM invoices
  WHERE customer_id = _customer_id
    AND status NOT IN ('fully_returned', 'pending_address');

  UPDATE customers
  SET total_spent = _new_total,
      visit_count = _new_visits,
      updated_at = now()
  WHERE id = _customer_id;

  RETURN OLD;
END;
$function$;

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
  sold_agg AS (
    SELECT ii.product_id,
           COALESCE(SUM(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0)), 0)::int AS sold_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status != 'pending_address'
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
  sold_agg AS (
    SELECT ii.product_id,
           COALESCE(SUM(COALESCE(ii.quantity,0) - COALESCE(ii.returned_quantity,0)), 0)::int AS sold_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status != 'pending_address'
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

CREATE OR REPLACE FUNCTION public.get_sold_invoices_for_products(p_store_id uuid, p_product_ids uuid[])
 RETURNS TABLE(invoice_id uuid, invoice_number text, created_at timestamp with time zone, total_amount numeric, customer_id uuid, customer_name text, customer_mobile text, sold_qty integer, sold_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
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
  JOIN invoices i ON i.id = a.invoice_id AND i.store_id = p_store_id AND i.status != 'pending_address'
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE a.sold_qty > 0
  ORDER BY i.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.submit_invoice_address(p_token text, p_name text, p_phone text, p_email text, p_line1 text, p_line2 text, p_city text, p_state text, p_pincode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  r record;
BEGIN
  SELECT id, address_token_expires_at INTO r
  FROM invoices WHERE address_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;
  IF r.address_token_expires_at IS NOT NULL AND r.address_token_expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF coalesce(btrim(p_name),'') = '' OR coalesce(btrim(p_phone),'') = ''
     OR coalesce(btrim(p_line1),'') = '' OR coalesce(btrim(p_city),'') = ''
     OR coalesce(btrim(p_state),'') = '' OR coalesce(btrim(p_pincode),'') = '' THEN
    RETURN jsonb_build_object('error', 'missing_fields');
  END IF;

  UPDATE invoices
  SET shipping_name = btrim(p_name),
      shipping_phone = btrim(p_phone),
      shipping_email = NULLIF(btrim(p_email),''),
      shipping_address_line1 = btrim(p_line1),
      shipping_address_line2 = NULLIF(btrim(p_line2),''),
      shipping_city = btrim(p_city),
      shipping_state = btrim(p_state),
      shipping_pincode = btrim(p_pincode),
      status = 'completed'
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;