CREATE POLICY "Store members can create order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (order_id IN (
  SELECT orders.id FROM orders
  WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));