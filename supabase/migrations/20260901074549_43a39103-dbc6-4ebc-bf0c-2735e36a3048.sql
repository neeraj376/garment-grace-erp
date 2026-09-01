CREATE OR REPLACE FUNCTION public.get_public_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'delivery_cost', COALESCE(i.delivery_cost, 0),
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
        'quantity', net_qty,
        'unit_price', it.unit_price,
        'tax_amount', ROUND(it.tax_amount * ratio, 2),
        'total', ROUND(it.total * ratio, 2),
        'discount', ROUND(COALESCE(it.discount,0) * ratio, 2),
        'product', jsonb_build_object(
          'name', p.name, 'sku', p.sku, 'color', p.color,
          'size', p.size, 'category', p.category, 'subcategory', p.subcategory
        )
      ))
      FROM invoice_items it
      LEFT JOIN products p ON p.id = it.product_id
      CROSS JOIN LATERAL (
        SELECT GREATEST(COALESCE(it.quantity,0) - COALESCE(it.returned_quantity,0), 0) AS net_qty
      ) n
      CROSS JOIN LATERAL (
        SELECT CASE WHEN COALESCE(it.quantity,0) > 0
                    THEN n.net_qty::numeric / it.quantity::numeric ELSE 0 END AS ratio
      ) r
      WHERE it.invoice_id = i.id AND n.net_qty > 0
    ), '[]'::jsonb)
  )
  INTO result
  FROM invoices i
  WHERE i.id = p_invoice_id;

  RETURN result;
END;
$function$;