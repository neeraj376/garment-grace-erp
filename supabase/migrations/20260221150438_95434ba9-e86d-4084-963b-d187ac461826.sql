
-- Drop and recreate all RLS policies as PERMISSIVE

-- STORES
DROP POLICY IF EXISTS "Authenticated users can create store" ON public.stores;
DROP POLICY IF EXISTS "Users can update their store" ON public.stores;
DROP POLICY IF EXISTS "Users can view their store" ON public.stores;

CREATE POLICY "Authenticated users can create store" ON public.stores FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their store" ON public.stores FOR SELECT TO authenticated USING (id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their store" ON public.stores FOR UPDATE TO authenticated USING (id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- PROFILES
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- STORE_SETTINGS
DROP POLICY IF EXISTS "Store members can manage settings" ON public.store_settings;
DROP POLICY IF EXISTS "Store members can update settings" ON public.store_settings;
DROP POLICY IF EXISTS "Store members can view settings" ON public.store_settings;

CREATE POLICY "Store members can view settings" ON public.store_settings FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can update settings" ON public.store_settings FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can manage settings" ON public.store_settings FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- PRODUCTS
DROP POLICY IF EXISTS "Store members can manage products" ON public.products;
DROP POLICY IF EXISTS "Store members can update products" ON public.products;
DROP POLICY IF EXISTS "Store members can view products" ON public.products;
DROP POLICY IF EXISTS "Store members can delete products" ON public.products;

CREATE POLICY "Store members can view products" ON public.products FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can manage products" ON public.products FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can update products" ON public.products FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can delete products" ON public.products FOR DELETE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- CUSTOMERS
DROP POLICY IF EXISTS "Store members can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Store members can update customers" ON public.customers;
DROP POLICY IF EXISTS "Store members can view customers" ON public.customers;

CREATE POLICY "Store members can view customers" ON public.customers FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can manage customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can update customers" ON public.customers FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- INVOICES
DROP POLICY IF EXISTS "Store members can create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Store members can view invoices" ON public.invoices;

CREATE POLICY "Store members can view invoices" ON public.invoices FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can create invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- INVOICE_ITEMS
DROP POLICY IF EXISTS "Store members can create invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Store members can view invoice items" ON public.invoice_items;

CREATE POLICY "Store members can view invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM public.invoices WHERE store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "Store members can create invoice items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid())));

-- INVENTORY_BATCHES
DROP POLICY IF EXISTS "Store members can manage batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Store members can update batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Store members can view batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Store members can delete batches" ON public.inventory_batches;

CREATE POLICY "Store members can view batches" ON public.inventory_batches FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can manage batches" ON public.inventory_batches FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can update batches" ON public.inventory_batches FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can delete batches" ON public.inventory_batches FOR DELETE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- EMPLOYEES
DROP POLICY IF EXISTS "Store members can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Store members can update employees" ON public.employees;
DROP POLICY IF EXISTS "Store members can view employees" ON public.employees;
DROP POLICY IF EXISTS "Store members can delete employees" ON public.employees;

CREATE POLICY "Store members can view employees" ON public.employees FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can manage employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can update employees" ON public.employees FOR UPDATE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can delete employees" ON public.employees FOR DELETE TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));

-- LOYALTY_TRANSACTIONS
DROP POLICY IF EXISTS "Store members can create loyalty" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Store members can view loyalty" ON public.loyalty_transactions;

CREATE POLICY "Store members can view loyalty" ON public.loyalty_transactions FOR SELECT TO authenticated USING (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Store members can create loyalty" ON public.loyalty_transactions FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT store_id FROM public.profiles WHERE user_id = auth.uid()));
