
-- Fix: restrict store creation to authenticated users only
DROP POLICY "Users can create store" ON public.stores;
CREATE POLICY "Authenticated users can create store" ON public.stores FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);
