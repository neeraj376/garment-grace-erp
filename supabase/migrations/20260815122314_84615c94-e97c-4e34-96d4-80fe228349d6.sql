WITH s AS (
  SELECT ii.invoice_id,
    ROUND(SUM(ii.unit_price * GREATEST(ii.quantity - ii.returned_quantity, 0)), 2) AS net_subtotal,
    ROUND(SUM(ii.tax_amount * (GREATEST(ii.quantity - ii.returned_quantity, 0)::numeric / NULLIF(ii.quantity, 0))), 2) AS net_tax,
    ROUND(SUM(ii.total * (GREATEST(ii.quantity - ii.returned_quantity, 0)::numeric / NULLIF(ii.quantity, 0))), 2) AS net_total
  FROM public.invoice_items ii
  GROUP BY 1
)
UPDATE public.invoices i
SET subtotal = s.net_subtotal,
    tax_amount = s.net_tax,
    total_amount = s.net_total
FROM s
WHERE s.invoice_id = i.id
  AND i.status IN ('partially_returned', 'fully_returned')
  AND ABS(i.total_amount - s.net_total) > 0.5;