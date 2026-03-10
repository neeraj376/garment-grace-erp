-- Allow store members to delete orders
CREATE POLICY "Store members can delete orders"
ON public.orders
FOR DELETE
TO authenticated
USING (store_id IN (
  SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
));

-- Allow store members to delete order items (cascade cleanup)
CREATE POLICY "Store members can delete order items"
ON public.order_items
FOR DELETE
TO authenticated
USING (order_id IN (
  SELECT orders.id FROM orders WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));