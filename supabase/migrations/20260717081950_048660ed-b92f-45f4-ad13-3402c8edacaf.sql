CREATE OR REPLACE FUNCTION public.get_invoice_by_address_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  s record;
BEGIN
  SELECT id, store_id, invoice_number, total_amount, address_token_expires_at,
         customer_name, customer_mobile,
         shipping_name, shipping_phone, shipping_email,
         shipping_address_line1, shipping_address_line2,
         shipping_city, shipping_state, shipping_pincode
  INTO r
  FROM invoices
  WHERE address_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF r.address_token_expires_at IS NOT NULL AND r.address_token_expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT name, logo_url INTO s FROM stores WHERE id = r.store_id;

  RETURN jsonb_build_object(
    'invoice_number', r.invoice_number,
    'total_amount', r.total_amount,
    'expires_at', r.address_token_expires_at,
    'store', jsonb_build_object('name', s.name, 'logo_url', s.logo_url),
    'shipping', jsonb_build_object(
      'name', COALESCE(NULLIF(r.shipping_name, ''), r.customer_name),
      'phone', COALESCE(NULLIF(r.shipping_phone, ''), r.customer_mobile),
      'email', r.shipping_email,
      'address_line1', r.shipping_address_line1, 'address_line2', r.shipping_address_line2,
      'city', r.shipping_city, 'state', r.shipping_state, 'pincode', r.shipping_pincode
    )
  );
END;
$$;