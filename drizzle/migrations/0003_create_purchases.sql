CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor_name text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  gst_applicable boolean NOT NULL DEFAULT false,
  total_cost numeric NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  bill_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage store purchases" ON public.purchases FOR ALL TO authenticated
USING (store_id = public.get_current_user_store_id() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'))
WITH CHECK (store_id = public.get_current_user_store_id() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));
CREATE INDEX purchases_store_date_idx ON public.purchases(store_id, purchase_date DESC);
CREATE POLICY "Owners manage purchase bills" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'purchase-bills' AND (storage.foldername(name))[1] = public.get_current_user_store_id()::text AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'))
WITH CHECK (bucket_id = 'purchase-bills' AND (storage.foldername(name))[1] = public.get_current_user_store_id()::text AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));