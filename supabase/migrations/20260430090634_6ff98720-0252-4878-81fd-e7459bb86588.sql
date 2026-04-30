CREATE POLICY "Store members can update order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (order_id IN (
  SELECT orders.id FROM orders
  WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
))
WITH CHECK (order_id IN (
  SELECT orders.id FROM orders
  WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));