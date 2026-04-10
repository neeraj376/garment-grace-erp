
CREATE TABLE public.held_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  held_by uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.held_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members can view held invoices"
  ON public.held_invoices FOR SELECT TO authenticated
  USING (store_id = get_current_user_store_id());

CREATE POLICY "Store members can create held invoices"
  ON public.held_invoices FOR INSERT TO authenticated
  WITH CHECK (store_id = get_current_user_store_id());

CREATE POLICY "Store members can delete held invoices"
  ON public.held_invoices FOR DELETE TO authenticated
  USING (store_id = get_current_user_store_id());
