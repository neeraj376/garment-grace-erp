
-- Allow store members to delete their own invoices
CREATE POLICY "Store members can delete invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
);

-- Allow store members to delete their own invoice items
CREATE POLICY "Store members can delete invoice items"
ON public.invoice_items
FOR DELETE
TO authenticated
USING (
  invoice_id IN (
    SELECT invoices.id FROM invoices
    WHERE invoices.store_id IN (
      SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
    )
  )
);
