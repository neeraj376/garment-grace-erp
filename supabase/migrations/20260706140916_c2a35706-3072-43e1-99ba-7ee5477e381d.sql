
-- 1. Audit log for invoice deletions
CREATE TABLE public.deleted_invoices_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  store_id uuid NOT NULL,
  invoice_number text,
  customer_id uuid,
  source text,
  payment_method text,
  subtotal numeric,
  tax_amount numeric,
  discount_amount numeric,
  total_amount numeric,
  pending_amount numeric,
  delivery_cost numeric,
  status text,
  invoice_created_at timestamptz,
  invoice_created_by uuid,
  employee_id uuid,
  items jsonb,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.deleted_invoices_log TO authenticated;
GRANT ALL ON public.deleted_invoices_log TO service_role;

ALTER TABLE public.deleted_invoices_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their store's deleted invoice log"
  ON public.deleted_invoices_log FOR SELECT TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "System can insert deleted invoice log"
  ON public.deleted_invoices_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. BEFORE DELETE trigger that snapshots the invoice + items into the log
CREATE OR REPLACE FUNCTION public.log_invoice_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.deleted_invoices_log (
    invoice_id, store_id, invoice_number, customer_id, source, payment_method,
    subtotal, tax_amount, discount_amount, total_amount, pending_amount,
    delivery_cost, status, invoice_created_at, invoice_created_by, employee_id,
    items, deleted_by
  )
  VALUES (
    OLD.id, OLD.store_id, OLD.invoice_number, OLD.customer_id, OLD.source,
    OLD.payment_method, OLD.subtotal, OLD.tax_amount, OLD.discount_amount,
    OLD.total_amount, OLD.pending_amount, OLD.delivery_cost, OLD.status,
    OLD.created_at, OLD.created_by, OLD.employee_id,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(ii.*)) FROM public.invoice_items ii WHERE ii.invoice_id = OLD.id),
      '[]'::jsonb
    ),
    auth.uid()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_invoice_deletion ON public.invoices;
CREATE TRIGGER trg_log_invoice_deletion
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_deletion();

-- 3. Restrict DELETE on invoices to store owners only
DROP POLICY IF EXISTS "Store members can delete invoices" ON public.invoices;

CREATE POLICY "Only store owners can delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
