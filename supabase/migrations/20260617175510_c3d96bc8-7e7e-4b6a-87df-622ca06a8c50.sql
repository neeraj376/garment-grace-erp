-- 1) Hide buying_price (cost/margin) from anonymous role.
REVOKE SELECT (buying_price) ON public.products FROM anon;

-- 2) Lock down shop_visitors: shop customers (authenticated B2C users) must not read every visitor row.
DROP POLICY IF EXISTS "Authenticated users can view visitors" ON public.shop_visitors;

CREATE POLICY "Staff can view shop visitors"
ON public.shop_visitors
FOR SELECT
TO authenticated
USING (public.get_current_user_store_id() IS NOT NULL);

-- 3) shop_email_otps / shop_mobile_otps: add explicit deny policies so the linter sees coverage.
--    Edge functions use the service_role key which bypasses RLS, so behavior is unchanged.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shop_email_otps' AND policyname='Deny direct client access') THEN
    EXECUTE 'CREATE POLICY "Deny direct client access" ON public.shop_email_otps FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shop_mobile_otps' AND policyname='Deny direct client access') THEN
    EXECUTE 'CREATE POLICY "Deny direct client access" ON public.shop_mobile_otps FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
END $$;