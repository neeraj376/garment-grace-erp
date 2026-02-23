
-- Create invoice_returns table to track returns
CREATE TABLE public.invoice_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  quantity_returned INTEGER NOT NULL DEFAULT 1,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_returns ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Store members can view returns"
ON public.invoice_returns FOR SELECT
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Store members can create returns"
ON public.invoice_returns FOR INSERT
WITH CHECK (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Allow updating invoices (for marking returned status)
CREATE POLICY "Store members can update invoices"
ON public.invoices FOR UPDATE
USING (store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Allow updating invoice_items (for tracking returned qty)
CREATE POLICY "Store members can update invoice items"
ON public.invoice_items FOR UPDATE
USING (invoice_id IN (SELECT invoices.id FROM invoices WHERE invoices.store_id IN (SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid())));

-- Add returned_quantity column to invoice_items
ALTER TABLE public.invoice_items ADD COLUMN returned_quantity INTEGER NOT NULL DEFAULT 0;

-- Add status column to invoices
ALTER TABLE public.invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
