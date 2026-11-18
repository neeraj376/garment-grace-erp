DROP POLICY IF EXISTS "Public can view products for invoices" ON public.products;
CREATE POLICY "Public can view active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "System can insert deleted invoice log" ON public.deleted_invoices_log;

DROP POLICY IF EXISTS "Authenticated read operating cost receipts" ON storage.objects;
CREATE POLICY "Store members read operating cost receipts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'operating-cost-receipts' AND (storage.foldername(name))[1] = public.get_current_user_store_id()::text);