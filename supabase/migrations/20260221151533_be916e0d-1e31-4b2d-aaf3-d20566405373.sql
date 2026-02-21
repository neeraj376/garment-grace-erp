
-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Also re-grant explicitly to ensure it sticks
GRANT ALL ON public.stores TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.store_settings TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoice_items TO authenticated;
GRANT ALL ON public.inventory_batches TO authenticated;
GRANT ALL ON public.employees TO authenticated;
GRANT ALL ON public.loyalty_transactions TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
