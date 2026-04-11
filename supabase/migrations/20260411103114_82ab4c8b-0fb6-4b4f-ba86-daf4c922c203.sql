
CREATE TABLE public.category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'category' CHECK (type IN ('category', 'subcategory')),
  variation text NOT NULL,
  canonical text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_category_mappings_unique ON public.category_mappings (store_id, type, lower(trim(variation)));

ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view mappings"
  ON public.category_mappings FOR SELECT TO authenticated
  USING (store_id = get_current_user_store_id());

CREATE POLICY "Store members can create mappings"
  ON public.category_mappings FOR INSERT TO authenticated
  WITH CHECK (store_id = get_current_user_store_id());

CREATE POLICY "Store members can update mappings"
  ON public.category_mappings FOR UPDATE TO authenticated
  USING (store_id = get_current_user_store_id());

CREATE POLICY "Store members can delete mappings"
  ON public.category_mappings FOR DELETE TO authenticated
  USING (store_id = get_current_user_store_id());
