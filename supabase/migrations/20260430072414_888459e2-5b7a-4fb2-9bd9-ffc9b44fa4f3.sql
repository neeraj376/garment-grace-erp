
-- Helper SECURITY DEFINER function to check if a shop_customer has any order in the current user's store
CREATE OR REPLACE FUNCTION public.shop_customer_in_user_store(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = _customer_id
      AND o.store_id = public.get_current_user_store_id()
  );
$$;

-- Replace the recursive policy on shop_customers
DROP POLICY IF EXISTS "Store members can view shop customers" ON public.shop_customers;
CREATE POLICY "Store members can view shop customers"
  ON public.shop_customers
  FOR SELECT
  TO authenticated
  USING (public.shop_customer_in_user_store(id));

-- Replace the recursive policy on shipping_addresses
DROP POLICY IF EXISTS "Store members can view shipping addresses" ON public.shipping_addresses;
CREATE POLICY "Store members can view shipping addresses"
  ON public.shipping_addresses
  FOR SELECT
  TO authenticated
  USING (public.shop_customer_in_user_store(customer_id));
