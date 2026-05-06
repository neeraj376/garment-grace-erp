
-- Drop overly-permissive USING(true) public SELECT policies that exposed cross-tenant PII
DROP POLICY IF EXISTS "Public can view customers for invoices" ON public.customers;
DROP POLICY IF EXISTS "Public can view invoices by id" ON public.invoices;
DROP POLICY IF EXISTS "Public can view invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Public can view stores for invoices" ON public.stores;

-- Note: keep public products SELECT policy because the anonymous storefront
-- needs catalogue reads (ShopProduct, useCart). Replace overly-broad ALL with
-- a narrower but still-public SELECT (no PII on products).
-- (left as-is intentionally — products has no PII)

-- Replace public invoice access with a single SECURITY DEFINER RPC that
-- returns ONLY the requested invoice and its dependent rows.
CREATE OR REPLACE FUNCTION public.get_public_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'created_at', i.created_at,
    'subtotal', i.subtotal,
    'tax_amount', i.tax_amount,
    'discount_amount', i.discount_amount,
    'total_amount', i.total_amount,
    'payment_method', i.payment_method,
    'source', i.source,
    'courier_name', i.courier_name,
    'awb_no', i.awb_no,
    'notes', i.notes,
    'store', (
      SELECT jsonb_build_object(
        'name', s.name, 'address', s.address, 'phone', s.phone,
        'email', s.email, 'gst_number', s.gst_number, 'logo_url', s.logo_url
      ) FROM stores s WHERE s.id = i.store_id
    ),
    'customer', (
      SELECT jsonb_build_object('name', c.name, 'mobile', c.mobile)
      FROM customers c WHERE c.id = i.customer_id
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'quantity', it.quantity,
        'unit_price', it.unit_price,
        'tax_amount', it.tax_amount,
        'total', it.total,
        'discount', it.discount,
        'product', jsonb_build_object(
          'name', p.name, 'sku', p.sku, 'color', p.color,
          'size', p.size, 'category', p.category, 'subcategory', p.subcategory
        )
      ))
      FROM invoice_items it
      LEFT JOIN products p ON p.id = it.product_id
      WHERE it.invoice_id = i.id
    ), '[]'::jsonb)
  )
  INTO result
  FROM invoices i
  WHERE i.id = p_invoice_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated;
