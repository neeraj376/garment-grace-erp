
CREATE OR REPLACE VIEW public.in_stock_products AS
SELECT p.*
FROM products p
WHERE p.is_active = true
AND EXISTS (
  SELECT 1 FROM inventory_batches ib
  WHERE ib.product_id = p.id
  AND ib.quantity > 0
);
