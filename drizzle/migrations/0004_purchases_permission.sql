ALTER TABLE public.user_permissions ADD COLUMN can_purchases boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.can_manage_purchases()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
      OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = auth.uid() AND up.store_id = get_current_user_store_id() AND up.can_purchases);
$$;
DROP POLICY "Owners manage store purchases" ON public.purchases;
CREATE POLICY "Authorized users manage store purchases" ON public.purchases FOR ALL TO authenticated
USING (store_id = public.get_current_user_store_id() AND public.can_manage_purchases())
WITH CHECK (store_id = public.get_current_user_store_id() AND public.can_manage_purchases());
DROP POLICY "Owners manage purchase bills" ON storage.objects;
CREATE POLICY "Authorized users manage purchase bills" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'purchase-bills' AND (storage.foldername(name))[1] = public.get_current_user_store_id()::text AND public.can_manage_purchases())
WITH CHECK (bucket_id = 'purchase-bills' AND (storage.foldername(name))[1] = public.get_current_user_store_id()::text AND public.can_manage_purchases());