DO $$
DECLARE
  o RECORD;
  oi RECORD;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_mobile text;
BEGIN
  -- Temporarily disable FIFO trigger so this backfill does NOT re-deduct stock
  -- (razorpay-verify / payu-verify already deducted at payment time).
  ALTER TABLE public.invoice_items DISABLE TRIGGER trg_deduct_stock_on_invoice;

  FOR o IN
    SELECT ord.id, ord.order_number, ord.created_at, ord.store_id,
           ord.subtotal, ord.tax_amount, ord.discount_amount, ord.total_amount,
           ord.payment_method, ord.courier_name, ord.tracking_number,
           sc.name AS cust_name, sc.phone AS cust_phone, sc.email AS cust_email
    FROM public.orders ord
    JOIN public.shop_customers sc ON sc.id = ord.customer_id
    WHERE ord.payment_status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.notes LIKE '%' || ord.order_number || '%'
      )
  LOOP
    -- Normalize phone (last 10 digits) for customer match
    v_mobile := RIGHT(REGEXP_REPLACE(COALESCE(o.cust_phone,''), '[^0-9]', '', 'g'), 10);
    IF v_mobile = '' THEN v_mobile := COALESCE(o.cust_phone, 'unknown'); END IF;

    -- Find or create customers row (store-scoped, by mobile)
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE store_id = o.store_id
      AND RIGHT(REGEXP_REPLACE(COALESCE(mobile,''), '[^0-9]', '', 'g'), 10) = v_mobile
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (store_id, mobile, name, email)
      VALUES (o.store_id, v_mobile, o.cust_name, o.cust_email)
      RETURNING id INTO v_customer_id;
    END IF;

    -- Build invoice number from order suffix (ORD-XXX -> INV-XXX); fall back to a unique one
    v_invoice_number := 'INV-' || REGEXP_REPLACE(o.order_number, '^ORD-', '');
    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = v_invoice_number) THEN
      v_invoice_number := 'INV-BF-' || REPLACE(o.id::text, '-', '');
    END IF;

    -- Insert the invoice
    INSERT INTO public.invoices (
      store_id, invoice_number, customer_id, source, payment_method,
      subtotal, tax_amount, discount_amount, total_amount, pending_amount,
      courier_name, awb_no, status, notes, created_at
    ) VALUES (
      o.store_id, v_invoice_number, v_customer_id, 'online',
      COALESCE(o.payment_method, 'razorpay'),
      COALESCE(o.subtotal, 0), COALESCE(o.tax_amount, 0),
      COALESCE(o.discount_amount, 0), COALESCE(o.total_amount, 0), 0,
      o.courier_name, o.tracking_number, 'completed',
      'Backfilled from website order ' || o.order_number, o.created_at
    )
    RETURNING id INTO v_invoice_id;

    -- Insert items (trigger disabled, so no stock deduction)
    FOR oi IN
      SELECT product_id, quantity, unit_price, tax_amount, total
      FROM public.order_items WHERE order_id = o.id
    LOOP
      INSERT INTO public.invoice_items (
        invoice_id, product_id, quantity, unit_price, tax_amount, total
      ) VALUES (
        v_invoice_id, oi.product_id, oi.quantity,
        COALESCE(oi.unit_price, 0), COALESCE(oi.tax_amount, 0),
        COALESCE(oi.total, oi.unit_price * oi.quantity)
      );
    END LOOP;
  END LOOP;

  -- Recalculate customer aggregates from the (now-larger) invoice set
  UPDATE public.customers c
  SET total_spent = sub.total_spent,
      visit_count = sub.visit_count,
      updated_at  = now()
  FROM (
    SELECT customer_id,
           COALESCE(SUM(total_amount), 0) AS total_spent,
           COUNT(*)                       AS visit_count
    FROM public.invoices
    WHERE status <> 'fully_returned' AND customer_id IS NOT NULL
    GROUP BY customer_id
  ) sub
  WHERE c.id = sub.customer_id;

  -- Re-enable the trigger
  ALTER TABLE public.invoice_items ENABLE TRIGGER trg_deduct_stock_on_invoice;
END $$;