-- Allow public read access to invoices by ID (for shared invoice links)
CREATE POLICY "Public can view invoices by id"
ON public.invoices
FOR SELECT
USING (true);

-- Allow public read access to invoice items for shared invoices
CREATE POLICY "Public can view invoice items"
ON public.invoice_items
FOR SELECT
USING (true);

-- Allow public read of products for invoice display
CREATE POLICY "Public can view products for invoices"
ON public.products
FOR SELECT
USING (true);

-- Allow public read of stores for invoice display
CREATE POLICY "Public can view stores for invoices"
ON public.stores
FOR SELECT
USING (true);

-- Allow public read of customers for invoice display (limited)
CREATE POLICY "Public can view customers for invoices"
ON public.customers
FOR SELECT
USING (true);