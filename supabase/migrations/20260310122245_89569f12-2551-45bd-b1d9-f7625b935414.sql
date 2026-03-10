
DROP VIEW public.in_stock_products;
CREATE VIEW public.in_stock_products WITH (security_invoker=on) AS
SELECT p.*
FROM products p
WHERE p.is_active = true
AND EXISTS (
  SELECT 1 FROM inventory_batches ib
  WHERE ib.product_id = p.id
  AND ib.quantity > 0
);
