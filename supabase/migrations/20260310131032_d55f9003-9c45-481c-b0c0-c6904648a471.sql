-- Allow store members to view shipping addresses for their orders
CREATE POLICY "Store members can view shipping addresses"
ON public.shipping_addresses
FOR SELECT
TO authenticated
USING (customer_id IN (
  SELECT orders.customer_id FROM orders WHERE orders.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));