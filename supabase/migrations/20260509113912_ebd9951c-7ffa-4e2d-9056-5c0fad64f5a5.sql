-- 1. Hide buying_price from anonymous visitors (column-level grant)
-- Authenticated store members keep full access; the SECURITY DEFINER RPC
-- get_in_stock_shop_products continues to work because it runs as definer.
REVOKE SELECT (buying_price) ON public.products FROM anon;

-- 2. Lock down OTP codes: explicit deny-all for anon and authenticated.
-- Only the service role (used by edge functions) can read/write.
CREATE POLICY "Deny all direct access to otp_codes"
ON public.otp_codes
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 3. Same hardening for employee_auth_passwords.
CREATE POLICY "Deny all direct access to employee_auth_passwords"
ON public.employee_auth_passwords
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 4. Restrict invoices UPDATE policy to authenticated only.
DROP POLICY IF EXISTS "Store members can update invoices" ON public.invoices;
CREATE POLICY "Store members can update invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 5. Restrict invoice_items UPDATE policy to authenticated only.
DROP POLICY IF EXISTS "Store members can update invoice items" ON public.invoice_items;
CREATE POLICY "Store members can update invoice items"
ON public.invoice_items
FOR UPDATE
TO authenticated
USING (invoice_id IN (
  SELECT invoices.id FROM invoices
  WHERE invoices.store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
));

-- 6. Restrict invoice_returns INSERT/SELECT policies to authenticated only.
DROP POLICY IF EXISTS "Store members can create returns" ON public.invoice_returns;
CREATE POLICY "Store members can create returns"
ON public.invoice_returns
FOR INSERT
TO authenticated
WITH CHECK (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Store members can view returns" ON public.invoice_returns;
CREATE POLICY "Store members can view returns"
ON public.invoice_returns
FOR SELECT
TO authenticated
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));