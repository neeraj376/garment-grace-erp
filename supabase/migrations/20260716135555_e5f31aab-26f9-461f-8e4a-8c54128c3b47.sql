
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS shipping_email text,
  ADD COLUMN IF NOT EXISTS address_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS address_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_address_token ON public.invoices(address_token);

-- Public read via token (safe subset)
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
      'name', r.shipping_name, 'phone', r.shipping_phone, 'email', r.shipping_email,
      'address_line1', r.shipping_address_line1, 'address_line2', r.shipping_address_line2,
      'city', r.shipping_city, 'state', r.shipping_state, 'pincode', r.shipping_pincode
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_invoice_address(
  p_token text,
  p_name text,
  p_phone text,
  p_email text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      shipping_pincode = btrim(p_pincode)
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_address_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_invoice_address(text, text, text, text, text, text, text, text, text) TO anon, authenticated;
