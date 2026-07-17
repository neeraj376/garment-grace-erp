CREATE OR REPLACE FUNCTION public.submit_invoice_address(p_token text, p_name text, p_phone text, p_email text, p_line1 text, p_line2 text, p_city text, p_state text, p_pincode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  r record;
  _item record;
  _batch record;
  _remaining integer;
BEGIN
  SELECT id, store_id, address_token_expires_at INTO r
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

  -- Update shipping address and finalize the invoice
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

  -- Deduct stock FIFO for items that were not deducted while the invoice was pending
  FOR _item IN
    SELECT id, product_id, quantity
    FROM invoice_items
    WHERE invoice_id = r.id AND (batch_id IS NULL OR batch_id = '00000000-0000-0000-0000-000000000000')
  LOOP
    _remaining := _item.quantity;
    FOR _batch IN
      SELECT id, quantity
      FROM inventory_batches
      WHERE product_id = _item.product_id
        AND store_id = r.store_id
        AND quantity > 0
      ORDER BY received_at ASC, created_at ASC
    LOOP
      IF _remaining <= 0 THEN EXIT; END IF;
      IF _batch.quantity >= _remaining THEN
        UPDATE inventory_batches SET quantity = quantity - _remaining WHERE id = _batch.id;
        UPDATE invoice_items SET batch_id = _batch.id WHERE id = _item.id;
        _remaining := 0;
      ELSE
        _remaining := _remaining - _batch.quantity;
        UPDATE inventory_batches SET quantity = 0 WHERE id = _batch.id;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;