-- Allow store members to view shop customers who have orders in their store
CREATE POLICY "Store members can view shop customers"
ON public.shop_customers
FOR SELECT
TO authenticated
USING (id IN (
  SELECT orders.customer_id FROM orders WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));