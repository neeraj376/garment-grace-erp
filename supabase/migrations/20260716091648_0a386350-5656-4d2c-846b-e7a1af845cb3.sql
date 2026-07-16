
CREATE TABLE public.operating_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('one_time','weekly','monthly','custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operating_costs TO authenticated;
GRANT ALL ON public.operating_costs TO service_role;

ALTER TABLE public.operating_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members manage operating_costs"
  ON public.operating_costs FOR ALL
  TO authenticated
  USING (store_id IN (SELECT p.store_id FROM public.profiles p WHERE p.user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT p.store_id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE INDEX idx_operating_costs_store_period ON public.operating_costs(store_id, period_start, period_end);

CREATE TRIGGER trg_operating_costs_updated_at
  BEFORE UPDATE ON public.operating_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated read operating cost receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'operating-cost-receipts');

CREATE POLICY "Authenticated upload operating cost receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'operating-cost-receipts');

CREATE POLICY "Authenticated update operating cost receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'operating-cost-receipts');

CREATE POLICY "Authenticated delete operating cost receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'operating-cost-receipts');
