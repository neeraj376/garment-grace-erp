
-- Allow store members to delete their own invoice returns
CREATE POLICY "Store members can delete returns"
ON public.invoice_returns
FOR DELETE
TO authenticated
USING (
  store_id IN (
    SELECT profiles.store_id FROM profiles WHERE profiles.user_id = auth.uid()
  )
);
